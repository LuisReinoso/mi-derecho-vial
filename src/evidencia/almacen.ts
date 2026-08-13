/**
 * Almacén local de evidencia.
 *
 * Todo se queda en el teléfono: IndexedDB, sin servidor, sin cuenta, sin
 * sincronización. Si esta app subiera las grabaciones a algún lado, sería ella
 * misma el problema de privacidad que pretende evitar.
 */

const DB = 'mi-derecho-vial'
const ALMACEN = 'evidencia'
const VERSION = 2

export type TipoEvidencia = 'audio' | 'video' | 'foto' | 'nota' | 'ubicacion' | 'citacion'

export interface Ubicacion {
  latitud: number
  longitud: number
  precisionMetros: number
  capturadaEn: string
}

export interface Pieza {
  id: string
  caso: string
  tipo: TipoEvidencia
  nombreArchivo: string
  mime: string
  tamano: number
  creadaEn: string
  /** SHA-256 en hexadecimal, calculado al momento de guardar. */
  hash: string
  ubicacion: Ubicacion | null
  nota: string | null
  blob: Blob
}

export interface Caso {
  id: string
  titulo: string
  creadoEn: string
  numeroCitacion: string | null
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        const store = db.createObjectStore(ALMACEN, { keyPath: 'id' })
        store.createIndex('caso', 'caso', { unique: false })
      }
      if (!db.objectStoreNames.contains('casos')) {
        db.createObjectStore('casos', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('vectores')) {
        db.createObjectStore('vectores')
      }
    }
    req.onsuccess = () => resolver(req.result)
    req.onerror = () => rechazar(req.error ?? new Error('No se pudo abrir el almacén local'))
  })
}

export async function sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function id(): string {
  return crypto.randomUUID()
}

export async function crearCaso(titulo: string, numeroCitacion: string | null): Promise<Caso> {
  const caso: Caso = { id: id(), titulo, creadoEn: new Date().toISOString(), numeroCitacion }
  const db = await abrir()
  await new Promise<void>((resolver, rechazar) => {
    const tx = db.transaction('casos', 'readwrite')
    tx.objectStore('casos').put(caso)
    tx.oncomplete = () => resolver()
    tx.onerror = () => rechazar(tx.error ?? new Error('No se pudo crear el caso'))
  })
  return caso
}

export async function listarCasos(): Promise<Caso[]> {
  const db = await abrir()
  return new Promise((resolver) => {
    const tx = db.transaction('casos', 'readonly')
    const req = tx.objectStore('casos').getAll()
    req.onsuccess = () => resolver((req.result as Caso[]).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)))
    req.onerror = () => resolver([])
  })
}

export interface NuevaPieza {
  caso: string
  tipo: TipoEvidencia
  blob: Blob
  nombreArchivo: string
  ubicacion?: Ubicacion | null
  nota?: string | null
}

export async function guardarPieza(nueva: NuevaPieza): Promise<Pieza> {
  const pieza: Pieza = {
    id: id(),
    caso: nueva.caso,
    tipo: nueva.tipo,
    nombreArchivo: nueva.nombreArchivo,
    mime: nueva.blob.type || 'application/octet-stream',
    tamano: nueva.blob.size,
    creadaEn: new Date().toISOString(),
    hash: await sha256(nueva.blob),
    ubicacion: nueva.ubicacion ?? null,
    nota: nueva.nota ?? null,
    blob: nueva.blob,
  }

  const db = await abrir()
  await new Promise<void>((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put(pieza)
    tx.oncomplete = () => resolver()
    tx.onerror = () => rechazar(tx.error ?? new Error('No se pudo guardar la evidencia'))
  })
  return pieza
}

export async function listarPiezas(caso: string): Promise<Pieza[]> {
  const db = await abrir()
  return new Promise((resolver) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const req = tx.objectStore(ALMACEN).index('caso').getAll(caso)
    req.onsuccess = () => resolver((req.result as Pieza[]).sort((a, b) => a.creadaEn.localeCompare(b.creadaEn)))
    req.onerror = () => resolver([])
  })
}

export async function borrarPieza(pieza: string): Promise<void> {
  const db = await abrir()
  await new Promise<void>((resolver) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).delete(pieza)
    tx.oncomplete = () => resolver()
    tx.onerror = () => resolver()
  })
}

/** Pide al navegador que no borre estos datos cuando falte espacio. */
export async function pedirPersistencia(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
