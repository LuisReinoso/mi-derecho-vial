/** Pantalla "Derechos": lo que conviene tener claro antes de abrir la boca. */
import entidadesCrudo from '../data/entidades.json'
import { FUERA_DE_ALCANCE } from '../core/busqueda'
import { metaCoip } from '../core/coip'
import { sbuMasReciente } from '../core/calculadora'
import {
  activarSemantica,
  alCambiarEstado,
  estadoSemantico,
  olvidarIndice,
} from '../core/busqueda'
import type { EstadoSemantico } from '../core/busqueda'
import { avisar, boton, el } from './dom'

interface Denuncia {
  via: string
  cuando: string
  url: string | null
  que_llevar: string[]
}

interface Entidad {
  codigo: string
  nombre: string
  gestor: string
  cobertura: string
  portal_servicios: string | null
  consulta_citaciones?: string
  acceso?: string
  pago_en_linea?: string
  pago_presencial?: string
  aviso_movil?: string
  si_no_puedes_pagar_en_linea?: string
  direccion_matriz?: string
  telefonos?: string[]
  correo?: string
  verificado?: string
}

const datos = entidadesCrudo as unknown as {
  entidades: Entidad[]
  denuncias: Denuncia[]
  regla_de_oro_pago: string
}

/** Dónde se paga de verdad, con los enlaces comprobados de cada entidad. */
function bloqueEntidad(e: Entidad): HTMLElement {
  const t = el('article', { class: 'tarjeta' })
  t.append(
    el('h3', {}, e.nombre),
    el('p', { class: 'sutil' }, `${e.gestor} · ${e.cobertura}`),
  )

  if (e.consulta_citaciones) {
    t.append(
      el(
        'a',
        { class: 'boton principal', href: e.consulta_citaciones, target: '_blank', rel: 'noopener noreferrer' },
        'Consultar y pagar mi citación',
      ),
    )
  } else if (e.portal_servicios) {
    t.append(
      el(
        'a',
        { class: 'boton fantasma', href: e.portal_servicios, target: '_blank', rel: 'noopener noreferrer' },
        'Portal de la entidad',
      ),
    )
  }

  if (e.acceso) t.append(el('p', {}, e.acceso))
  if (e.aviso_movil) t.append(el('div', { class: 'aviso' }, e.aviso_movil))
  if (e.si_no_puedes_pagar_en_linea) {
    t.append(el('p', {}, `Si no puedes pagar en línea: ${e.si_no_puedes_pagar_en_linea}`))
  }
  if (e.pago_en_linea) t.append(el('p', {}, `En línea: ${e.pago_en_linea}`))
  if (e.pago_presencial) t.append(el('p', {}, `Presencial: ${e.pago_presencial}`))
  if (e.direccion_matriz) t.append(el('p', { class: 'sutil' }, `Matriz: ${e.direccion_matriz}`))

  if (e.telefonos?.length) {
    const lista = el('ul', { class: 'lista' })
    for (const tel of e.telefonos) lista.append(el('li', {}, tel))
    t.append(lista)
  }
  if (e.correo) t.append(el('p', { class: 'sutil' }, e.correo))
  if (e.verificado) {
    t.append(el('p', { class: 'sutil' }, `Enlaces comprobados el ${e.verificado}.`))
  }
  return t
}

const DERECHOS: [string, string][] = [
  [
    'Puedes grabar',
    'Estás en la vía pública y eres parte de la conversación. Grabar tu propio control es la forma más simple de que después no sea tu palabra contra otra. Avisa que estás grabando, con calma.',
  ],
  [
    'Puedes pedir identificación',
    'Puedes pedir el nombre y el número de placa del servidor que te detiene, y pedir que consten en la boleta. La LOTTTSV detalla los elementos que debe contener el parte.',
  ],
  [
    'El pago nunca es en efectivo ni por transferencia personal',
    datos.regla_de_oro_pago,
  ],
  [
    'Exigir dinero por el cargo es un delito',
    'La conducta de exigir o recibir dinero indebidamente prevaliéndose del cargo se llama concusión y está tipificada en el Art. 281 del COIP. No es una falta administrativa menor.',
  ],
  [
    'Una boleta falsa también es delito',
    'La reforma de 2021 a la LOTTTSV incorporó una disposición expresa: los servidores de control de tránsito que incurran en falsedad, engaño o fraude procesal en los informes a su cargo quedan sujetos a acción penal, además de responsabilidad civil y administrativa.',
  ],
  [
    'Tienes 3 días de término para impugnar',
    'Son días hábiles y no cuenta el día de la notificación (COIP Art. 644). Es poquísimo tiempo: es la razón principal por la que la gente pierde el derecho a defenderse.',
  ],
  [
    'Puedes pedir copia certificada del expediente',
    'Es un derecho de la persona sancionada, no requiere abogado ni presencia física, y se puede pedir por correo. Es la mejor forma de saber qué se registró realmente. Vale la pena pedirla incluso si ya pagaste.',
  ],
  [
    'Pagar no cierra todas las puertas',
    'Pagar sí cierra la impugnación judicial. No impide el reclamo administrativo por error de tipificación ni la denuncia si hubo conducta irregular. Son vías distintas.',
  ],
  [
    'La Defensoría Pública patrocina gratis',
    'La impugnación requiere patrocinio de abogado. Si no puedes pagarlo, la Defensoría Pública lo hace sin costo.',
  ],
]

function bloqueIa(): HTMLElement {
  const seccion = el('section', { class: 'tarjeta' })
  const estado = el('p', { class: 'sutil' })
  const accion = el('div')

  const pintar = (e: EstadoSemantico) => {
    estado.textContent =
      e.fase === 'apagado'
        ? 'Ahora mismo la búsqueda usa solo coincidencia de palabras y sinónimos. Funciona bien y no pesa nada.'
        : e.fase === 'descargando'
          ? `Descargando el modelo… ${e.progreso}% (${e.archivo})`
          : e.fase === 'indexando'
            ? `Analizando los artículos del COIP en tu teléfono… ${e.hechos}/${e.total}`
            : e.fase === 'listo'
              ? `Lista. ${e.numerales} numerales indexados en este dispositivo. Ya funciona sin internet.`
              : `Error: ${e.mensaje}`

    accion.replaceChildren(
      e.fase === 'listo'
        ? boton('Desactivar y liberar espacio', () => void olvidarIndice(), 'fantasma compacto')
        : e.fase === 'descargando' || e.fase === 'indexando'
          ? el('p', { class: 'sutil' }, 'No cierres la app hasta que termine.')
          : boton('Activar búsqueda inteligente', () => void activarSemantica(), 'principal'),
    )
  }

  alCambiarEstado(pintar)
  pintar(estadoSemantico())

  seccion.append(
    el('h3', {}, 'Búsqueda inteligente (opcional)'),
    el(
      'p',
      {},
      'Con nervios nadie escribe "circular en sentido contrario a la vía normal de circulación": ' +
        'escribe "me metí al revés". Esto entiende la intención aunque no coincida ni una palabra.',
    ),
    el(
      'p',
      { class: 'sutil' },
      'Descarga un modelo de unos 120 MB una sola vez, con wifi. Después todo corre dentro de tu ' +
        'teléfono, sin conexión y sin enviar tus búsquedas a ningún servidor.',
    ),
    estado,
    accion,
  )
  return seccion
}

/**
 * Qué versión está corriendo. La actualización es automática: esto está aquí
 * para poder diagnosticar desde la calle, no para que nadie tenga que pulsarlo.
 */
function bloqueVersion(): HTMLElement {
  const seccion = el('section', { class: 'tarjeta' })
  seccion.append(
    el('h3', {}, 'Versión instalada'),
    el('p', { class: 'sutil' }, `Compilada el ${__VERSION__} (UTC).`),
    el(
      'p',
      { class: 'sutil' },
      'La app se actualiza sola: comprueba al abrirla, al volver a ella y cada media hora. ' +
        'Si hay versión nueva se aplica al momento, salvo que estés grabando: en ese caso espera ' +
        'a que termines.',
    ),
    boton(
      'Comprobar ahora',
      async () => {
        const { comprobarAhora } = await import('../actualizacion')
        await comprobarAhora()
        avisar('Comprobado. Si había una versión nueva, la app se recargará sola.')
      },
      'fantasma compacto',
    ),
  )
  return seccion
}

export function vistaDerechos(): HTMLElement {
  const raiz = el('main')
  raiz.append(el('h1', {}, 'Tus derechos'))

  raiz.append(el('div', { class: 'aviso rojo' }, datos.regla_de_oro_pago))

  for (const [titulo, texto] of DERECHOS) {
    const t = el('article', { class: 'tarjeta' })
    t.append(el('h3', {}, titulo), el('p', {}, texto))
    raiz.append(t)
  }

  raiz.append(el('h2', {}, 'Dónde pagar'))
  raiz.append(
    el(
      'p',
      { class: 'sutil' },
      'Pagar cierra la vía de impugnación, pero no el reclamo administrativo por error de ' +
        'tipificación ni la denuncia si hubo conducta irregular. Antes de pagar, comprueba que el ' +
        'monto sea el porcentaje del SBU que fija el artículo: si es mayor, pregunta qué son esos ' +
        'valores de más.',
    ),
  )
  for (const e of datos.entidades) raiz.append(bloqueEntidad(e))

  raiz.append(el('h2', {}, 'Dónde denunciar'))
  for (const d of datos.denuncias) {
    const t = el('article', { class: 'tarjeta' })
    t.append(el('h3', {}, d.via), el('p', {}, d.cuando))
    const lista = el('ul', { class: 'lista' })
    for (const q of d.que_llevar) lista.append(el('li', {}, q))
    t.append(el('p', { class: 'sutil' }, 'Qué llevar:'), lista)
    if (d.url) {
      const a = el('a', { class: 'boton fantasma', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.url)
      t.append(a)
    }
    raiz.append(t)
  }

  raiz.append(el('h2', {}, 'Lo que esta app NO cubre'))
  for (const f of FUERA_DE_ALCANCE) {
    const t = el('article', { class: 'tarjeta media' })
    t.append(el('h3', {}, `${f.tema} (${f.referencia})`), el('p', {}, f.mensaje))
    raiz.append(t)
  }

  raiz.append(el('h2', {}, 'Ajustes'))
  raiz.append(bloqueIa())
  raiz.append(bloqueVersion())

  const sbu = sbuMasReciente()
  raiz.append(el('h2', {}, 'De dónde salen los datos'))
  raiz.append(
    el(
      'article',
      { class: 'tarjeta' },
      el('p', { class: 'sutil' }, metaCoip.norma),
      el('p', { class: 'sutil' }, `Consultado el ${metaCoip.consultado}.`),
      el('p', { class: 'sutil' }, `SBU ${sbu.anio}: $${sbu.sbu.toFixed(2)} — ${sbu.norma}`),
      el('p', { class: 'sutil' }, metaCoip.nota_puntos),
      el('p', { class: 'sutil' }, metaCoip.advertencia),
    ),
  )

  raiz.append(
    el(
      'footer',
      { class: 'legal' },
      'Mi Derecho Vial es software libre (MIT). El código y los datos legales están ' +
        'abiertos para que cualquiera pueda revisarlos y corregirlos. Si encuentras un ' +
        'porcentaje mal o una fuente desactualizada, ese es exactamente el tipo de error ' +
        'que hay que reportar.',
    ),
  )

  return raiz
}
