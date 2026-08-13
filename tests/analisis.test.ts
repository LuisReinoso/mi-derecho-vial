import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsearCitacion } from '../src/core/parser'
import { analizar } from '../src/core/validador'
import { fecha } from '../src/core/plazos'
import { buscarNumeral } from '../src/core/coip'
import { calcularMulta, sbuDelAnio } from '../src/core/calculadora'
import { buscarRapido } from '../src/core/busqueda'

const casoEjemplo = readFileSync(
  fileURLToPath(new URL('./fixtures/caso_ejemplo_movidelnor.txt', import.meta.url)),
  'utf8',
)

const HOY = fecha(2026, 8, 13)

describe('montos con el SBU 2026', () => {
  const sbu = sbuDelAnio(2026)!

  it('el SBU 2026 es 482', () => {
    expect(sbu.sbu).toBe(482)
  })

  it('Art. 389.1 = 30% = $144.60', () => {
    const n = buscarNumeral({ articulo: '389', literal: '1' })!
    expect(calcularMulta(n, sbu).monto).toBe(144.6)
  })

  it('Art. 390.3 = 15% = $72.30', () => {
    const n = buscarNumeral({ articulo: '390', literal: '3' })!
    expect(calcularMulta(n, sbu).monto).toBe(72.3)
  })

  it('la diferencia entre ambos es exactamente el doble', () => {
    const a = calcularMulta(buscarNumeral({ articulo: '389', literal: '1' })!, sbu).monto
    const b = calcularMulta(buscarNumeral({ articulo: '390', literal: '3' })!, sbu).monto
    expect(a - b).toBeCloseTo(72.3, 2)
  })
})

describe('búsqueda léxica desde el lenguaje de la calle', () => {
  it('"me metí en contravía" lleva al Art. 390.3', () => {
    const [mejor] = buscarRapido('me meti en contravia', 1)
    expect(mejor?.numeral.articulo).toBe('390')
    expect(mejor?.numeral.literal).toBe('3')
  })

  it('"me pasé el rojo" lleva al Art. 389.1', () => {
    const [mejor] = buscarRapido('me pase el rojo', 1)
    expect(mejor?.numeral.articulo).toBe('389')
    expect(mejor?.numeral.literal).toBe('1')
  })

  it('"hablando por celular" lleva al Art. 391.12', () => {
    const [mejor] = buscarRapido('me pararon por hablando por celular', 1)
    expect(mejor?.numeral.articulo).toBe('391')
    expect(mejor?.numeral.literal).toBe('12')
  })

  it('"sin casco" lleva al Art. 389.11', () => {
    const [mejor] = buscarRapido('sin casco', 1)
    expect(mejor?.numeral.articulo).toBe('389')
    expect(mejor?.numeral.literal).toBe('11')
  })
})

describe('análisis del caso de ejemplo', () => {
  const citacion = parsearCitacion(casoEjemplo)

  it('sin relato del usuario, la boleta es internamente coherente', () => {
    const r = analizar(citacion, null, HOY)
    // La observación dice "no respetar semáforo" y el rubro es 389.1, que
    // literalmente menciona semáforos: no hay contradicción interna.
    expect(r.hallazgos.find((h) => h.regla === 'R01a')).toBeUndefined()
    expect(r.montoLegal).toBe(144.6)
  })

  it('con el relato real aparece la discrepancia y su diferencia en dólares', () => {
    const r = analizar(
      citacion,
      { hecho: 'me metí sin querer a una calle en sentido contrario', numeralSugerido: null },
      HOY,
    )
    const r01b = r.hallazgos.find((h) => h.regla === 'R01b')
    expect(r01b).toBeDefined()
    expect(r01b?.detalle).toContain('390')
    expect(r01b?.detalle).toContain('$72.30')
    expect(r01b?.detalle).toContain('$144.60')
  })

  it('marca el numeral genérico frente al específico más barato', () => {
    const r = analizar(citacion, { hecho: 'contravia', numeralSugerido: null }, HOY)
    expect(r.hallazgos.find((h) => h.regla === 'R10')).toBeDefined()
  })

  it('reporta el término de impugnación vencido el 13 de agosto', () => {
    const r = analizar(citacion, null, HOY)
    const r08 = r.hallazgos.find((h) => h.regla === 'R08')
    expect(r08?.titulo).toContain('VENCIDO')
    expect(r08?.titulo).toContain('2026-08-12')
  })

  it('señala los campos vacíos como "a verificar", nunca como nulidad', () => {
    const r = analizar(citacion, null, HOY)
    const r04 = r.hallazgos.find((h) => h.regla === 'R04')
    expect(r04?.requiereVerificacion).toBe(true)
    expect(r04?.severidad).toBe('media')
  })

  it('propone comprobar que el semáforo exista en el sitio', () => {
    const r = analizar(citacion, null, HOY)
    const r06 = r.hallazgos.find((h) => h.regla === 'R06')
    expect(r06?.detalle).toContain('semáforo')
    expect(r06?.detalle).toContain('AV EJEMPLO Y CALLE MUESTRA')
  })

  it('no inventa un descuento de puntos que la reforma de 2021 eliminó', () => {
    const r = analizar(citacion, null, HOY)
    expect(r.hallazgos.find((h) => h.regla === 'R03')).toBeUndefined()
  })
})

describe('reglas que dependen de otros datos', () => {
  it('R03 salta cuando una contravención de cuarta clase descuenta puntos', () => {
    const texto = 'Rubro: Art. 389 - Lit. 01\nPuntos Perdidos: 6\nFecha de emisión: 06-08-2026'
    const r = analizar(parsearCitacion(texto), null, HOY)
    expect(r.hallazgos.find((h) => h.regla === 'R03')?.severidad).toBe('alta')
  })

  it('R02 salta cuando el monto cobrado no es el porcentaje legal', () => {
    const texto = 'Rubro: Art. 390 - Lit. 03\nValor: 144.60\nFecha de emisión: 06-08-2026'
    const r = analizar(parsearCitacion(texto), null, HOY)
    const r02 = r.hallazgos.find((h) => h.regla === 'R02')
    expect(r02).toBeDefined()
    expect(r02?.detalle).toContain('$72.30')
  })

  it('R11 avisa de la ambigüedad estructural del Art. 386', () => {
    const texto = 'Rubro: Art. 386 - Lit. 01\nFecha de emisión: 06-08-2026'
    const r = analizar(parsearCitacion(texto), null, HOY)
    expect(r.hallazgos.find((h) => h.regla === 'R11')).toBeDefined()
  })
})
