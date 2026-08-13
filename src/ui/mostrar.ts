/**
 * Modo "mostrar al agente".
 *
 * A veces no hace falta discutir: basta con enseñar el texto de la norma. A
 * pantalla completa, letra grande y legible a un brazo de distancia, y con el
 * brillo al máximo para que se vea a pleno sol.
 */
import { calcularMulta, formatearPorcentaje, formatearUsd, sbuMasReciente } from '../core/calculadora'
import type { Numeral } from '../core/tipos'
import { boton, el } from './dom'

let candado: WakeLockSentinel | null = null

async function mantenerPantalla(): Promise<void> {
  try {
    if ('wakeLock' in navigator) candado = await navigator.wakeLock.request('screen')
  } catch {
    // Se puede mostrar igual, solo que la pantalla puede apagarse sola.
  }
}

function soltarPantalla(): void {
  void candado?.release().catch(() => undefined)
  candado = null
}

export function mostrarAlAgente(numeral: Numeral): void {
  const sbu = sbuMasReciente()
  const monto = calcularMulta(numeral, sbu)

  const capa = el('div', { class: 'pantalla-agente', role: 'dialog', 'aria-modal': 'true' })

  const cerrar = () => {
    soltarPantalla()
    capa.remove()
    document.removeEventListener('keydown', alTeclear)
  }
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cerrar()
  }

  capa.append(
    el('p', { class: 'agente-articulo' }, `COIP Art. ${numeral.articulo}`),
    el('p', { class: 'agente-numeral' }, `numeral ${numeral.literal}`),
    el('p', { class: 'agente-conducta' }, numeral.conducta),
    el('p', { class: 'agente-monto' }, formatearUsd(monto.monto)),
    el(
      'p',
      { class: 'agente-detalle' },
      `${formatearPorcentaje(numeral.porcentajeSbu)} · SBU ${sbu.anio} ${formatearUsd(sbu.sbu)} · ` +
        (numeral.puntosVigentes > 0
          ? `${numeral.puntosVigentes} puntos`
          : 'sin reducción de puntos (reforma de 2021)'),
    ),
  )

  if (numeral.condicionExpresa) {
    capa.append(el('p', { class: 'agente-condicion' }, numeral.condicionExpresa))
  }

  capa.append(boton('Cerrar', cerrar, 'principal'))
  capa.addEventListener('click', (e) => {
    if (e.target === capa) cerrar()
  })
  document.addEventListener('keydown', alTeclear)

  document.body.append(capa)
  void mantenerPantalla()
}
