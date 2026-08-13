/**
 * Buscar por el número que te está mostrando el agente.
 *
 * Es el caso más frecuente y el más urgente: te enseñan la pantalla del
 * handheld o el papel y dice "Art. 389 Lit. 01". Escribirlo tiene que dar en el
 * blanco al primer intento, no aproximarse.
 */
import { NUMERALES, buscarNumeral, numeralesDeArticulo } from '../coip'
import { normalizar } from '../texto'
import type { Numeral } from '../tipos'

const ARTICULOS = new Set(NUMERALES.map((n) => n.articulo))

export interface ConsultaPorReferencia {
  /** Numerales que la referencia identifica, ya ordenados. */
  numerales: Numeral[]
  articulo: string
  literal: string | null
  /** true cuando solo se dio el artículo y hay que elegir el numeral. */
  incompleta: boolean
}

/**
 * Acepta lo que la gente teclea de verdad:
 *   389 · 389.1 · 389,1 · art 389 · Art. 389 - Lit. 01 · articulo 389 numeral 1
 *   389 1 · 389-1 · artículo 390 lit 3
 */
export function referenciaDesdeConsulta(consulta: string): ConsultaPorReferencia | null {
  const texto = normalizar(consulta)

  // El artículo siempre es de tres cifras en el rango que cubre esta base.
  const mArticulo = texto.match(/\b(3[0-9]{2})\b/)
  if (!mArticulo?.[1]) return null

  const articulo = mArticulo[1]
  if (!ARTICULOS.has(articulo)) return null

  // El literal es el número que venga después del artículo, con o sin palabra
  // de por medio. Se exige que esté después para no confundirlo con otra cosa.
  const resto = texto.slice((mArticulo.index ?? 0) + articulo.length)
  const mLiteral = resto.match(/^(?:\s|lit|literal|num|numeral|inciso)*\s*(\d{1,2})\b/)
  const literal = mLiteral?.[1] ? String(Number(mLiteral[1])) : null

  if (literal) {
    const exacto = buscarNumeral({ articulo, literal })
    if (exacto) {
      return { numerales: [exacto], articulo, literal, incompleta: false }
    }
    // Número de literal que no existe en ese artículo: se devuelve el artículo
    // completo en vez de mentir con una coincidencia inventada.
    return { numerales: numeralesDeArticulo(articulo), articulo, literal: null, incompleta: true }
  }

  return { numerales: numeralesDeArticulo(articulo), articulo, literal: null, incompleta: true }
}

/** ¿La consulta es solo un número de artículo, sin lenguaje natural alrededor? */
export function pareceSoloReferencia(consulta: string): boolean {
  return /^(art|articulo)?\s*3[0-9]{2}\s*(lit|literal|num|numeral|inciso)?\s*\d{0,2}$/.test(
    normalizar(consulta),
  )
}
