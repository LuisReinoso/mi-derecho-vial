/**
 * Dictado por voz.
 *
 * Con el agente delante uno teclea fatal. Hablar es más rápido y no obliga a
 * mirar la pantalla. Donde el navegador no lo soporte, el botón simplemente no
 * aparece: nunca se muestra algo que no va a funcionar.
 */

interface ResultadoVoz {
  isFinal: boolean
  0: { transcript: string }
}

interface EventoVoz {
  resultIndex: number
  results: { length: number; [i: number]: ResultadoVoz }
}

interface Reconocedor {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: EventoVoz) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

type ConstructorReconocedor = new () => Reconocedor

function constructor(): ConstructorReconocedor | null {
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocedor
    webkitSpeechRecognition?: ConstructorReconocedor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function hayDictado(): boolean {
  return constructor() !== null
}

export interface Dictado {
  detener: () => void
}

/**
 * Escucha y va entregando el texto según se dicta. `alTexto` recibe el
 * acumulado, para que la búsqueda se actualice mientras la persona habla.
 */
export function dictar(
  alTexto: (texto: string) => void,
  alTerminar: (motivo: 'fin' | 'error', detalle?: string) => void,
): Dictado | null {
  const Ctor = constructor()
  if (!Ctor) return null

  const reconocedor = new Ctor()
  reconocedor.lang = 'es-EC'
  reconocedor.continuous = true
  reconocedor.interimResults = true

  let confirmado = ''

  reconocedor.onresult = (e) => {
    let provisional = ''
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const r = e.results[i]
      if (!r) continue
      if (r.isFinal) confirmado += `${r[0].transcript} `
      else provisional += r[0].transcript
    }
    alTexto(`${confirmado}${provisional}`.trim())
  }

  reconocedor.onerror = (e) => {
    // "no-speech" y "aborted" son normales al soltar el botón, no son fallos.
    if (e.error === 'no-speech' || e.error === 'aborted') return
    alTerminar(
      'error',
      e.error === 'not-allowed'
        ? 'No hay permiso para el micrófono.'
        : e.error === 'network'
          ? 'El dictado necesita conexión en este navegador. Escribe a mano: la búsqueda sí funciona sin internet.'
          : e.error,
    )
  }

  reconocedor.onend = () => alTerminar('fin')

  try {
    reconocedor.start()
  } catch {
    return null
  }

  return { detener: () => reconocedor.stop() }
}
