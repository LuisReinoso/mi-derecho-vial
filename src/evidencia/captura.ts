/**
 * Captura en vivo: audio, video, foto y ubicación.
 *
 * Pensado para usarse con una mano, con nervios y en menos de tres segundos.
 * La grabación arranca antes de que se decida qué grabar, porque el momento
 * que importa suele ser el primero.
 */
import type { Ubicacion } from './almacen'

export interface OpcionesGrabacion {
  video: boolean
  /** Cámara trasera por defecto: normalmente se quiere enfocar la escena. */
  camara?: 'user' | 'environment'
}

export interface Grabacion {
  detener: () => Promise<Blob>
  cancelar: () => void
  flujo: MediaStream
  mime: string
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

export async function iniciarGrabacion(opciones: OpcionesGrabacion): Promise<Grabacion> {
  const flujo = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: opciones.video ? { facingMode: opciones.camara ?? 'environment' } : false,
  })

  const mime = elegirMime(opciones.video)
  const grabador = new MediaRecorder(flujo, mime ? { mimeType: mime } : undefined)
  const trozos: Blob[] = []
  grabador.ondataavailable = (e) => {
    if (e.data.size > 0) trozos.push(e.data)
  }
  // Trozos de un segundo: si la app muere a mitad de camino, se pierde un
  // segundo y no la grabación entera.
  grabador.start(1000)

  const cerrarFlujo = () => flujo.getTracks().forEach((t) => t.stop())

  return {
    flujo,
    mime: grabador.mimeType || mime,
    detener: () =>
      new Promise<Blob>((resolver) => {
        grabador.onstop = () => {
          cerrarFlujo()
          resolver(new Blob(trozos, { type: grabador.mimeType || mime || 'application/octet-stream' }))
        }
        if (grabador.state !== 'inactive') grabador.stop()
        else resolver(new Blob(trozos, { type: mime }))
      }),
    cancelar: () => {
      if (grabador.state !== 'inactive') grabador.stop()
      cerrarFlujo()
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

/**
 * Toma una foto sin abrir la app de cámara del sistema, para no perder tiempo
 * ni sacar al usuario de la app en mitad de un control.
 */
export async function tomarFoto(camara: 'user' | 'environment' = 'environment'): Promise<Blob> {
  const flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camara } })
  try {
    const video = document.createElement('video')
    video.srcObject = flujo
    video.muted = true
    video.playsInline = true
    await video.play()
    await new Promise((r) => setTimeout(r, 300)) // deja que el sensor exponga

    const lienzo = document.createElement('canvas')
    lienzo.width = video.videoWidth || 1280
    lienzo.height = video.videoHeight || 720
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('No se pudo dibujar la foto')
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height)

    return await new Promise<Blob>((resolver, rechazar) => {
      lienzo.toBlob(
        (b) => (b ? resolver(b) : rechazar(new Error('No se pudo generar la imagen'))),
        'image/jpeg',
        0.92,
      )
    })
  } finally {
    flujo.getTracks().forEach((t) => t.stop())
  }
}
