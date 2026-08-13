/**
 * Búsqueda híbrida: BM25 siempre, semántica cuando está disponible.
 *
 * La fusión es Reciprocal Rank Fusion (RRF). Se eligió sobre una suma ponderada
 * porque no exige normalizar escalas distintas (un puntaje BM25 y un coseno no
 * son comparables) y porque degrada bien: si el motor semántico está apagado,
 * el resultado es exactamente el de BM25.
 */
import { CORPUS, buscarLexico, coincidenciaDirecta } from './lexico'
import { buscarSemantico, estadoSemantico } from './semantica'
import { clave } from '../coip'
import type { Numeral } from '../tipos'

export { activarSemantica, alCambiarEstado, estadoSemantico, olvidarIndice, reanudarSiYaEstaLista } from './semantica'
export type { EstadoSemantico } from './semantica'
export { FUERA_DE_ALCANCE, avisoFueraDeAlcance } from './lexico'

export interface Resultado {
  numeral: Numeral
  puntaje: number
  /** De dónde salió: útil para no vender magia y para depurar. */
  origen: ('frase-exacta' | 'lexico' | 'semantico')[]
  frases: string[]
}

const K_RRF = 60

export async function buscar(consulta: string, limite = 6): Promise<Resultado[]> {
  const texto = consulta.trim()
  if (texto.length < 2) return []

  const acumulado = new Map<string, Resultado>()

  const anotar = (numeral: Numeral, puntos: number, origen: Resultado['origen'][number], frases: string[]) => {
    const k = clave(numeral)
    const previo = acumulado.get(k)
    if (previo) {
      previo.puntaje += puntos
      if (!previo.origen.includes(origen)) previo.origen.push(origen)
    } else {
      acumulado.set(k, { numeral, puntaje: puntos, origen: [origen], frases })
    }
  }

  const directa = coincidenciaDirecta(texto)
  if (directa) anotar(directa.numeral, 1, 'frase-exacta', directa.frases)

  buscarLexico(texto, 12).forEach((c, i) => {
    anotar(c.numeral, 1 / (K_RRF + i + 1), 'lexico', c.frases)
  })

  if (estadoSemantico().fase === 'listo') {
    const semanticos = await buscarSemantico(texto, 12)
    semanticos.forEach((s, i) => {
      const doc = CORPUS[s.indice]
      if (doc) anotar(doc.numeral, 1 / (K_RRF + i + 1), 'semantico', doc.frases)
    })
  }

  return [...acumulado.values()].sort((a, b) => b.puntaje - a.puntaje).slice(0, limite)
}

/** Versión sincrónica, solo léxica. Para cuando no se puede esperar un await. */
export function buscarRapido(consulta: string, limite = 6): Resultado[] {
  const directa = coincidenciaDirecta(consulta)
  const lexicos = buscarLexico(consulta, limite)
  const salida: Resultado[] = []
  if (directa) salida.push({ numeral: directa.numeral, puntaje: 1, origen: ['frase-exacta'], frases: directa.frases })
  for (const c of lexicos) {
    if (salida.some((r) => clave(r.numeral) === clave(c.numeral))) continue
    salida.push({ numeral: c.numeral, puntaje: c.puntaje, origen: ['lexico'], frases: c.frases })
  }
  return salida.slice(0, limite)
}
