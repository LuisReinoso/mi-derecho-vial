/**
 * Parser de texto pegado.
 *
 * Decisión de diseño deliberada: la app NO consulta ningún portal. La persona
 * consulta su propia citación, selecciona, copia y pega. Así el proyecto sirve
 * para cualquier entidad del país sin integrar veinte portales distintos, y es
 * imposible usarlo para husmear las multas de otra persona.
 */
import type { Citacion, RefNumeral } from './tipos'
import { normalizar } from './texto'
import { rubroConocido } from './coip'

/** Etiquetas conocidas y sus variantes entre entidades. */
const ETIQUETAS: Record<keyof EtiquetasMapeadas, string[]> = {
  numero: ['no citacion', 'nro citacion', 'numero de citacion', 'n citacion', 'citacion', 'numero citacion', 'no de citacion'],
  placa: ['placa', 'placa vehiculo', 'placa del vehiculo'],
  documento: ['documento', 'identificacion', 'cedula ruc', 'documento identidad'],
  fechaEmision: ['fecha de emision', 'fecha emision', 'fecha de infraccion', 'fecha infraccion', 'fecha'],
  fechaLimitePago: ['fecha limite de pago', 'fecha limite pago', 'fecha maxima de pago', 'vencimiento'],
  fechaNotificacion: ['fecha de notificacion', 'fecha notificacion'],
  tipo: ['tipo', 'tipo de citacion', 'tipo infraccion'],
  observacion: ['observacion', 'observaciones', 'detalle', 'hecho', 'descripcion'],
  rubroTexto: ['rubro', 'articulo', 'infraccion', 'contravencion'],
  entidad: ['entidad', 'institucion', 'organismo'],
  puntosPerdidos: ['puntos perdidos', 'puntos', 'reduccion de puntos'],
  agente: ['agente de transito', 'agente', 'servidor', 'funcionario'],
  lugar: ['lugar', 'sitio', 'direccion', 'ubicacion'],
  provincia: ['provincia'],
  localidad: ['localidad', 'canton', 'ciudad'],
  zona: ['zona'],
  distrito: ['distrito'],
  circuito: ['circuito'],
  origen: ['origen', 'dispositivo', 'medio'],
  montoCobrado: ['valor', 'monto', 'total', 'valor a pagar', 'total a pagar', 'valor multa'],
}

interface EtiquetasMapeadas {
  numero: string
  placa: string
  documento: string
  fechaEmision: string
  fechaLimitePago: string
  fechaNotificacion: string
  tipo: string
  observacion: string
  rubroTexto: string
  entidad: string
  puntosPerdidos: string
  agente: string
  lugar: string
  provincia: string
  localidad: string
  zona: string
  distrito: string
  circuito: string
  origen: string
  montoCobrado: string
}

const INDICE_ETIQUETAS = new Map<string, keyof EtiquetasMapeadas>()
for (const [campo, variantes] of Object.entries(ETIQUETAS)) {
  for (const v of variantes) INDICE_ETIQUETAS.set(v, campo as keyof EtiquetasMapeadas)
}

function reconocerEtiqueta(texto: string): keyof EtiquetasMapeadas | null {
  const n = normalizar(texto)
  if (!n) return null
  return INDICE_ETIQUETAS.get(n) ?? null
}

/** Fechas dd-mm-aaaa, dd/mm/aaaa y aaaa-mm-dd, con hora opcional. */
export function parsearFecha(valor: string | null): Date | null {
  if (!valor) return null
  const texto = valor.trim()

  const iso = texto.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) {
    const [, a, m, d] = iso
    return construirFecha(Number(a), Number(m), Number(d))
  }

  const dmy = texto.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmy) {
    const [, d, m, a] = dmy
    return construirFecha(Number(a), Number(m), Number(d))
  }

  return null
}

function construirFecha(anio: number, mes: number, dia: number): Date | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return d
}

/** "Art. 389 - Lit. 01 - COND.QUE DESOBEDEZCA..." -> { 389, 1 } */
export function parsearRubro(texto: string | null): RefNumeral | null {
  if (!texto) return null
  const conLiteral = texto.match(/art\.?\s*(\d{3})\D{0,20}?lit\.?\s*(\d{1,2})/i)
  if (conLiteral) {
    const [, art, lit] = conLiteral
    if (art && lit) return { articulo: art, literal: String(Number(lit)) }
  }
  const soloArticulo = texto.match(/art\.?\s*(\d{3})/i)
  if (soloArticulo?.[1]) {
    const porGlosario = rubroConocido(texto)
    if (porGlosario && porGlosario.articulo === soloArticulo[1]) return porGlosario
    return null
  }
  return rubroConocido(texto)
}

function parsearNumero(valor: string | null): number | null {
  if (!valor) return null
  const m = valor.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const VACIO = /^[-–—.\s]*$/

function limpiar(valor: string): string | null {
  const v = valor.trim()
  if (!v || VACIO.test(v)) return null
  return v
}

export function parsearCitacion(textoOriginal: string): Citacion {
  const bruto: Partial<Record<keyof EtiquetasMapeadas, string>> = {}
  const camposNoReconocidos: Record<string, string> = {}

  const lineas = textoOriginal
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter((l) => l.length > 0)

  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i]
    if (!linea) continue

    // Caso 1: "Etiqueta: valor" o "Etiqueta<tab>valor"
    const conSeparador = linea.match(/^([^:\t]{2,40})[:\t]\s*(.*)$/)
    if (conSeparador) {
      const [, etiquetaCruda = '', valorCrudo = ''] = conSeparador
      const campo = reconocerEtiqueta(etiquetaCruda)
      if (campo) {
        if (valorCrudo.trim()) bruto[campo] ??= valorCrudo.trim()
        continue
      }
      if (valorCrudo.trim() && normalizar(etiquetaCruda)) {
        camposNoReconocidos[etiquetaCruda.trim()] = valorCrudo.trim()
      }
      continue
    }

    // Caso 2: etiqueta sola en una línea y su valor en la siguiente.
    const campo = reconocerEtiqueta(linea)
    if (campo) {
      const siguiente = lineas[i + 1]
      if (siguiente && reconocerEtiqueta(siguiente) === null) {
        bruto[campo] ??= siguiente.trim()
        i += 1
      }
    }
  }

  // Rescates por patrón, para texto pegado sin etiquetas reconocibles.
  if (!bruto.numero) {
    const m = textoOriginal.match(/\b([A-Z]{3,6}-[A-Z0-9]{4,10}-\d{3,8})\b/)
    if (m?.[1]) bruto.numero = m[1]
  }
  if (!bruto.rubroTexto) {
    const m = textoOriginal.match(/Art\.?\s*3\d{2}[^\n]*/i)
    if (m?.[0]) bruto.rubroTexto = m[0].trim()
  }
  if (!bruto.placa) {
    const m = textoOriginal.match(/\b([A-Z]{3}[-\s]?\d{3,4})\b/)
    if (m?.[1]) bruto.placa = m[1].replace(/[-\s]/g, '')
  }

  const rubroTexto = bruto.rubroTexto ? limpiar(bruto.rubroTexto) : null
  const entidadCruda = bruto.entidad ? limpiar(bruto.entidad) : null

  return {
    numero: bruto.numero ? limpiar(bruto.numero) : null,
    placa: bruto.placa ? limpiar(bruto.placa)?.toUpperCase().replace(/[-\s]/g, '') ?? null : null,
    documento: bruto.documento ? limpiar(bruto.documento) : null,
    fechaEmision: parsearFecha(bruto.fechaEmision ?? null),
    fechaLimitePago: parsearFecha(bruto.fechaLimitePago ?? null),
    fechaNotificacion: parsearFecha(bruto.fechaNotificacion ?? null),
    tipo: bruto.tipo ? limpiar(bruto.tipo) : null,
    observacion: bruto.observacion ? limpiar(bruto.observacion) : null,
    rubroTexto,
    rubro: parsearRubro(rubroTexto),
    entidad: entidadCruda,
    entidadCodigo: entidadCruda ? (entidadCruda.split(/\s*[-–]\s*/)[0] ?? null) : null,
    puntosPerdidos: parsearNumero(bruto.puntosPerdidos ?? null),
    agente: bruto.agente ? limpiar(bruto.agente) : null,
    lugar: bruto.lugar ? limpiar(bruto.lugar) : null,
    provincia: bruto.provincia ? limpiar(bruto.provincia) : null,
    localidad: bruto.localidad ? limpiar(bruto.localidad) : null,
    zona: bruto.zona ? limpiar(bruto.zona) : null,
    distrito: bruto.distrito ? limpiar(bruto.distrito) : null,
    circuito: bruto.circuito ? limpiar(bruto.circuito) : null,
    origen: bruto.origen ? limpiar(bruto.origen) : null,
    montoCobrado: parsearNumero(bruto.montoCobrado ?? null),
    tieneImagenes: /im[aá]gen(es)?\s+relacionada/i.test(textoOriginal),
    camposNoReconocidos,
    textoOriginal,
  }
}
