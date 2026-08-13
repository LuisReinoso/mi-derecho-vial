/**
 * Captura en vivo: audio, video, foto y ubicación.
 *
 * Pensado para usarse con una mano, con nervios y en menos de tres segundos.
 * La grabación arranca antes de que se decida qué grabar, porque el momento
 * que importa suele ser el primero.
 */
import { abrirSesion, cerrarSesion, guardarTrozo } from './almacen'
import type { Pieza, SesionGrabacion, Ubicacion } from './almacen'

export interface OpcionesGrabacion {
  video: boolean
  /** Cámara trasera por defecto: normalmente se quiere enfocar la escena. */
  camara?: 'user' | 'environment'
  /** Caso al que se adjuntará la grabación. */
  caso: string
}

export interface Grabacion {
  sesion: SesionGrabacion
  detener: (ubicacion: Ubicacion | null) => Promise<Pieza | null>
  flujo: MediaStream
  mime: string
  /** Trozos ya escritos a disco. Sirve para mostrar que no se pierde nada. */
  trozosGuardados: () => number
}

function elegirMime(video: boolean): string {
  const candidatos = video
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const c of candidatos) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

// ---------------------------------------------------------------------------
// Wake lock: sin esto la pantalla se apaga, el sistema baja la prioridad de la
// pestaña y la grabación se corta justo cuando más falta hace.
// ---------------------------------------------------------------------------

let candado: WakeLockSentinel | null = null

async function pedirWakeLock(): Promise<void> {
  try {
    if (!('wakeLock' in navigator)) return
    candado = await navigator.wakeLock.request('screen')
  } catch {
    // Sin wake lock se puede grabar igual, solo que el sistema puede cortar.
  }
}

async function soltarWakeLock(): Promise<void> {
  try {
    await candado?.release()
  } catch {
    // Nada que hacer si ya se soltó.
  }
  candado = null
}

// El navegador suelta el candado al cambiar de pestaña: hay que recuperarlo.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && candado === null && grabando) {
      void pedirWakeLock()
    }
  })
}

let grabando = false

export function estaGrabando(): boolean {
  return grabando
}

export async function iniciarGrabacion(opciones: OpcionesGrabacion): Promise<Grabacion> {
  const flujo = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: opciones.video ? { facingMode: opciones.camara ?? 'environment' } : false,
  })

  const mime = elegirMime(opciones.video)
  const grabador = new MediaRecorder(flujo, mime ? { mimeType: mime } : undefined)
  const mimeReal = grabador.mimeType || mime || 'application/octet-stream'
  const sesion = await abrirSesion(opciones.caso, opciones.video ? 'video' : 'audio', mimeReal)

  let indice = 0
  let guardados = 0
  // Cola en serie: si dos trozos llegan juntos, se escriben en orden y ninguno
  // se pisa con el otro.
  let cola: Promise<void> = Promise.resolve()

  grabador.ondataavailable = (e) => {
    if (e.data.size === 0) return
    const i = indice
    indice += 1
    cola = cola.then(async () => {
      await guardarTrozo(sesion.id, i, e.data)
      guardados += 1
    })
  }

  // Trozos de un segundo: si la app muere a mitad de camino, se pierde como
  // mucho un segundo, no la grabación entera.
  grabador.start(1000)
  grabando = true
  void pedirWakeLock()

  const cerrarFlujo = () => flujo.getTracks().forEach((t) => t.stop())

  return {
    sesion,
    flujo,
    mime: mimeReal,
    trozosGuardados: () => guardados,
    detener: async (ubicacion) => {
      await new Promise<void>((resolver) => {
        grabador.onstop = () => resolver()
        if (grabador.state !== 'inactive') grabador.stop()
        else resolver()
      })
      cerrarFlujo()
      grabando = false
      void soltarWakeLock()
      await cola // que no quede ningún trozo a medio escribir
      return cerrarSesion(sesion, ubicacion)
    },
  }
}

export async function ubicacionActual(timeoutMs = 8000): Promise<Ubicacion | null> {
  if (!navigator.geolocation) return null
  return new Promise((resolver) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolver({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precisionMetros: pos.coords.accuracy,
          capturadaEn: new Date(pos.timestamp).toISOString(),
        }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}
