/**
 * Almacén local de evidencia.
 *
 * Todo se queda en el teléfono: IndexedDB, sin servidor, sin cuenta, sin
 * sincronización. Si esta app subiera las grabaciones a algún lado, sería ella
 * misma el problema de privacidad que pretende evitar.
 */
import { ALMACENES, abrirDb, escribir, leer } from './db'

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

export async function sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function id(): string {
  return crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// Casos y piezas
// ---------------------------------------------------------------------------

export async function crearCaso(titulo: string, numeroCitacion: string | null): Promise<Caso> {
  const caso: Caso = { id: id(), titulo, creadoEn: new Date().toISOString(), numeroCitacion }
  await escribir(ALMACENES.casos, (s) => s.put(caso))
  return caso
}

export async function listarCasos(): Promise<Caso[]> {
  const casos = await leer<Caso[]>(ALMACENES.casos, (s) => s.getAll(), [])
  return casos.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
}

export async function obtenerCaso(idCaso: string): Promise<Caso | null> {
  return leer<Caso | null>(ALMACENES.casos, (s) => s.get(idCaso), null)
}

export interface NuevaPieza {
  caso: string
  tipo: TipoEvidencia
  blob: Blob
  nombreArchivo: string
  ubicacion?: Ubicacion | null
  nota?: string | null
  creadaEn?: string
}

export async function guardarPieza(nueva: NuevaPieza): Promise<Pieza> {
  const pieza: Pieza = {
    id: id(),
    caso: nueva.caso,
    tipo: nueva.tipo,
    nombreArchivo: nueva.nombreArchivo,
    mime: nueva.blob.type || 'application/octet-stream',
    tamano: nueva.blob.size,
    creadaEn: nueva.creadaEn ?? new Date().toISOString(),
    hash: await sha256(nueva.blob),
    ubicacion: nueva.ubicacion ?? null,
    nota: nueva.nota ?? null,
    blob: nueva.blob,
  }
  await escribir(ALMACENES.evidencia, (s) => s.put(pieza))
  return pieza
}

export async function listarPiezas(caso: string): Promise<Pieza[]> {
  const piezas = await leer<Pieza[]>(
    ALMACENES.evidencia,
    (s) => s.index('caso').getAll(caso),
    [],
  )
  return piezas.sort((a, b) => a.creadaEn.localeCompare(b.creadaEn))
}

export async function borrarPieza(pieza: string): Promise<void> {
  await escribir(ALMACENES.evidencia, (s) => s.delete(pieza)).catch(() => undefined)
}

/** Pide al navegador que no borre estos datos cuando falte espacio. */
export async function pedirPersistencia(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

// ---------------------------------------------------------------------------
// Sesiones de grabación
//
// El problema que resuelven: hasta ahora los trozos de audio vivían en memoria
// hasta que alguien pulsaba "detener". Si guardabas el teléfono y el sistema
// mataba la pestaña, la grabación entera se perdía. Justo la que importaba.
// Ahora cada trozo se escribe a disco en el momento en que el grabador lo
// entrega, y al volver a abrir la app se recupera lo que hubiera.
// ---------------------------------------------------------------------------

export interface SesionGrabacion {
  id: string
  caso: string
  tipo: 'audio' | 'video'
  mime: string
  iniciadaEn: string
  cerrada: boolean
}

export async function abrirSesion(
  caso: string,
  tipo: 'audio' | 'video',
  mime: string,
): Promise<SesionGrabacion> {
  const sesion: SesionGrabacion = {
    id: id(),
    caso,
    tipo,
    mime,
    iniciadaEn: new Date().toISOString(),
    cerrada: false,
  }
  await escribir(ALMACENES.sesiones, (s) => s.put(sesion))
  return sesion
}

export async function guardarTrozo(sesion: string, indice: number, blob: Blob): Promise<void> {
  await escribir(ALMACENES.trozos, (s) => s.put({ sesion, indice, blob })).catch(() => undefined)
}

interface Trozo {
  sesion: string
  indice: number
  blob: Blob
}

async function trozosDe(sesion: string): Promise<Blob[]> {
  const trozos = await leer<Trozo[]>(ALMACENES.trozos, (s) => s.index('sesion').getAll(sesion), [])
  return trozos.sort((a, b) => a.indice - b.indice).map((t) => t.blob)
}

async function borrarTrozos(sesion: string): Promise<void> {
  const db = await abrirDb()
  await new Promise<void>((resolver) => {
    const tx = db.transaction(ALMACENES.trozos, 'readwrite')
    const req = tx.objectStore(ALMACENES.trozos).index('sesion').openCursor(IDBKeyRange.only(sesion))
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolver()
    tx.onerror = () => resolver()
  })
}

/**
 * Cierra una sesión: junta sus trozos en una pieza y limpia. Devuelve null si
 * no se llegó a grabar nada.
 */
export async function cerrarSesion(
  sesion: SesionGrabacion,
  ubicacion: Ubicacion | null,
  nota: string | null = null,
): Promise<Pieza | null> {
  const trozos = await trozosDe(sesion.id)
  await escribir(ALMACENES.sesiones, (s) => s.put({ ...sesion, cerrada: true })).catch(() => undefined)

  if (trozos.length === 0) {
    await borrarTrozos(sesion.id)
    await escribir(ALMACENES.sesiones, (s) => s.delete(sesion.id)).catch(() => undefined)
    return null
  }

  const blob = new Blob(trozos, { type: sesion.mime || 'application/octet-stream' })
  const pieza = await guardarPieza({
    caso: sesion.caso,
    tipo: sesion.tipo,
    blob,
    nombreArchivo: `grabacion.${sesion.mime.includes('mp4') ? 'mp4' : 'webm'}`,
    ubicacion,
    nota,
    creadaEn: sesion.iniciadaEn,
  })

  await borrarTrozos(sesion.id)
  await escribir(ALMACENES.sesiones, (s) => s.delete(sesion.id)).catch(() => undefined)
  return pieza
}

/** Sesiones que quedaron abiertas: la app se cerró en mitad de una grabación. */
export async function sesionesInterrumpidas(): Promise<SesionGrabacion[]> {
  const sesiones = await leer<SesionGrabacion[]>(ALMACENES.sesiones, (s) => s.getAll(), [])
  return sesiones.filter((s) => !s.cerrada)
}

/** Rescata una grabación interrumpida y la deja como pieza del expediente. */
export async function rescatarSesion(sesion: SesionGrabacion): Promise<Pieza | null> {
  return cerrarSesion(
    sesion,
    null,
    'Grabación recuperada: la aplicación se cerró antes de detenerla. El material es el que alcanzó a escribirse.',
  )
}

export async function descartarSesion(sesion: SesionGrabacion): Promise<void> {
  await borrarTrozos(sesion.id)
  await escribir(ALMACENES.sesiones, (s) => s.delete(sesion.id)).catch(() => undefined)
}
