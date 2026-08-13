/**
 * Cálculo de montos. Aquí no hay ni un solo valor de multa escrito a mano:
 * el COIP fija porcentajes y el SBU cambia cada año.
 */
import sbuCrudo from '../data/sbu_historico.json'
import type { Numeral } from './tipos'

interface ValorSbu {
  anio: number
  sbu: number
  norma: string
  publicacion: string | null
  vigencia_desde: string
  fuente: string | null
  verificar: boolean
}

const historico = (sbuCrudo as unknown as { valores: ValorSbu[] }).valores
  .slice()
  .sort((a, b) => b.anio - a.anio)

export interface SbuAplicado {
  anio: number
  sbu: number
  norma: string
  verificar: boolean
}

/** SBU del año de la infracción. Una multa de 2025 se calcula con el SBU de 2025. */
export function sbuDelAnio(anio: number): SbuAplicado | null {
  const exacto = historico.find((v) => v.anio === anio)
  if (exacto) {
    return { anio: exacto.anio, sbu: exacto.sbu, norma: exacto.norma, verificar: exacto.verificar }
  }
  return null
}

export function sbuMasReciente(): SbuAplicado {
  const v = historico[0]
  if (!v) throw new Error('sbu_historico.json está vacío')
  return { anio: v.anio, sbu: v.sbu, norma: v.norma, verificar: v.verificar }
}

export function redondearCentavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

export interface MontoCalculado {
  numeral: Numeral
  sbu: SbuAplicado
  porcentaje: number
  monto: number
  puntos: number
}

export function calcularMulta(numeral: Numeral, sbu: SbuAplicado): MontoCalculado {
  return {
    numeral,
    sbu,
    porcentaje: numeral.porcentajeSbu,
    monto: redondearCentavos(sbu.sbu * numeral.porcentajeSbu),
    puntos: numeral.puntosVigentes,
  }
}

/** Diferencia entre lo que cobra un numeral y lo que cobraría otro. */
export function diferenciaEntre(a: MontoCalculado, b: MontoCalculado): number {
  return redondearCentavos(Math.abs(a.monto - b.monto))
}

export function formatearUsd(valor: number): string {
  return `$${valor.toFixed(2)}`
}

export function formatearPorcentaje(fraccion: number): string {
  const pct = fraccion * 100
  const texto = Number.isInteger(pct) ? String(pct) : pct.toFixed(1)
  return `${texto}% del SBU`
}
