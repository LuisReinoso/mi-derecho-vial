/**
 * Mantener la app siempre en la última versión, sin que nadie tenga que pedirlo.
 *
 * Pedirle a alguien que entre a ajustes y pulse "buscar actualización" no es
 * una solución: nadie lo va a hacer, y menos parado frente a un agente.
 *
 * Aquí se registra el service worker a mano en vez de dejarlo en manos de la
 * librería. La razón es concreta: con el registro automático se llegaba a un
 * estado en el que el service worker nuevo ya estaba activo y el precache ya
 * tenía el bundle nuevo, pero la página seguía ejecutando el código viejo. Ese
 * es exactamente el estado mezclado que hace que un código antiguo se tope con
 * datos nuevos y falle. La única garantía de que eso no pase es recargar en
 * cuanto el service worker cambia, y eso se hace aquí:
 *
 *   navigator.serviceWorker.controllerchange -> location.reload()
 *
 * Lo único que puede retrasar la recarga es estar grabando o mostrándole la
 * pantalla al agente. En esos dos casos espera, porque perder eso sería peor.
 */
import { estaGrabando } from './evidencia/captura'

/** Cada media hora con la app abierta, además de al volver a ella. */
const INTERVALO_COMPROBACION = 30 * 60 * 1000
/** Cada cuánto se reintenta aplicar una actualización que quedó esperando. */
const REINTENTO_APLICAR = 5 * 1000

const BASE = import.meta.env.BASE_URL
const RUTA_SW = `${BASE}sw.js`

let registro: ServiceWorkerRegistration | null = null
let reintento: number | null = null
let avisado = false
let recargando = false

/**
 * Recargar es seguro salvo que se esté grabando o mostrando algo. En esos dos
 * casos la actualización espera: el material y el momento importan más.
 */
function esSeguroRecargar(): boolean {
  if (estaGrabando()) return false
  if (document.querySelector('.pantalla-agente')) return false
  return true
}

function avisarQueEspera(): void {
  if (avisado) return
  avisado = true
  const nota = document.createElement('div')
  nota.className = 'aviso-actualizacion'
  nota.setAttribute('role', 'status')
  nota.textContent = 'Hay una versión nueva. Se aplicará en cuanto termines lo que estás haciendo.'
  document.body.append(nota)
  window.setTimeout(() => nota.remove(), 6000)
}

/** Le dice al service worker que espera que tome el control ya. */
function activarSiEsSeguro(): void {
  const esperando = registro?.waiting
  if (!esperando) return

  if (!esSeguroRecargar()) {
    avisarQueEspera()
    if (reintento === null) {
      reintento = window.setInterval(activarSiEsSeguro, REINTENTO_APLICAR)
    }
    return
  }

  if (reintento !== null) {
    window.clearInterval(reintento)
    reintento = null
  }
  esperando.postMessage({ type: 'SKIP_WAITING' })
}

function comprobar(): void {
  if (!navigator.onLine) return
  void registro?.update().catch(() => undefined)
}

/**
 * Le contesta al service worker que aquí hay código que sabe gestionar la
 * actualización, para que no fuerce la recarga por su cuenta y respete que
 * puedas estar grabando. Si esto no contesta, el service worker asume que la
 * pantalla es de una versión vieja y toma el control él.
 */
function anunciarQueSabemosActualizar(): void {
  try {
    const canal = new BroadcastChannel('mdv-version')
    canal.onmessage = (e) => {
      if (e.data === 'hay-alguien-ahi') canal.postMessage('se-gestionar-actualizaciones')
    }
  } catch {
    // Sin BroadcastChannel el service worker recargará por su cuenta, que es
    // el comportamiento seguro por defecto.
  }
}

export async function iniciarActualizaciones(): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  anunciarQueSabemosActualizar()

  navigator.serviceWorker.addEventListener('message', (e) => {
    if ((e.data as { tipo?: string })?.tipo !== 'recarga-por-version-nueva') return
    if (recargando) return
    recargando = true
    location.reload()
  })

  // Si ya hay un controlador, esta pestaña viene de una versión anterior: un
  // cambio de controlador significa versión nueva y hay que recargar. En la
  // primera instalación no hay nada que recargar.
  const habiaControlador = Boolean(navigator.serviceWorker.controller)

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return
    recargando = true
    location.reload()
  })

  try {
    registro = await navigator.serviceWorker.register(RUTA_SW, {
      scope: BASE,
      // 'none' obliga a pedir el service worker y sus imports a la red, sin
      // pasar por la caché HTTP. Sin esto un proxy o la caché del navegador
      // pueden dejar la app clavada en una versión vieja durante días.
      updateViaCache: 'none',
    })
  } catch {
    return // sin service worker la app sigue funcionando, solo que sin offline
  }

  registro.addEventListener('updatefound', () => {
    const entrante = registro?.installing
    if (!entrante) return
    entrante.addEventListener('statechange', () => {
      if (entrante.state === 'installed') activarSiEsSeguro()
    })
  })

  // Puede haber quedado uno esperando de una sesión anterior.
  activarSiEsSeguro()

  // Comprobar al arrancar, al volver a la app, al recuperar conexión y cada
  // cierto rato. Un teléfono que nunca cierra la pestaña se quedaría con una
  // versión vieja para siempre si solo se comprobara al registrar.
  comprobar()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    comprobar()
    activarSiEsSeguro()
  })
  window.addEventListener('online', comprobar)
  window.setInterval(comprobar, INTERVALO_COMPROBACION)
}

/** Solo para la pantalla de ajustes: comprobar a mano sigue estando disponible. */
export async function comprobarAhora(): Promise<void> {
  await registro?.update()
  activarSiEsSeguro()
}
