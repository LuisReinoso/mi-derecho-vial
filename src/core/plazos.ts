/**
 * Cómputo de plazos. Es el módulo más delicado del proyecto: la mayoría de la
 * gente no pierde el derecho a defenderse por falta de razón, sino por no saber
 * que "tres días de término" no son tres días de calendario.
 */
import feriadosCrudo from '../data/feriados_ec.json'
import type { ResultadoPlazo } from './tipos'

interface Feriado {
  fecha: string
  nombre: string
  nota?: string
}

interface AnioFeriados {
  verificado: boolean
  fuente: string
  fuente_url: string
  dias: Feriado[]
}

const feriados = feriadosCrudo as unknown as {
  meta: { advertencia_feriados_locales: string; base_legal_traslados: string }
  anios: Record<string, AnioFeriados>
}

export const ADVERTENCIA_FERIADOS_LOCALES = feriados.meta.advertencia_feriados_locales

// ---------------------------------------------------------------------------
// Fechas en UTC puro. Trabajar en hora local invita a errores de un día cuando
// cambia el huso o el horario de verano de la máquina.
// ---------------------------------------------------------------------------

export function fecha(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia))
}

export function aISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function desdeISO(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return fecha(a ?? 1970, m ?? 1, d ?? 1)
}

/** Descarta la hora y deja la fecha en UTC, para comparar días sin ruido. */
export function soloFecha(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function sumarDias(d: Date, n: number): Date {
  const salida = new Date(d.getTime())
  salida.setUTCDate(salida.getUTCDate() + n)
  return salida
}

export function diferenciaDias(desde: Date, hasta: Date): number {
  const ms = soloFecha(hasta).getTime() - soloFecha(desde).getTime()
  return Math.round(ms / 86_400_000)
}

// ---------------------------------------------------------------------------
// Feriados
// ---------------------------------------------------------------------------

/** Domingo de Pascua (algoritmo de Meeus/Butcher, calendario gregoriano). */
export function domingoPascua(anio: number): Date {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return fecha(anio, mes, dia)
}

interface FeriadoBase {
  nombre: string
  fecha: Date
  trasladable: boolean
}

/**
 * Feriados nacionales calculados a partir de la ley, para años sin lista
 * oficial cargada. Es una aproximación razonable, nunca una fuente oficial.
 */
export function feriadosCalculados(anio: number): Feriado[] {
  const pascua = domingoPascua(anio)
  const base: FeriadoBase[] = [
    { nombre: 'Año Nuevo', fecha: fecha(anio, 1, 1), trasladable: false },
    { nombre: 'Carnaval (lunes)', fecha: sumarDias(pascua, -48), trasladable: false },
    { nombre: 'Carnaval (martes)', fecha: sumarDias(pascua, -47), trasladable: false },
    { nombre: 'Viernes Santo', fecha: sumarDias(pascua, -2), trasladable: false },
    { nombre: 'Día del Trabajo', fecha: fecha(anio, 5, 1), trasladable: true },
    { nombre: 'Batalla de Pichincha', fecha: fecha(anio, 5, 24), trasladable: true },
    { nombre: 'Primer Grito de Independencia', fecha: fecha(anio, 8, 10), trasladable: true },
    { nombre: 'Independencia de Guayaquil', fecha: fecha(anio, 10, 9), trasladable: true },
    { nombre: 'Día de los Difuntos', fecha: fecha(anio, 11, 2), trasladable: true },
    { nombre: 'Independencia de Cuenca', fecha: fecha(anio, 11, 3), trasladable: true },
    { nombre: 'Navidad', fecha: fecha(anio, 12, 25), trasladable: false },
  ]

  const ocupados = new Set<string>()
  const salida: Feriado[] = []
  for (const f of base) {
    let destino = f.trasladable ? trasladar(f.fecha) : f.fecha
    // Si el traslado choca con otro feriado ya asignado, el día se queda donde
    // estaba: la ley busca sumar días de descanso, no solaparlos.
    if (ocupados.has(aISO(destino))) destino = f.fecha
    ocupados.add(aISO(destino))
    salida.push({ fecha: aISO(destino), nombre: f.nombre })
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Reglas de traslado del R.O. Suplemento 906 de 20-dic-2016. */
function trasladar(d: Date): Date {
  switch (d.getUTCDay()) {
    case 6: // sábado -> viernes anterior
      return sumarDias(d, -1)
    case 0: // domingo -> lunes siguiente
      return sumarDias(d, 1)
    case 2: // martes -> lunes anterior
      return sumarDias(d, -1)
    case 3: // miércoles -> viernes de esa semana
      return sumarDias(d, 2)
    case 4: // jueves -> viernes de esa semana
      return sumarDias(d, 1)
    default: // lunes y viernes se quedan
      return d
  }
}

export interface CalendarioAnio {
  anio: number
  verificado: boolean
  fuente: string | null
  feriados: Map<string, string>
}

const cache = new Map<number, CalendarioAnio>()

export function calendario(anio: number): CalendarioAnio {
  const enCache = cache.get(anio)
  if (enCache) return enCache

  const oficial = feriados.anios[String(anio)]
  const dias = oficial ? oficial.dias : feriadosCalculados(anio)
  const mapa = new Map<string, string>()
  for (const f of dias) mapa.set(f.fecha, f.nombre)

  const resultado: CalendarioAnio = {
    anio,
    verificado: oficial?.verificado ?? false,
    fuente: oficial?.fuente ?? null,
    feriados: mapa,
  }
  cache.set(anio, resultado)
  return resultado
}

export function esFeriado(d: Date): string | null {
  return calendario(d.getUTCFullYear()).feriados.get(aISO(d)) ?? null
}

export function esFinDeSemana(d: Date): boolean {
  const dia = d.getUTCDay()
  return dia === 0 || dia === 6
}

/** Día hábil = ni sábado, ni domingo, ni feriado nacional. */
export function esHabil(d: Date): boolean {
  return !esFinDeSemana(d) && esFeriado(d) === null
}

// ---------------------------------------------------------------------------
// Términos
// ---------------------------------------------------------------------------

export interface ComputoTermino {
  vence: Date
  /** Explicación día por día, para poder mostrar el cómputo y no pedir fe. */
  bitacora: string[]
  advertencias: string[]
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function nombreDia(d: Date): string {
  return DIAS_SEMANA[d.getUTCDay()] ?? ''
}

/**
 * Suma `n` días de término (solo hábiles) empezando el día siguiente al de la
 * notificación: en derecho ecuatoriano el día de la notificación no se cuenta.
 */
export function sumarDiasTermino(notificacion: Date, n: number): ComputoTermino {
  const bitacora: string[] = []
  const advertencias: string[] = []
  const aniosVistos = new Set<number>()

  let cursor = soloFecha(notificacion)
  bitacora.push(`Notificación: ${nombreDia(cursor)} ${aISO(cursor)} (no se cuenta)`)

  let contados = 0
  let guarda = 0
  while (contados < n && guarda < 400) {
    guarda += 1
    cursor = sumarDias(cursor, 1)
    aniosVistos.add(cursor.getUTCFullYear())
    const feriado = esFeriado(cursor)
    if (esFinDeSemana(cursor)) {
      bitacora.push(`${nombreDia(cursor)} ${aISO(cursor)}: fin de semana, no cuenta`)
    } else if (feriado) {
      bitacora.push(`${nombreDia(cursor)} ${aISO(cursor)}: feriado (${feriado}), no cuenta`)
    } else {
      contados += 1
      bitacora.push(`${nombreDia(cursor)} ${aISO(cursor)}: día ${contados} de ${n}`)
    }
  }

  for (const anio of aniosVistos) {
    const cal = calendario(anio)
    if (!cal.verificado) {
      advertencias.push(
        `No hay lista oficial de feriados cargada para ${anio}: se usó el cálculo por reglas de traslado. Verifica el calendario oficial antes de confiar en esta fecha.`,
      )
    }
  }
  advertencias.push(ADVERTENCIA_FERIADOS_LOCALES)

  return { vence: cursor, bitacora, advertencias }
}

// ---------------------------------------------------------------------------
// Plazos concretos de una citación
// ---------------------------------------------------------------------------

export const PLAZOS = {
  impugnacionDias: 3,
  prontoPagoDias: 20,
  caducidadNotificacionDias: 90,
} as const

export function plazoImpugnacion(notificacion: Date, hoy: Date): ResultadoPlazo {
  const c = sumarDiasTermino(notificacion, PLAZOS.impugnacionDias)
  const restantes = diferenciaDias(hoy, c.vence)
  return {
    nombre: 'Impugnación (COIP Art. 644)',
    vence: c.vence,
    diasRestantes: restantes,
    vencido: restantes < 0,
    diasContados: c.bitacora,
    advertencias: c.advertencias,
  }
}

export function plazoProntoPago(notificacion: Date, hoy: Date): ResultadoPlazo {
  const vence = sumarDias(soloFecha(notificacion), PLAZOS.prontoPagoDias)
  const restantes = diferenciaDias(hoy, vence)
  return {
    nombre: 'Pronto pago con descuento',
    vence,
    diasRestantes: restantes,
    vencido: restantes < 0,
    diasContados: [
      `Notificación: ${aISO(soloFecha(notificacion))}`,
      `+${PLAZOS.prontoPagoDias} días de calendario`,
    ],
    advertencias: [
      'El descuento por pronto pago no está en el COIP sino en normativa de descuento y en la política de cada entidad: confirma el valor exacto en el portal antes de pagar.',
      'El descuento aplica a infracciones tipificadas en el COIP. Las multas por ordenanza municipal se rigen por su propia norma.',
    ],
  }
}

export function plazoCaducidadNotificacion(infraccion: Date, notificacion: Date): ResultadoPlazo {
  const limite = sumarDias(soloFecha(infraccion), PLAZOS.caducidadNotificacionDias)
  const dias = diferenciaDias(infraccion, notificacion)
  return {
    nombre: 'Notificación dentro de plazo',
    vence: limite,
    diasRestantes: diferenciaDias(notificacion, limite),
    vencido: dias > PLAZOS.caducidadNotificacionDias,
    diasContados: [
      `Infracción: ${aISO(soloFecha(infraccion))}`,
      `Notificación: ${aISO(soloFecha(notificacion))}`,
      `Diferencia: ${dias} días de calendario`,
    ],
    advertencias: [
      'La caducidad por falta de notificación oportuna es un argumento que debe alegarse y probarse; no opera sola.',
    ],
  }
}
