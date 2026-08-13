import { describe, expect, it } from 'vitest'
import {
  aISO,
  calendario,
  domingoPascua,
  esHabil,
  fecha,
  feriadosCalculados,
  plazoImpugnacion,
  sumarDiasTermino,
} from '../src/core/plazos'

describe('feriados', () => {
  it('calcula el domingo de Pascua', () => {
    expect(aISO(domingoPascua(2026))).toBe('2026-04-05')
    expect(aISO(domingoPascua(2025))).toBe('2025-04-20')
  })

  it('el 10 de agosto de 2026 es feriado nacional y cae lunes', () => {
    const diezDeAgosto = fecha(2026, 8, 10)
    expect(diezDeAgosto.getUTCDay()).toBe(1)
    expect(calendario(2026).feriados.has('2026-08-10')).toBe(true)
    expect(esHabil(diezDeAgosto)).toBe(false)
  })

  it('el calendario oficial de 2026 está marcado como verificado', () => {
    expect(calendario(2026).verificado).toBe(true)
  })

  it('las reglas de traslado reproducen el calendario oficial de 2026', () => {
    const calculados = new Set(feriadosCalculados(2026).map((f) => f.fecha))
    // Fechas que el cálculo por reglas debe acertar sin ayuda de la lista oficial.
    for (const dia of [
      '2026-01-01', // Año Nuevo, no se traslada
      '2026-02-16', // Carnaval lunes
      '2026-02-17', // Carnaval martes
      '2026-04-03', // Viernes Santo
      '2026-05-01', // viernes, se queda
      '2026-05-25', // domingo 24 -> lunes 25
      '2026-08-10', // lunes, se queda
      '2026-10-09', // viernes, se queda
      '2026-11-02', // lunes, se queda
      '2026-11-03', // martes que chocaría con el 2: se queda donde está
      '2026-12-25', // Navidad, no se traslada
    ]) {
      expect(calculados, `falta ${dia}`).toContain(dia)
    }
  })
})

describe('término de impugnación del caso semilla', () => {
  const emision = fecha(2026, 8, 6) // jueves

  it('no cuenta el día de la notificación, ni fines de semana, ni el feriado', () => {
    const c = sumarDiasTermino(emision, 3)
    expect(aISO(c.vence)).toBe('2026-08-12')
    expect(c.bitacora.join('\n')).toContain('feriado (Primer Grito de Independencia)')
  })

  it('al 13 de agosto de 2026 el término ya está vencido', () => {
    const p = plazoImpugnacion(emision, fecha(2026, 8, 13))
    expect(p.vencido).toBe(true)
    expect(p.diasRestantes).toBe(-1)
  })

  it('el mismo 12 de agosto todavía estaba a tiempo', () => {
    const p = plazoImpugnacion(emision, fecha(2026, 8, 12))
    expect(p.vencido).toBe(false)
    expect(p.diasRestantes).toBe(0)
  })

  it('avisa siempre de los feriados locales, que no están en la lista', () => {
    const p = plazoImpugnacion(emision, fecha(2026, 8, 13))
    expect(p.advertencias.join(' ')).toContain('feriados locales')
  })
})

describe('años sin lista oficial', () => {
  it('avisa que el cómputo usa reglas y no una fuente verificada', () => {
    const p = plazoImpugnacion(fecha(2030, 3, 4), fecha(2030, 3, 10))
    expect(p.advertencias.join(' ')).toContain('2030')
  })
})
