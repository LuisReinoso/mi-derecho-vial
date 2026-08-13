import { describe, expect, it } from 'vitest'
import { buscarRapido } from '../src/core/busqueda'

/** El agente te muestra la pantalla del handheld. Escribes lo que ves. */
describe('buscar por el número que te está mostrando el agente', () => {
  const exactos: [string, string][] = [
    ['389.1', '389.1'],
    ['389,1', '389.1'],
    ['Art. 389 - Lit. 01', '389.1'],
    ['art 390 lit 3', '390.3'],
    ['articulo 390 numeral 3', '390.3'],
    ['390 3', '390.3'],
    ['391.12', '391.12'],
    ['ART 392 LIT 06', '392.6'],
    ['artículo 388 inciso 1', '388.1'],
  ]

  for (const [consulta, esperado] of exactos) {
    it(`"${consulta}" da en el blanco al primer intento`, () => {
      const [mejor] = buscarRapido(consulta, 5)
      expect(`${mejor?.numeral.articulo}.${mejor?.numeral.literal}`).toBe(esperado)
      expect(mejor?.origen).toContain('referencia')
    })
  }

  it('solo el artículo devuelve sus numerales para elegir, no una adivinanza', () => {
    const r = buscarRapido('390', 6)
    expect(r.length).toBeGreaterThan(1)
    expect(r.every((x) => x.numeral.articulo === '390')).toBe(true)
  })

  it('un literal inexistente no inventa una coincidencia', () => {
    const r = buscarRapido('392.99', 6)
    expect(r.every((x) => x.numeral.articulo === '392')).toBe(true)
    expect(r.length).toBeGreaterThan(1)
  })

  it('un artículo fuera de alcance no devuelve nada', () => {
    expect(buscarRapido('385', 5)).toEqual([])
    expect(buscarRapido('370', 5)).toEqual([])
  })

  it('el lenguaje natural sigue mandando cuando no hay literal', () => {
    const [mejor] = buscarRapido('me pase el rojo', 1)
    expect(mejor?.numeral.articulo).toBe('389')
  })
})
