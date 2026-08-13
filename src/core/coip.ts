/**
 * Acceso tipado a la base legal. El JSON viaja dentro del bundle, así que
 * consultar la ley no necesita red en ningún momento.
 */
import crudo from '../data/coip_contravenciones.json'
import glosarioCrudo from '../data/glosario_rubros.json'
import type { Numeral, RefNumeral } from './tipos'
import { normalizarClave } from './texto'

interface LiteralCrudo {
  literal: string
  conducta: string
  puntos_vigentes?: number
  generica?: boolean
  nota_generica?: string
  condicion_expresa?: string
}

interface BloqueCrudo {
  id: string
  porcentaje_sbu: number | null
  sancion_texto: string
  prision_dias: number | null
  puntos_texto_original: number
  puntos_vigentes: number
  notas: string[]
  literales: LiteralCrudo[]
}

interface ArticuloCrudo {
  articulo: string
  clase: string
  titulo: string
  fuente: string
  consultado: string
  verificar: boolean
  bloques: BloqueCrudo[]
}

interface CoipCrudo {
  meta: {
    norma: string
    nota_puntos: string
    nota_montos: string
    advertencia: string
    consultado: string
  }
  articulos: ArticuloCrudo[]
}

const coip = crudo as unknown as CoipCrudo
const glosario = glosarioCrudo as unknown as {
  rubros: { texto_portal: string; articulo: string; literal: string; nota?: string }[]
}

export const metaCoip = coip.meta

function aplanar(): Numeral[] {
  const salida: Numeral[] = []
  for (const art of coip.articulos) {
    for (const bloque of art.bloques) {
      if (bloque.porcentaje_sbu === null) continue // sin porcentaje verificado no se publica
      for (const lit of bloque.literales) {
        salida.push({
          articulo: art.articulo,
          literal: lit.literal,
          clase: art.clase,
          conducta: lit.conducta,
          porcentajeSbu: bloque.porcentaje_sbu,
          puntosTextoOriginal: bloque.puntos_texto_original,
          puntosVigentes: lit.puntos_vigentes ?? bloque.puntos_vigentes,
          prisionDias: bloque.prision_dias,
          sancionTexto: bloque.sancion_texto,
          notas: bloque.notas,
          generica: lit.generica ?? false,
          notaGenerica: lit.nota_generica ?? null,
          condicionExpresa: lit.condicion_expresa ?? null,
          fuente: art.fuente,
          consultado: art.consultado,
        })
      }
    }
  }
  return salida
}

/** Todos los numerales de los Arts. 386 a 392, ya resueltos con su sanción. */
export const NUMERALES: readonly Numeral[] = aplanar()

const porClave = new Map<string, Numeral>()
for (const n of NUMERALES) porClave.set(`${n.articulo}.${n.literal}`, n)

export function clave(ref: RefNumeral): string {
  return `${ref.articulo}.${ref.literal}`
}

export function buscarNumeral(ref: RefNumeral | null): Numeral | null {
  if (!ref) return null
  return porClave.get(clave(ref)) ?? null
}

/**
 * El Art. 386 tiene dos bloques cuyos numerales se llaman igual (1, 2, 3).
 * Cuando una citación solo dice "Art. 386 - Lit. 01" hay ambigüedad real y
 * conviene decirlo en vez de escoger uno en silencio.
 */
export function esAmbiguo(ref: RefNumeral): boolean {
  if (ref.articulo !== '386') return false
  const art = coip.articulos.find((a) => a.articulo === '386')
  if (!art) return false
  const bloquesConEseLiteral = art.bloques.filter((b) =>
    b.literales.some((l) => l.literal === ref.literal),
  )
  return bloquesConEseLiteral.length > 1
}

/** Numerales del mismo artículo, para mostrar alternativas de tipificación. */
export function numeralesDeArticulo(articulo: string): Numeral[] {
  return NUMERALES.filter((n) => n.articulo === articulo)
}

/** Traduce el texto abreviado del rubro de un portal a un numeral. */
export function rubroConocido(textoPortal: string): RefNumeral | null {
  const normal = normalizarRubro(textoPortal)
  for (const r of glosario.rubros) {
    if (normalizarRubro(r.texto_portal) === normal) {
      return { articulo: r.articulo, literal: r.literal }
    }
  }
  return null
}

function normalizarRubro(texto: string): string {
  return normalizarClave(texto)
}
