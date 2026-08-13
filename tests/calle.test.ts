import { describe, expect, it } from 'vitest'
import { buscarRapido } from '../src/core/busqueda'
import { tokens } from '../src/core/texto'

const mejor = (q: string) => {
  const [r] = buscarRapido(q, 3)
  return r ? `${r.numeral.articulo}.${r.numeral.literal}` : 'nada'
}

/**
 * Regresión del caso reportado desde un teléfono: "Me pase en contra via"
 * devolvía el Art. 389.1 ($144.60) en vez del 390.3 ($72.30). La palabra
 * "contra" estaba en la lista de palabras vacías y se tiraba a la basura.
 */
describe('contravía escrita como salga', () => {
  const variantes = [
    'Me pase en contra via',
    'me meti en contra via',
    'contra via',
    'contravia',
    'me fui en contra',
    'me meti al reves',
    'entre a la calle al reves',
    'iba en sentido contrario',
    'circular en contravia',
  ]
  for (const q of variantes) {
    it(`"${q}" lleva al Art. 390.3`, () => {
      expect(mejor(q)).toBe('390.3')
    })
  }
})

describe('palabras que parecen vacías y no lo son', () => {
  it('"contra", "sin" y "no" sobreviven a la tokenización', () => {
    expect(tokens('me pase en contra via')).toContain('contravia')
    expect(tokens('sin casco')).toContain('sin')
    expect(tokens('no respetar la senal')).toContain('no')
  })
})

describe('lo que ya funcionaba sigue funcionando', () => {
  const casos: [string, string][] = [
    ['me pase el rojo', '389.1'],
    ['me comi la luz roja', '389.1'],
    ['no respetar semaforo', '389.1'],
    ['sin casco', '389.11'],
    ['sin licencia', '386.1'],
    ['sin portar la licencia', '391.21'],
    ['hablando por celular', '391.12'],
    ['con el celu manejando', '391.12'],
    ['sin cinturon', '392.6'],
    ['mal estacionado', '391.5'],
    ['vidrios polarizados', '391.11'],
    ['licencia caducada', '387.2'],
  ]
  for (const [q, esperado] of casos) {
    it(`"${q}" -> Art. ${esperado}`, () => {
      expect(mejor(q)).toBe(esperado)
    })
  }
})
