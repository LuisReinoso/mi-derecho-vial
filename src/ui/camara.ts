/**
 * Ver lo que estás capturando.
 *
 * Antes la foto se tomaba a ciegas: se abría la cámara sin mostrar nada, se
 * esperaba un momento y se guardaba lo que hubiera salido. Y el video se
 * grababa sin ninguna señal en pantalla. Nadie puede confiar en una evidencia
 * que no ha visto, y menos apuntando con el teléfono a media altura.
 */
import { boton, el } from './dom'

export interface VistaPrevia {
  elemento: HTMLElement
  detener: () => void
}

/** Video en vivo de un flujo ya abierto. Se usa mientras se graba. */
export function vistaPreviaDe(flujo: MediaStream): VistaPrevia {
  const video = document.createElement('video')
  video.srcObject = flujo
  video.muted = true
  video.playsInline = true
  video.autoplay = true
  video.className = 'previa'
  void video.play().catch(() => undefined)

  const marco = el('div', { class: 'marco-previa' })
  marco.append(video, el('span', { class: 'punto-rec' }, 'REC'))

  return {
    elemento: marco,
    detener: () => {
      video.srcObject = null
      marco.remove()
    },
  }
}

/**
 * Medidor de nivel de audio. Sin esto, grabar audio es un botón rojo y un acto
 * de fe: no se sabe si el micrófono está tomando algo hasta que es tarde.
 */
export function medidorDeNivel(flujo: MediaStream): VistaPrevia {
  const barra = el('div', { class: 'nivel-relleno' })
  const contenedor = el('div', { class: 'nivel', 'aria-hidden': 'true' }, barra)

  let contexto: AudioContext | null = null
  let animacion = 0

  try {
    contexto = new AudioContext()
    const fuente = contexto.createMediaStreamSource(flujo)
    const analizador = contexto.createAnalyser()
    analizador.fftSize = 512
    fuente.connect(analizador)
    const datos = new Uint8Array(analizador.frequencyBinCount)

    const pintar = () => {
      analizador.getByteTimeDomainData(datos)
      let pico = 0
      for (const v of datos) pico = Math.max(pico, Math.abs(v - 128))
      const porcentaje = Math.min(100, Math.round((pico / 128) * 260))
      barra.style.width = `${porcentaje}%`
      animacion = requestAnimationFrame(pintar)
    }
    pintar()
  } catch {
    contenedor.remove()
  }

  return {
    elemento: contenedor,
    detener: () => {
      cancelAnimationFrame(animacion)
      void contexto?.close().catch(() => undefined)
      contenedor.remove()
    },
  }
}

/**
 * Abre la cámara a pantalla completa, muestra lo que ve y devuelve la foto
 * cuando la persona dispara. Devuelve null si cancela.
 */
export function capturarFoto(): Promise<Blob | null> {
  return new Promise((resolver) => {
    let flujo: MediaStream | null = null
    let camara: 'environment' | 'user' = 'environment'
    let cerrado = false

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.className = 'camara-video'

    const estado = el('p', { class: 'camara-estado' }, 'Abriendo la cámara…')
    const capa = el('div', { class: 'camara', role: 'dialog', 'aria-modal': 'true' })

    const cerrar = (resultado: Blob | null) => {
      if (cerrado) return
      cerrado = true
      flujo?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
      document.removeEventListener('keydown', alTeclear)
      document.body.classList.remove('capa-abierta')
      capa.remove()
      resolver(resultado)
    }

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar(null)
    }

    const disparar = () => {
      if (!video.videoWidth) {
        estado.textContent = 'La cámara todavía no está lista.'
        return
      }
      const lienzo = document.createElement('canvas')
      lienzo.width = video.videoWidth
      lienzo.height = video.videoHeight
      const ctx = lienzo.getContext('2d')
      if (!ctx) {
        cerrar(null)
        return
      }
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height)
      lienzo.toBlob((b) => cerrar(b), 'image/jpeg', 0.92)
    }

    const abrir = async () => {
      flujo?.getTracks().forEach((t) => t.stop())
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: camara, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        video.srcObject = flujo
        await video.play()
        estado.textContent = ''
      } catch (e) {
        estado.textContent = `No se pudo abrir la cámara. Revisa los permisos. ${
          e instanceof Error ? e.message : ''
        }`
      }
    }

    const disparador = boton('', () => disparar(), 'disparador')
    disparador.setAttribute('aria-label', 'Tomar la foto')

    const barra = el('div', { class: 'camara-barra' })
    barra.append(
      boton('Cancelar', () => cerrar(null), 'fantasma compacto'),
      disparador,
      boton(
        'Girar',
        () => {
          camara = camara === 'environment' ? 'user' : 'environment'
          void abrir()
        },
        'fantasma compacto',
      ),
    )

    capa.append(video, estado, barra)
    document.addEventListener('keydown', alTeclear)
    document.body.classList.add('capa-abierta')
    document.body.append(capa)
    void abrir()
  })
}
