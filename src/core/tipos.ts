/** Tipos compartidos por todo el núcleo. Nada aquí toca el DOM ni la red. */

export type Severidad = 'alta' | 'media' | 'baja' | 'informativa'
export type Confianza = 'alta' | 'media' | 'baja'

/** Un numeral concreto del COIP, ya resuelto con la sanción de su bloque. */
export interface Numeral {
  articulo: string
  literal: string
  clase: string
  conducta: string
  porcentajeSbu: number
  puntosTextoOriginal: number
  /** Puntos que realmente se descuentan hoy, tras la reforma de 2021. */
  puntosVigentes: number
  prisionDias: number | null
  sancionTexto: string
  notas: string[]
  /** Numeral de alcance amplio (cajón de sastre). Relevante para la regla R10. */
  generica: boolean
  notaGenerica: string | null
  /** Condición expresa del tipo penal que puede desvirtuarlo con prueba. */
  condicionExpresa: string | null
  fuente: string
  consultado: string
}

/** Referencia corta a un numeral, tal como aparece en un rubro o en un mapeo. */
export interface RefNumeral {
  articulo: string
  literal: string
}

/** Una citación tal como el portal la muestra, ya parseada. */
export interface Citacion {
  numero: string | null
  placa: string | null
  documento: string | null
  fechaEmision: Date | null
  fechaLimitePago: Date | null
  fechaNotificacion: Date | null
  tipo: string | null
  observacion: string | null
  rubroTexto: string | null
  rubro: RefNumeral | null
  entidad: string | null
  entidadCodigo: string | null
  puntosPerdidos: number | null
  agente: string | null
  lugar: string | null
  provincia: string | null
  localidad: string | null
  zona: string | null
  distrito: string | null
  circuito: string | null
  origen: string | null
  montoCobrado: number | null
  tieneImagenes: boolean
  /** Campos que aparecieron en el texto pero el parser no supo clasificar. */
  camposNoReconocidos: Record<string, string>
  /** Texto original, tal cual lo pegó la persona. */
  textoOriginal: string
}

/** Lo que la persona dice que realmente pasó, en sus palabras. */
export interface RelatoUsuario {
  hecho: string
  /** Numeral que el relato sugiere, si la búsqueda lo resolvió. */
  numeralSugerido: RefNumeral | null
}

export interface Hallazgo {
  regla: string
  severidad: Severidad
  titulo: string
  detalle: string
  baseLegal: string
  accionSugerida: string
  /** true cuando el hallazgo requiere comprobación externa antes de alegarlo. */
  requiereVerificacion: boolean
}

export interface ResultadoPlazo {
  nombre: string
  vence: Date | null
  diasRestantes: number | null
  vencido: boolean
  /** Días considerados en el cómputo, para poder mostrar el trabajo hecho. */
  diasContados: string[]
  advertencias: string[]
}

export interface ResultadoAnalisis {
  citacion: Citacion
  numeralRubro: Numeral | null
  numeralRelato: Numeral | null
  montoLegal: number | null
  sbuAplicado: number | null
  anioSbu: number | null
  plazos: ResultadoPlazo[]
  hallazgos: Hallazgo[]
}
