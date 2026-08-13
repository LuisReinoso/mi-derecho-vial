/**
 * Pantalla "Ahora": la que se abre estando parado frente a un agente.
 *
 * Dos cosas, y nada más que distraiga: empezar a grabar, y contrastar en
 * segundos lo que te acaban de decir contra lo que dice el COIP.
 */
import { buscar, buscarRapido, avisoFueraDeAlcance, estadoSemantico } from '../core/busqueda'
import type { Resultado } from '../core/busqueda'
import { calcularMulta, formatearPorcentaje, formatearUsd, sbuMasReciente } from '../core/calculadora'
import { clave } from '../core/coip'
import { guionDeRefutacion } from '../core/elementos'
import type { Numeral } from '../core/tipos'
import entidadesCrudo from '../data/entidades.json'
import { crearCaso, guardarPieza, listarCasos, pedirPersistencia } from '../evidencia/almacen'
import type { Caso } from '../evidencia/almacen'
import { iniciarGrabacion, ubicacionActual } from '../evidencia/captura'
import type { Grabacion } from '../evidencia/captura'
import { avisar, boton, el, vaciar } from './dom'

const REGLA_DE_ORO = (entidadesCrudo as unknown as { regla_de_oro_pago: string }).regla_de_oro_pago

let grabacion: Grabacion | null = null
let casoActivo: Caso | null = null
/** Artículo que el agente dice que te va a poner, para comparar contra él. */
let numeralDelAgente: Numeral | null = null
let inicioGrabacion = 0
let cronometro: number | null = null

async function casoParaGrabar(): Promise<Caso> {
  if (casoActivo) return casoActivo
  const existentes = await listarCasos()
  const hoy = new Date().toISOString().slice(0, 10)
  const deHoy = existentes.find((c) => c.creadoEn.startsWith(hoy))
  casoActivo = deHoy ?? (await crearCaso(`Control del ${new Date().toLocaleDateString('es-EC')}`, null))
  return casoActivo
}

function formatearDuracion(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function tarjetaResultado(r: Resultado, alFijar: (n: Numeral) => void): HTMLElement {
  const sbu = sbuMasReciente()
  const monto = calcularMulta(r.numeral, sbu)
  const n = r.numeral
  const fijado = numeralDelAgente

  const tarjeta = el('article', { class: 'tarjeta' })
  tarjeta.append(
    el(
      'div',
      {},
      el('span', { class: 'etiqueta' }, `Art. ${n.articulo}.${n.literal}`),
      el('span', { class: 'etiqueta' }, `${n.clase} clase`),
      r.origen.includes('referencia') ? el('span', { class: 'etiqueta ok' }, 'coincidencia exacta') : null,
      r.origen.includes('semantico') ? el('span', { class: 'etiqueta' }, 'IA') : null,
    ),
    el('div', { class: 'monto' }, formatearUsd(monto.monto)),
    el(
      'p',
      { class: 'sutil' },
      `${formatearPorcentaje(n.porcentajeSbu)} · SBU ${sbu.anio} ${formatearUsd(sbu.sbu)} · ` +
        (n.puntosVigentes > 0 ? `${n.puntosVigentes} puntos` : 'sin reducción de puntos'),
    ),
    el('p', {}, n.conducta),
  )

  if (n.puntosTextoOriginal > 0 && n.puntosVigentes === 0) {
    tarjeta.append(
      el(
        'p',
        { class: 'sutil' },
        `El texto del COIP dice ${n.puntosTextoOriginal} puntos, pero la reforma de 2021 suprimió la ` +
          `reducción de puntos para contravenciones de tercera a séptima clase. Si te dicen que pierdes puntos, no es así.`,
      ),
    )
  }

  if (n.condicionExpresa) {
    tarjeta.append(el('div', { class: 'aviso' }, `La ley exige además: ${n.condicionExpresa}`))
  }

  if (n.generica && n.notaGenerica) {
    tarjeta.append(el('div', { class: 'aviso' }, n.notaGenerica))
  }

  if (r.frases.length > 0) {
    const d = el('details')
    d.append(el('summary', {}, 'También se lo llama así'), el('p', { class: 'sutil' }, r.frases.join(' · ')))
    tarjeta.append(d)
  }

  const fuente = el('details')
  fuente.append(
    el('summary', {}, 'Sanción textual y fuente'),
    el('p', { class: 'sutil' }, n.sancionTexto),
    el('p', { class: 'sutil' }, `Consultado el ${n.consultado} en ${n.fuente}`),
  )
  tarjeta.append(fuente)

  // Comparación contra lo que el agente dice que te va a poner.
  if (fijado && clave(fijado) !== clave(n)) {
    const suyo = calcularMulta(fijado, sbu).monto
    const diferencia = Math.round((monto.monto - suyo) * 100) / 100
    tarjeta.append(
      el(
        'div',
        { class: diferencia > 0 ? 'aviso' : 'aviso' },
        diferencia === 0
          ? 'Cuesta lo mismo que el artículo que él invoca.'
          : diferencia < 0
            ? `${formatearUsd(Math.abs(diferencia))} MENOS que el Art. ${fijado.articulo}.${fijado.literal} que él invoca.`
            : `${formatearUsd(diferencia)} más que el Art. ${fijado.articulo}.${fijado.literal} que él invoca.`,
      ),
    )
  } else if (!fijado) {
    tarjeta.append(boton('Es el que me está diciendo el agente', () => alFijar(n), 'fantasma compacto'))
  }

  return tarjeta
}

/** Banda fija con el artículo que invoca el agente y cómo contrastarlo. */
function bandaDelAgente(numeral: Numeral, alQuitar: () => void): HTMLElement {
  const sbu = sbuMasReciente()
  const monto = calcularMulta(numeral, sbu)
  const banda = el('section', { class: 'tarjeta alta' })

  banda.append(
    el('span', { class: 'etiqueta alta' }, 'lo que dice el agente'),
    el('h3', {}, `Art. ${numeral.articulo} numeral ${numeral.literal}`),
    el('div', { class: 'monto' }, formatearUsd(monto.monto)),
    el('p', { class: 'sutil' }, `${formatearPorcentaje(numeral.porcentajeSbu)} · SBU ${sbu.anio}`),
    el('p', {}, numeral.conducta),
  )

  const guion = el('ul', { class: 'lista' })
  for (const linea of guionDeRefutacion(numeral)) guion.append(el('li', {}, linea))
  banda.append(el('h3', {}, 'Qué comprobar, con calma'), guion)

  banda.append(
    el(
      'p',
      { class: 'sutil' },
      'Ahora busca abajo lo que realmente pasó: si encaja en otro numeral, verás la diferencia en dólares.',
    ),
    boton('Quitar', alQuitar, 'fantasma compacto'),
  )
  return banda
}

export function vistaAhora(): HTMLElement {
  const raiz = el('main')

  raiz.append(
    el('h1', {}, 'Ahora'),
    el('p', { class: 'sutil' }, 'Sin internet, sin cuenta, sin enviar nada a ningún lado.'),
  )

  // --- Grabación ------------------------------------------------------------
  const estadoGrabacion = el('p', { class: 'sutil' }, 'Nada se está grabando.')
  const btnGrabar = boton('● GRABAR AUDIO', () => alternarGrabacion(false), 'peligro')
  const btnVideo = boton('Grabar video', () => alternarGrabacion(true), 'fantasma compacto')
  const btnUbicacion = boton('Guardar mi ubicación', guardarUbicacion, 'fantasma compacto')

  async function alternarGrabacion(video: boolean): Promise<void> {
    if (grabacion) {
      const g = grabacion
      grabacion = null
      if (cronometro) window.clearInterval(cronometro)
      btnGrabar.classList.remove('grabando')
      btnGrabar.textContent = '● GRABAR AUDIO'
      try {
        const blob = await g.detener()
        const caso = await casoParaGrabar()
        const ubicacion = await ubicacionActual(4000)
        const pieza = await guardarPieza({
          caso: caso.id,
          tipo: blob.type.startsWith('video') ? 'video' : 'audio',
          blob,
          nombreArchivo: `grabacion.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`,
          ubicacion,
        })
        estadoGrabacion.textContent = `Guardado (${formatearDuracion(Date.now() - inicioGrabacion)}). Huella SHA-256: ${pieza.hash.slice(0, 16)}…`
        avisar('Grabación guardada en tu teléfono.')
      } catch (e) {
        estadoGrabacion.textContent = `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`
      }
      return
    }

    try {
      await pedirPersistencia()
      grabacion = await iniciarGrabacion({ video })
      inicioGrabacion = Date.now()
      btnGrabar.classList.add('grabando')
      cronometro = window.setInterval(() => {
        btnGrabar.textContent = `■ DETENER  ${formatearDuracion(Date.now() - inicioGrabacion)}`
      }, 500)
      estadoGrabacion.textContent = video
        ? 'Grabando video y audio. Se guarda solo en este teléfono.'
        : 'Grabando audio. Se guarda solo en este teléfono.'
    } catch (e) {
      estadoGrabacion.textContent =
        'No se pudo acceder al micrófono. Revisa los permisos del navegador. ' +
        (e instanceof Error ? e.message : '')
    }
  }

  async function guardarUbicacion(): Promise<void> {
    const ubicacion = await ubicacionActual()
    if (!ubicacion) {
      avisar('No se pudo obtener la ubicación.')
      return
    }
    const caso = await casoParaGrabar()
    const texto = `Ubicación registrada\n${ubicacion.latitud}, ${ubicacion.longitud}\nPrecisión: ±${Math.round(ubicacion.precisionMetros)} m\nHora: ${ubicacion.capturadaEn}\n`
    await guardarPieza({
      caso: caso.id,
      tipo: 'ubicacion',
      blob: new Blob([texto], { type: 'text/plain' }),
      nombreArchivo: 'ubicacion.txt',
      ubicacion,
    })
    avisar(`Ubicación guardada (±${Math.round(ubicacion.precisionMetros)} m).`)
  }

  const bloqueGrabacion = el('section', { class: 'tarjeta' })
  bloqueGrabacion.append(btnGrabar, estadoGrabacion, el('div', { class: 'fila' }, btnVideo, btnUbicacion))
  raiz.append(bloqueGrabacion)

  raiz.append(el('div', { class: 'aviso rojo' }, REGLA_DE_ORO))

  // --- Búsqueda -------------------------------------------------------------
  raiz.append(
    el('h2', {}, '¿Qué te están diciendo?'),
    el(
      'p',
      { class: 'sutil' },
      'Si te muestran el número, escríbelo tal cual: "389.1", "Art. 390 Lit. 03". ' +
        'Si no, descríbelo como salga: "me pasé el rojo", "me metí al revés".',
    ),
  )
  const entrada = el('input', {
    type: 'search',
    placeholder: 'ej: 389.1, contravía, sin casco…',
    'aria-label': 'Número del artículo o descripción de la infracción',
    enterkeyhint: 'search',
    autocomplete: 'off',
    inputmode: 'text',
  })
  const banda = el('div')
  const resultados = el('div')
  raiz.append(entrada, banda, resultados)

  let ultimaConsulta = ''

  const repintar = () => {
    vaciar(banda)
    if (numeralDelAgente) {
      banda.append(
        bandaDelAgente(numeralDelAgente, () => {
          numeralDelAgente = null
          repintar()
        }),
      )
    }
    pintar(buscarRapido(ultimaConsulta, 4), ultimaConsulta)
  }

  const fijar = (n: Numeral) => {
    numeralDelAgente = n
    entrada.value = ''
    ultimaConsulta = ''
    entrada.focus()
    repintar()
  }

  const pintar = (lista: Resultado[], consulta: string) => {
    vaciar(resultados)

    const fuera = avisoFueraDeAlcance(consulta)
    if (fuera) {
      resultados.append(
        el('div', { class: 'aviso rojo' }, `${fuera.tema} (${fuera.referencia}). ${fuera.mensaje}`),
      )
    }

    if (lista.length === 0) {
      resultados.append(
        el(
          'p',
          { class: 'sutil' },
          consulta.length > 1
            ? 'Nada coincide. Prueba con el número del artículo, o con otras palabras: lo que diría el agente, o lo que hiciste.'
            : '',
        ),
      )
      return
    }
    for (const r of lista) resultados.append(tarjetaResultado(r, fijar))
  }

  entrada.addEventListener('input', () => {
    const consulta = entrada.value.trim()
    ultimaConsulta = consulta
    // Respuesta inmediata con BM25: en la calle, esperar no es una opción.
    pintar(buscarRapido(consulta, 4), consulta)

    if (estadoSemantico().fase === 'listo') {
      void buscar(consulta, 4).then((mejores) => {
        if (ultimaConsulta === consulta) pintar(mejores, consulta)
      })
    }
  })

  raiz.append(
    el(
      'footer',
      { class: 'legal' },
      'Esta app organiza normativa pública del Ecuador. No es asesoría legal y no ' +
        'emite juicios sobre ninguna persona: contrasta lo que te dicen contra lo que ' +
        'dice la ley. Para actuar sobre una citación concreta, consulta con un abogado ' +
        'o con la Defensoría Pública, que patrocina gratis.',
    ),
  )

  return raiz
}
