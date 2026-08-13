/**
 * Búsqueda semántica offline.
 *
 * Por qué existe: en un control uno está nervioso y con prisa. Nadie escribe
 * "circular en sentido contrario a la vía normal de circulación"; escribe "me
 * metí al revés en una calle". BM25 cubre mucho de eso con sinónimos, pero no
 * todo. El modelo entiende la intención aunque no coincida ni una palabra.
 *
 * Cómo funciona sin conexión:
 *  1. La descarga del modelo es opcional y explícita (una sola vez, con wifi).
 *  2. Los vectores de los numerales se calculan EN EL DISPOSITIVO y se guardan
 *     en IndexedDB. Nunca se envía nada a ningún servidor.
 *  3. A partir de ahí todo corre local, sin red, para siempre.
 */
import { CORPUS } from './lexico'
import { clave } from '../coip'
import { ALMACENES, escribir, leer } from '../../evidencia/db'

export const MODELO = 'Xenova/multilingual-e5-small'
export const DIMENSIONES = 384

const CLAVE_INDICE = () => `${MODELO}|${CORPUS.length}`

export type EstadoSemantico =
  | { fase: 'apagado' }
  | { fase: 'descargando'; progreso: number; archivo: string }
  | { fase: 'indexando'; hechos: number; total: number }
  | { fase: 'listo'; numerales: number }
  | { fase: 'error'; mensaje: string }

type Oyente = (estado: EstadoSemantico) => void

let estado: EstadoSemantico = { fase: 'apagado' }
const oyentes = new Set<Oyente>()

export function estadoSemantico(): EstadoSemantico {
  return estado
}

export function alCambiarEstado(fn: Oyente): () => void {
  oyentes.add(fn)
  fn(estado)
  return () => oyentes.delete(fn)
}

function emitir(nuevo: EstadoSemantico): void {
  estado = nuevo
  for (const fn of oyentes) fn(nuevo)
}

// ---------------------------------------------------------------------------
// Persistencia de los vectores
// ---------------------------------------------------------------------------

async function leerIndice(): Promise<Float32Array | null> {
  return leer<Float32Array | null>(ALMACENES.vectores, (s) => s.get(CLAVE_INDICE()), null)
}

async function guardarIndice(vectores: Float32Array): Promise<void> {
  await escribir(ALMACENES.vectores, (s) => s.put(vectores, CLAVE_INDICE()))
}

/** Borra el índice y libera el espacio del modelo cacheado por el navegador. */
export async function olvidarIndice(): Promise<void> {
  await escribir(ALMACENES.vectores, (s) => s.clear()).catch(() => undefined)
  if ('caches' in globalThis) {
    await caches.delete('transformers-cache').catch(() => false)
  }
  vectores = null
  extraer = null
  emitir({ fase: 'apagado' })
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

type Extractor = (textos: string[]) => Promise<Float32Array[]>

let extraer: Extractor | null = null
let vectores: Float32Array | null = null
let cargando: Promise<void> | null = null

async function cargarModelo(): Promise<Extractor> {
  if (extraer) return extraer

  // Import dinámico: quien no active la búsqueda semántica nunca descarga esto.
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false

  const pipe = await pipeline('feature-extraction', MODELO, {
    dtype: 'q8',
    progress_callback: (info: unknown) => {
      const p = info as { status?: string; progress?: number; file?: string }
      if (p.status === 'progress') {
        emitir({
          fase: 'descargando',
          progreso: Math.round(p.progress ?? 0),
          archivo: p.file ?? '',
        })
      }
    },
  })

  extraer = async (textos: string[]) => {
    const salida = await pipe(textos, { pooling: 'mean', normalize: true })
    const datos = salida.data as Float32Array
    const filas: Float32Array[] = []
    for (let i = 0; i < textos.length; i += 1) {
      filas.push(datos.slice(i * DIMENSIONES, (i + 1) * DIMENSIONES))
    }
    return filas
  }
  return extraer
}

/**
 * e5 espera prefijos: los documentos indexados van con "passage:" y la consulta
 * con "query:". Sin eso el modelo rinde bastante peor.
 */
function textoDocumento(indice: number): string {
  const doc = CORPUS[indice]
  if (!doc) return 'passage: '
  const frases = doc.frases.length ? ` También se dice: ${doc.frases.join('; ')}.` : ''
  return `passage: Art. ${doc.numeral.articulo} numeral ${doc.numeral.literal}. ${doc.numeral.conducta}${frases}`
}

/** Descarga el modelo (una vez) e indexa los numerales en el dispositivo. */
export async function activarSemantica(): Promise<void> {
  if (cargando) return cargando
  cargando = (async () => {
    try {
      const guardado = await leerIndice()
      const fn = await cargarModelo()

      if (guardado && guardado.length === CORPUS.length * DIMENSIONES) {
        vectores = guardado
        emitir({ fase: 'listo', numerales: CORPUS.length })
        return
      }

      const acumulado = new Float32Array(CORPUS.length * DIMENSIONES)
      const LOTE = 8
      for (let i = 0; i < CORPUS.length; i += LOTE) {
        const indices: number[] = []
        for (let j = i; j < Math.min(i + LOTE, CORPUS.length); j += 1) indices.push(j)
        const filas = await fn(indices.map(textoDocumento))
        filas.forEach((fila, k) => {
          const destino = indices[k]
          if (destino === undefined) return
          acumulado.set(fila, destino * DIMENSIONES)
        })
        emitir({ fase: 'indexando', hechos: Math.min(i + LOTE, CORPUS.length), total: CORPUS.length })
      }

      vectores = acumulado
      await guardarIndice(acumulado)
      emitir({ fase: 'listo', numerales: CORPUS.length })
    } catch (e) {
      emitir({ fase: 'error', mensaje: e instanceof Error ? e.message : String(e) })
      throw e
    } finally {
      cargando = null
    }
  })()
  return cargando
}

/** Reactiva la búsqueda semántica si ya se indexó antes, sin pedir permiso. */
export async function reanudarSiYaEstaLista(): Promise<boolean> {
  try {
    const guardado = await leerIndice()
    if (!guardado || guardado.length !== CORPUS.length * DIMENSIONES) return false
    await activarSemantica()
    return true
  } catch {
    return false
  }
}

export interface CoincidenciaSemantica {
  indice: number
  similitud: number
}

export async function buscarSemantico(consulta: string, limite = 8): Promise<CoincidenciaSemantica[]> {
  if (!vectores || !extraer) return []
  const [q] = await extraer([`query: ${consulta}`])
  if (!q) return []

  const puntajes: CoincidenciaSemantica[] = []
  for (let i = 0; i < CORPUS.length; i += 1) {
    let punto = 0
    const base = i * DIMENSIONES
    for (let d = 0; d < DIMENSIONES; d += 1) {
      punto += (q[d] ?? 0) * (vectores[base + d] ?? 0)
    }
    puntajes.push({ indice: i, similitud: punto })
  }
  return puntajes.sort((a, b) => b.similitud - a.similitud).slice(0, limite)
}

export function claveDeIndice(indice: number): string | null {
  const doc = CORPUS[indice]
  return doc ? clave(doc.numeral) : null
}
