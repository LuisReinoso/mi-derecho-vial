/** Cáscara de la app: navegación inferior y montaje de vistas. */
import { vistaAhora } from './ahora'
import { vistaCitacion } from './citacion'
import { vistaEvidencia } from './evidencia'
import { vistaDerechos } from './derechos'
import { el, vaciar } from './dom'

type Ruta = 'ahora' | 'citacion' | 'evidencia' | 'derechos'

const RUTAS: { id: Ruta; icono: string; titulo: string; vista: () => HTMLElement }[] = [
  { id: 'ahora', icono: '🎙', titulo: 'Ahora', vista: () => vistaAhora(false) },
  { id: 'citacion', icono: '📄', titulo: 'Mi citación', vista: vistaCitacion },
  { id: 'evidencia', icono: '🗂', titulo: 'Evidencia', vista: vistaEvidencia },
  { id: 'derechos', icono: '⚖️', titulo: 'Derechos', vista: vistaDerechos },
]

/** `#grabar` es el atajo del ícono: entra directo a grabar, sin pasos. */
const ATAJO_GRABAR = 'grabar'

function hashActual(): string {
  return location.hash.replace('#', '')
}

function rutaActual(): Ruta {
  const hash = hashActual()
  if (hash === ATAJO_GRABAR) return 'ahora'
  return RUTAS.some((r) => r.id === hash) ? (hash as Ruta) : 'ahora'
}

export function montar(raiz: HTMLElement): void {
  const contenido = el('div', { id: 'contenido' })
  const nav = el('nav', { class: 'inferior', 'aria-label': 'Secciones' })

  const botones = RUTAS.map((r) => {
    const b = el('button', { type: 'button' })
    b.append(el('span', { class: 'icono', 'aria-hidden': 'true' }, r.icono), el('span', {}, r.titulo))
    b.addEventListener('click', () => {
      location.hash = r.id
    })
    nav.append(b)
    return b
  })

  const pintar = () => {
    const actual = rutaActual()
    RUTAS.forEach((r, i) => {
      const b = botones[i]
      if (!b) return
      if (r.id === actual) b.setAttribute('aria-current', 'page')
      else b.removeAttribute('aria-current')
    })
    vaciar(contenido)
    const definicion = RUTAS.find((r) => r.id === actual)
    if (definicion) {
      const conAtajo = hashActual() === ATAJO_GRABAR
      contenido.append(conAtajo ? vistaAhora(true) : definicion.vista())
    }
    window.scrollTo(0, 0)
  }

  window.addEventListener('hashchange', pintar)
  raiz.append(contenido, nav)
  pintar()
}
