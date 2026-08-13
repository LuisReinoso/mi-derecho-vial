/**
 * Un solo punto de apertura de IndexedDB.
 *
 * Antes el almacén de evidencia y el índice semántico abrían la misma base con
 * números de versión distintos, y el segundo en abrir reventaba con
 * VersionError. Con un solo esquema y una sola versión eso no puede repetirse.
 */

export const NOMBRE_DB = 'mi-derecho-vial'
export const VERSION_DB = 3

export const ALMACENES = {
  casos: 'casos',
  evidencia: 'evidencia',
  vectores: 'vectores',
  /** Grabaciones en curso, para sobrevivir a que el navegador mate la pestaña. */
  sesiones: 'sesiones',
  /** Trozos de audio o video escritos mientras se graba. */
  trozos: 'trozos',
} as const

let abierta: Promise<IDBDatabase> | null = null

export function abrirDb(): Promise<IDBDatabase> {
  if (abierta) return abierta
  abierta = new Promise((resolver, rechazar) => {
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ALMACENES.casos)) {
        db.createObjectStore(ALMACENES.casos, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ALMACENES.evidencia)) {
        const store = db.createObjectStore(ALMACENES.evidencia, { keyPath: 'id' })
        store.createIndex('caso', 'caso', { unique: false })
      }
      if (!db.objectStoreNames.contains(ALMACENES.vectores)) {
        db.createObjectStore(ALMACENES.vectores)
      }
      if (!db.objectStoreNames.contains(ALMACENES.sesiones)) {
        db.createObjectStore(ALMACENES.sesiones, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ALMACENES.trozos)) {
        const store = db.createObjectStore(ALMACENES.trozos, { keyPath: ['sesion', 'indice'] })
        store.createIndex('sesion', 'sesion', { unique: false })
      }
    }

    req.onsuccess = () => resolver(req.result)
    req.onerror = () => {
      abierta = null
      rechazar(req.error ?? new Error('No se pudo abrir el almacén local'))
    }
  })
  return abierta
}

/** Envuelve una transacción de escritura y resuelve cuando termina de verdad. */
export async function escribir<T>(
  almacen: string,
  operacion: (store: IDBObjectStore) => T,
): Promise<T> {
  const db = await abrirDb()
  return new Promise<T>((resolver, rechazar) => {
    const tx = db.transaction(almacen, 'readwrite')
    let salida: T
    try {
      salida = operacion(tx.objectStore(almacen))
    } catch (e) {
      rechazar(e)
      return
    }
    tx.oncomplete = () => resolver(salida)
    tx.onerror = () => rechazar(tx.error ?? new Error(`Error escribiendo en ${almacen}`))
    tx.onabort = () => rechazar(tx.error ?? new Error(`Transacción abortada en ${almacen}`))
  })
}

/** Lee y devuelve un valor por defecto si algo falla, para no romper la UI. */
export async function leer<T>(
  almacen: string,
  operacion: (store: IDBObjectStore) => IDBRequest,
  porDefecto: T,
): Promise<T> {
  try {
    const db = await abrirDb()
    return await new Promise<T>((resolver) => {
      const tx = db.transaction(almacen, 'readonly')
      const req = operacion(tx.objectStore(almacen))
      req.onsuccess = () => resolver((req.result as T | undefined) ?? porDefecto)
      req.onerror = () => resolver(porDefecto)
    })
  } catch {
    return porDefecto
  }
}
