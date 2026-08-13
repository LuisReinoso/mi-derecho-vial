/**
 * Un solo punto de apertura de IndexedDB.
 *
 * Historia de dos errores, para que no se repitan:
 *
 * 1. El almacén de evidencia y el índice semántico abrían la misma base con
 *    números de versión distintos, y el segundo en abrir moría con VersionError.
 * 2. Peor: pedir una versión FIJA rompe en cuanto un navegador se queda con una
 *    copia vieja de la app (un service worker sirviendo el bundle anterior, por
 *    ejemplo). El código viejo pide la versión 2, la base ya está en la 3, y
 *    todo revienta con "The requested version (2) is less than the existing
 *    version (3)". El usuario pierde la grabación por un detalle de caché.
 *
 * Por eso aquí no se pide ninguna versión: se abre la base tal como esté, se
 * mira qué almacenes faltan y solo entonces se sube UNA versión para crearlos.
 * Así nunca se puede pedir una versión menor que la existente, y una copia
 * vieja de la app sigue funcionando contra una base más nueva.
 */

export const NOMBRE_DB = 'mi-derecho-vial'

export const ALMACENES = {
  casos: 'casos',
  evidencia: 'evidencia',
  vectores: 'vectores',
  /** Grabaciones en curso, para sobrevivir a que el navegador mate la pestaña. */
  sesiones: 'sesiones',
  /** Trozos de audio o video escritos mientras se graba. */
  trozos: 'trozos',
} as const

const REQUERIDOS = Object.values(ALMACENES)

let abierta: Promise<IDBDatabase> | null = null

function crearAlmacenes(db: IDBDatabase): void {
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

function abrirCon(version?: number): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const req = version === undefined
      ? indexedDB.open(NOMBRE_DB)
      : indexedDB.open(NOMBRE_DB, version)

    req.onupgradeneeded = () => crearAlmacenes(req.result)
    req.onblocked = () =>
      rechazar(
        new Error(
          'Hay otra pestaña de la app abierta con una versión distinta. Ciérrala y vuelve a intentar.',
        ),
      )
    req.onsuccess = () => {
      const db = req.result
      // Si otra pestaña necesita subir de versión, hay que soltar esta conexión.
      db.onversionchange = () => {
        db.close()
        abierta = null
      }
      resolver(db)
    }
    req.onerror = () => rechazar(req.error ?? new Error('No se pudo abrir el almacén local'))
  })
}

export function abrirDb(): Promise<IDBDatabase> {
  if (abierta) return abierta
  abierta = (async () => {
    let db = await abrirCon()
    const faltan = REQUERIDOS.filter((n) => !db.objectStoreNames.contains(n))
    if (faltan.length === 0) return db

    // Solo aquí se sube de versión, y siempre una por encima de la que haya.
    const siguiente = db.version + 1
    db.close()
    db = await abrirCon(siguiente)
    return db
  })()

  abierta.catch(() => {
    abierta = null
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
