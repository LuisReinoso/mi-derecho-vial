import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsearCitacion, parsearFecha, parsearRubro } from '../src/core/parser'
import { aISO } from '../src/core/plazos'

const casoEjemplo = readFileSync(
  fileURLToPath(new URL('./fixtures/caso_ejemplo_movidelnor.txt', import.meta.url)),
  'utf8',
)

describe('parser del caso de ejemplo', () => {
  const c = parsearCitacion(casoEjemplo)

  it('lee los identificadores', () => {
    expect(c.numero).toBe('MNCEM-EJEM0125-00001')
    expect(c.placa).toBe('ABC1234')
    expect(c.documento).toBe('VEH - 1700000000')
  })

  it('lee las fechas en formato dd-mm-aaaa', () => {
    expect(c.fechaEmision && aISO(c.fechaEmision)).toBe('2026-08-06')
    expect(c.fechaLimitePago && aISO(c.fechaLimitePago)).toBe('2026-08-16')
  })

  it('separa observación y rubro', () => {
    expect(c.observacion).toBe('NO RESPETAR SEMÁFORO')
    expect(c.rubro).toEqual({ articulo: '389', literal: '1' })
  })

  it('deja en null los campos que el portal muestra vacíos', () => {
    expect(c.agente).toBeNull()
    expect(c.provincia).toBeNull()
    expect(c.localidad).toBeNull()
    expect(c.zona).toBeNull()
    expect(c.distrito).toBeNull()
    expect(c.circuito).toBeNull()
  })

  it('conserva lo que sí trae', () => {
    expect(c.lugar).toBe('AV EJEMPLO Y CALLE MUESTRA')
    expect(c.origen).toBe('HANDHELP')
    expect(c.entidadCodigo).toBe('MNO')
    expect(c.puntosPerdidos).toBe(0)
    expect(c.tieneImagenes).toBe(true)
  })
})

describe('tolerancia de formatos', () => {
  it('acepta fechas iso, con barras y con guiones', () => {
    expect(aISO(parsearFecha('2026-08-06')!)).toBe('2026-08-06')
    expect(aISO(parsearFecha('06/08/2026')!)).toBe('2026-08-06')
    expect(aISO(parsearFecha('6-8-2026 18:26:50')!)).toBe('2026-08-06')
  })

  it('rechaza fechas imposibles en vez de inventarlas', () => {
    expect(parsearFecha('31-02-2026')).toBeNull()
    expect(parsearFecha('sin fecha')).toBeNull()
  })

  it('lee el rubro con y sin ceros a la izquierda', () => {
    expect(parsearRubro('Art. 390 - Lit. 03 - ALGO')).toEqual({ articulo: '390', literal: '3' })
    expect(parsearRubro('ART 391 LIT 12')).toEqual({ articulo: '391', literal: '12' })
  })

  it('acepta etiquetas en líneas separadas y con tabulaciones', () => {
    const c = parsearCitacion('Placa\tXYZ1234\nObservación\nCONTRAVIA\nRubro: Art. 390 - Lit. 3')
    expect(c.placa).toBe('XYZ1234')
    expect(c.observacion).toBe('CONTRAVIA')
    expect(c.rubro).toEqual({ articulo: '390', literal: '3' })
  })

  it('rescata el número de citación aunque no haya etiquetas', () => {
    const c = parsearCitacion('un texto cualquiera MNCEM-EJEM0125-00001 pegado a medias')
    expect(c.numero).toBe('MNCEM-EJEM0125-00001')
  })
})
