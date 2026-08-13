/**
 * Pantalla "Mi citación": pegar el texto de la consulta y ver la diferencia
 * entre lo que dice la boleta y lo que dice la ley.
 */
import { parsearCitacion } from '../core/parser'
import { analizar } from '../core/validador'
import { aISO } from '../core/plazos'
import { formatearUsd } from '../core/calculadora'
import { checklistPara, instruccionesParaUnTercero } from '../evidencia/checklist'
import { crearCaso, guardarPieza } from '../evidencia/almacen'
import { descargar } from '../evidencia/expediente'
import { avisar, boton, el, vaciar } from './dom'
import type { Hallazgo, ResultadoAnalisis } from '../core/tipos'

const CLAVE_BORRADOR = 'mdv.borrador.citacion'

function tarjetaHallazgo(h: Hallazgo): HTMLElement {
  const tarjeta = el('article', { class: `tarjeta ${h.severidad}` })
  tarjeta.append(
    el(
      'div',
      {},
      el('span', { class: `etiqueta ${h.severidad === 'alta' ? 'alta' : h.severidad === 'media' ? 'media' : ''}` }, h.severidad),
      el('span', { class: 'etiqueta' }, h.regla),
      h.requiereVerificacion ? el('span', { class: 'etiqueta' }, 'a verificar') : null,
    ),
    el('h3', {}, h.titulo),
    el('p', {}, h.detalle),
    el('p', { class: 'sutil' }, `Base legal: ${h.baseLegal}`),
    el('p', {}, h.accionSugerida),
  )
  return tarjeta
}

function bloqueResumen(r: ResultadoAnalisis): HTMLElement {
  const c = r.citacion
  const s = el('section', { class: 'tarjeta' })
  const filas: [string, string | null][] = [
    ['Citación', c.numero],
    ['Placa', c.placa],
    ['Emitida', c.fechaEmision ? aISO(c.fechaEmision) : null],
    ['Entidad', c.entidad],
    ['Observación', c.observacion],
    ['Rubro', c.rubroTexto],
    ['Lugar', c.lugar],
    ['Origen', c.origen],
    ['Monto legal según el COIP', r.montoLegal !== null ? formatearUsd(r.montoLegal) : null],
    ['SBU aplicado', r.sbuAplicado !== null ? `${formatearUsd(r.sbuAplicado)} (${r.anioSbu})` : null],
  ]
  const lista = el('ul', { class: 'lista' })
  for (const [etiqueta, valor] of filas) {
    if (!valor) continue
    lista.append(el('li', {}, el('span', { class: 'sutil' }, `${etiqueta}: `), valor))
  }
  s.append(el('h3', {}, 'Lo que dice tu boleta'), lista)

  if (c.origen && /handhel?p|handheld/i.test(c.origen)) {
    s.append(
      el(
        'p',
        { class: 'sutil' },
        'Origen "handheld" significa que la citación se emitió desde el dispositivo móvil de un agente, ' +
          'no desde un fotorradar. Cambian las defensas disponibles: aquí hay una persona que vio algo, ' +
          'y su versión es contrastable.',
      ),
    )
  }
  return s
}

export function vistaCitacion(): HTMLElement {
  const raiz = el('main')
  raiz.append(
    el('h1', {}, 'Mi citación'),
    el(
      'p',
      { class: 'sutil' },
      'Consulta tu multa en el portal de tu entidad, copia todo el texto y pégalo aquí. ' +
        'La app no consulta ningún portal: así solo puedes analizar lo que tú mismo consultaste.',
    ),
  )

  const area = el('textarea', {
    placeholder: 'Pega aquí el texto completo de la consulta…',
    'aria-label': 'Texto de la consulta de la citación',
  })
  area.value = localStorage.getItem(CLAVE_BORRADOR) ?? ''
  area.addEventListener('input', () => localStorage.setItem(CLAVE_BORRADOR, area.value))

  const relato = el('input', {
    type: 'text',
    placeholder: 'ej: entré por equivocación a una calle en contravía',
    'aria-label': 'Qué pasó realmente, en tus palabras',
  })

  const salida = el('div')

  const analizarAhora = async () => {
    vaciar(salida)
    const texto = area.value.trim()
    if (texto.length < 10) {
      salida.append(el('p', { class: 'sutil' }, 'Pega primero el texto de la consulta.'))
      return
    }

    const citacion = parsearCitacion(texto)
    const hecho = relato.value.trim()
    const resultado = analizar(citacion, hecho ? { hecho, numeralSugerido: null } : null, new Date())

    salida.append(bloqueResumen(resultado))

    salida.append(el('h2', {}, `Hallazgos (${resultado.hallazgos.length})`))
    if (resultado.hallazgos.length === 0) {
      salida.append(el('p', { class: 'sutil' }, 'No se detectaron inconsistencias con los datos disponibles.'))
    }
    for (const h of resultado.hallazgos) salida.append(tarjetaHallazgo(h))

    for (const p of resultado.plazos) {
      const d = el('details')
      d.append(
        el('summary', {}, `Cómo se contó: ${p.nombre}`),
        el('pre', {}, p.diasContados.join('\n')),
        el('p', { class: 'sutil' }, p.advertencias.join(' ')),
      )
      salida.append(d)
    }

    // --- Evidencia a recoger ------------------------------------------------
    const items = checklistPara(resultado.numeralRubro, hecho || null)
    salida.append(el('h2', {}, 'Qué recoger, y ya'))
    const lista = el('ul', { class: 'lista' })
    for (const item of items) {
      lista.append(
        el(
          'li',
          {},
          item.urgente ? el('span', { class: 'etiqueta alta' }, 'urgente') : null,
          el('div', {}, item.que),
          el('div', { class: 'sutil' }, item.porque),
        ),
      )
    }
    salida.append(lista)

    const instrucciones = instruccionesParaUnTercero(citacion.lugar, resultado.numeralRubro, hecho || null)
    salida.append(
      boton(
        'Descargar instrucciones para quien vaya al sitio',
        () => descargar(new Blob([instrucciones], { type: 'text/plain' }), 'instrucciones-evidencia.txt'),
        'fantasma',
      ),
      boton(
        'Guardar esta citación en el expediente',
        async () => {
          const caso = await crearCaso(
            citacion.numero ?? `Citación del ${new Date().toLocaleDateString('es-EC')}`,
            citacion.numero,
          )
          await guardarPieza({
            caso: caso.id,
            tipo: 'citacion',
            blob: new Blob([texto], { type: 'text/plain' }),
            nombreArchivo: 'consulta-portal.txt',
            nota: 'Texto de la consulta al portal, tal como lo copió la persona usuaria.',
          })
          if (hecho) {
            await guardarPieza({
              caso: caso.id,
              tipo: 'nota',
              blob: new Blob([hecho], { type: 'text/plain' }),
              nombreArchivo: 'relato.txt',
              nota: 'Relato de los hechos.',
            })
          }
          avisar('Guardado. Ve a Evidencia para armar el paquete.')
        },
        'principal',
      ),
    )

    if (Object.keys(citacion.camposNoReconocidos).length > 0) {
      const d = el('details')
      d.append(
        el('summary', {}, 'Campos que el parser no supo clasificar'),
        el('pre', {}, JSON.stringify(citacion.camposNoReconocidos, null, 2)),
      )
      salida.append(d)
    }
  }

  raiz.append(
    el('label', { for: 'pegado' }, 'Texto de la consulta'),
    area,
    el('label', {}, '¿Qué pasó realmente? (opcional, pero es lo que destapa el error de tipificación)'),
    relato,
    boton('Analizar', () => void analizarAhora(), 'principal'),
    salida,
    el(
      'footer',
      { class: 'legal' },
      'El análisis compara tu boleta contra el texto del COIP. Una discrepancia puede venir ' +
        'de un error de digitación, de una mala tipificación o de un sistema que copia mal el ' +
        'hecho al rubro. La app describe la diferencia; calificarla le corresponde a un juez.',
    ),
  )

  return raiz
}
