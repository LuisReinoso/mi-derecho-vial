/**
 * Búsqueda léxica (BM25) sobre los numerales del COIP, enriquecida con la forma
 * en que la gente habla en la calle.
 *
 * Es el motor por defecto porque no descarga nada, responde en milisegundos y
 * funciona en un teléfono con la batería al 4% y sin señal. La búsqueda
 * semántica se suma encima, nunca la reemplaza.
 */
import sinonimosCrudo from '../../data/sinonimos_calle.json'
import { NUMERALES, clave } from '../coip'
import { tokens } from '../texto'
import type { Numeral } from '../tipos'

interface ExpresionCruda {
  articulo: string
  literal: string
  confianza: 'alta' | 'media' | 'baja'
  frases: string[]
}

interface FueraDeAlcance {
  tema: string
  referencia: string
  mensaje: string
}

const sinonimos = sinonimosCrudo as unknown as {
  expresiones: ExpresionCruda[]
  fuera_de_alcance: FueraDeAlcance[]
}

export const FUERA_DE_ALCANCE: readonly FueraDeAlcance[] = sinonimos.fuera_de_alcance

export interface Documento {
  numeral: Numeral
  /** Frases de calle asociadas a este numeral. Se muestran como "también conocido como". */
  frases: string[]
  confianza: 'alta' | 'media' | 'baja' | null
  tf: Map<string, number>
  longitud: number
}

export interface Coincidencia {
  numeral: Numeral
  puntaje: number
  /** Términos de la consulta que efectivamente aparecieron. */
  terminos: string[]
  frases: string[]
}

function construirCorpus(): Documento[] {
  const frasesPorNumeral = new Map<string, ExpresionCruda>()
  for (const e of sinonimos.expresiones) {
    frasesPorNumeral.set(`${e.articulo}.${e.literal}`, e)
  }

  return NUMERALES.map((numeral) => {
    const extra = frasesPorNumeral.get(clave(numeral))
    const frases = extra?.frases ?? []
    // Las frases de calle pesan el doble: es como la gente describe el hecho.
    const texto = [numeral.conducta, ...frases, ...frases].join(' ')
    const lista = tokens(texto)
    const tf = new Map<string, number>()
    for (const t of lista) tf.set(t, (tf.get(t) ?? 0) + 1)
    return { numeral, frases, confianza: extra?.confianza ?? null, tf, longitud: lista.length }
  })
}

export const CORPUS: readonly Documento[] = construirCorpus()

const N = CORPUS.length
const LONGITUD_MEDIA = CORPUS.reduce((s, d) => s + d.longitud, 0) / Math.max(N, 1)

const DF = new Map<string, number>()
for (const doc of CORPUS) {
  for (const termino of doc.tf.keys()) DF.set(termino, (DF.get(termino) ?? 0) + 1)
}

function idf(termino: string): number {
  const df = DF.get(termino) ?? 0
  return Math.log(1 + (N - df + 0.5) / (df + 0.5))
}

const K1 = 1.5
const B = 0.75

/** Devuelve los numerales que mejor encajan con lo que la persona escribió. */
export function buscarLexico(consulta: string, limite = 8): Coincidencia[] {
  const terminosConsulta = tokens(consulta)
  if (terminosConsulta.length === 0) return []

  const resultados: Coincidencia[] = []
  for (const doc of CORPUS) {
    let puntaje = 0
    const encontrados: string[] = []
    for (const termino of terminosConsulta) {
      const f = doc.tf.get(termino)
      if (!f) continue
      encontrados.push(termino)
      const denominador = f + K1 * (1 - B + (B * doc.longitud) / LONGITUD_MEDIA)
      puntaje += idf(termino) * ((f * (K1 + 1)) / denominador)
    }
    if (puntaje > 0) {
      resultados.push({
        numeral: doc.numeral,
        puntaje,
        terminos: [...new Set(encontrados)],
        frases: doc.frases,
      })
    }
  }

  return resultados.sort((a, b) => b.puntaje - a.puntaje).slice(0, limite)
}

/**
 * Coincidencia exacta con una frase de calle. Cuando alguien escribe
 * "contravía", no hace falta ranking: hay una respuesta directa.
 */
export function coincidenciaDirecta(consulta: string): Coincidencia | null {
  const c = tokens(consulta).join(' ')
  if (!c) return null
  for (const doc of CORPUS) {
    for (const frase of doc.frases) {
      const f = tokens(frase).join(' ')
      if (!f) continue
      if (f === c || (c.length > 4 && (c.includes(f) || f.includes(c)))) {
        return { numeral: doc.numeral, puntaje: Infinity, terminos: [c], frases: doc.frases }
      }
    }
  }
  return null
}

/** Avisa cuando la consulta cae fuera de lo que esta base cubre. */
export function avisoFueraDeAlcance(consulta: string): FueraDeAlcance | null {
  const c = tokens(consulta).join(' ')
  const senales: [RegExp, string][] = [
    [/\b(alcohol|borracho|ebrio|embriaguez|alcoholimetro|trago|copas|licor|droga)\b/, 'COIP Art. 385'],
    [/\b(atropell|herido|heridos|muerto|muerte|fallecid|lesion|lesiones)\w*\b/, 'COIP Arts. 376 a 380'],
  ]
  for (const [patron, referencia] of senales) {
    if (patron.test(c)) {
      const encontrado = FUERA_DE_ALCANCE.find((f) => f.referencia === referencia)
      if (encontrado) return encontrado
    }
  }
  return null
}
