/** Pantalla "Evidencia": lo capturado, y el paquete que se le entrega al abogado. */
import {
  borrarPieza,
  crearCaso,
  guardarPieza,
  listarCasos,
  listarPiezas,
  pedirPersistencia,
} from '../evidencia/almacen'
import type { Caso, Pieza } from '../evidencia/almacen'
import { ubicacionActual } from '../evidencia/captura'
import { capturarFoto } from './camara'
import { descargar, generarExpediente } from '../evidencia/expediente'
import { avisar, boton, el, vaciar } from './dom'

function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function tarjetaPieza(pieza: Pieza, alBorrar: () => void): HTMLElement {
  const tarjeta = el('article', { class: 'tarjeta' })
  tarjeta.append(
    el(
      'div',
      {},
      el('span', { class: 'etiqueta' }, pieza.tipo),
      el('span', { class: 'etiqueta' }, pesoLegible(pieza.tamano)),
    ),
    el('p', { class: 'sutil' }, new Date(pieza.creadaEn).toLocaleString('es-EC')),
  )

  if (pieza.ubicacion) {
    tarjeta.append(
      el(
        'p',
        { class: 'sutil' },
        `${pieza.ubicacion.latitud.toFixed(6)}, ${pieza.ubicacion.longitud.toFixed(6)} (±${Math.round(pieza.ubicacion.precisionMetros)} m)`,
      ),
    )
  }

  if (pieza.tipo === 'audio' || pieza.tipo === 'video') {
    const reproductor = document.createElement(pieza.tipo === 'video' ? 'video' : 'audio')
    reproductor.controls = true
    reproductor.preload = 'none'
    reproductor.src = URL.createObjectURL(pieza.blob)
    reproductor.style.width = '100%'
    tarjeta.append(reproductor)
  } else if (pieza.tipo === 'foto') {
    const img = el('img', { alt: 'Foto capturada', loading: 'lazy' })
    img.src = URL.createObjectURL(pieza.blob)
    img.style.width = '100%'
    img.style.borderRadius = '10px'
    tarjeta.append(img)
  }

  tarjeta.append(
    el('p', { class: 'huella' }, `SHA-256: ${pieza.hash}`),
    boton('Borrar', alBorrar, 'fantasma compacto'),
  )
  return tarjeta
}

export function vistaEvidencia(): HTMLElement {
  const raiz = el('main')
  raiz.append(
    el('h1', {}, 'Evidencia'),
    el(
      'p',
      { class: 'sutil' },
      'Todo se guarda solo en este teléfono. La app no tiene servidor ni cuenta: si la desinstalas, ' +
        'esto se borra. Exporta el paquete y guárdalo aparte.',
    ),
  )

  const contenedor = el('div')
  raiz.append(contenedor)

  const refrescar = async () => {
    vaciar(contenedor)
    const casos = await listarCasos()

    contenedor.append(
      boton(
        'Nuevo caso',
        async () => {
          const titulo = prompt('Nombre del caso (ej: control 13-ago, citación MNCEM-…)')
          if (!titulo) return
          await crearCaso(titulo, null)
          await refrescar()
        },
        'fantasma',
      ),
    )

    if (casos.length === 0) {
      contenedor.append(
        el(
          'p',
          { class: 'sutil' },
          'Todavía no hay nada. Cuando grabes algo desde la pantalla "Ahora", aparecerá aquí.',
        ),
      )
      return
    }

    for (const caso of casos) {
      contenedor.append(await bloqueCaso(caso, refrescar))
    }
  }

  void pedirPersistencia().then(() => refrescar())
  return raiz
}

async function bloqueCaso(caso: Caso, refrescar: () => Promise<void>): Promise<HTMLElement> {
  const piezas = await listarPiezas(caso.id)
  const seccion = el('section')
  seccion.append(
    el('h2', {}, caso.titulo),
    el(
      'p',
      { class: 'sutil' },
      `Abierto el ${new Date(caso.creadoEn).toLocaleString('es-EC')} · ${piezas.length} pieza(s)`,
    ),
  )

  const acciones = el('div', { class: 'fila' })
  acciones.append(
    boton(
      'Tomar foto',
      async () => {
        try {
          // El GPS se pide mientras la persona encuadra, no despues de
          // disparar: si no, la foto tarda segundos en aparecer y parece rota.
          const ubicacionEnCurso = ubicacionActual(15000)
          const blob = await capturarFoto()
          if (!blob) return // canceló
          const ubicacion = await Promise.race([
            ubicacionEnCurso,
            new Promise<null>((r) => setTimeout(() => r(null), 800)),
          ])
          await guardarPieza({
            caso: caso.id,
            tipo: 'foto',
            blob,
            nombreArchivo: 'foto.jpg',
            ubicacion,
          })
          avisar('Foto guardada.')
          await refrescar()
        } catch (e) {
          avisar(`No se pudo tomar la foto: ${e instanceof Error ? e.message : ''}`)
        }
      },
      'compacto fantasma',
    ),
    boton(
      'Añadir nota',
      async () => {
        const nota = prompt('Escribe lo que recuerdes: hora, calle, qué dijo el agente, quién estaba.')
        if (!nota) return
        await guardarPieza({
          caso: caso.id,
          tipo: 'nota',
          blob: new Blob([`${new Date().toISOString()}\n\n${nota}\n`], { type: 'text/plain' }),
          nombreArchivo: 'nota.txt',
          ubicacion: await ubicacionActual(4000),
          nota: nota.slice(0, 120),
        })
        await refrescar()
      },
      'compacto fantasma',
    ),
  )
  seccion.append(acciones)

  if (piezas.length > 0) {
    seccion.append(
      boton(
        `Generar expediente (${piezas.length} archivo(s))`,
        async () => {
          const paquete = await generarExpediente(caso)
          descargar(paquete.blob, paquete.nombreArchivo)
          avisar(`Paquete listo. Huella: ${paquete.hashPaquete.slice(0, 16)}…`)
        },
        'principal',
      ),
    )
    for (const pieza of piezas) {
      seccion.append(
        tarjetaPieza(pieza, async () => {
          if (!confirm('¿Borrar esta pieza? No se puede deshacer.')) return
          await borrarPieza(pieza.id)
          await refrescar()
        }),
      )
    }
  }

  return seccion
}
