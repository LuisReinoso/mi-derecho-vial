/**
 * Empaquetado del expediente.
 *
 * Un montón de fotos sueltas en la galería no es prueba: es material. Lo que un
 * abogado puede presentar es un paquete ordenado, con la hora de captura, la
 * ubicación y un hash por archivo que permita sostener que nada se editó
 * después. Eso es todo lo que hace este módulo.
 */
import { crearZip } from './zip'
import type { EntradaZip } from './zip'
import { listarPiezas, sha256 } from './almacen'
import type { Caso, Pieza } from './almacen'

function fechaLegible(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-EC', { dateStyle: 'full', timeStyle: 'medium' })
}

function extension(pieza: Pieza): string {
  const mime = pieza.mime.split(';')[0] ?? ''
  const mapa: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'text/plain': 'txt',
  }
  return mapa[mime] ?? 'bin'
}

function nombreEnZip(pieza: Pieza, indice: number): string {
  const orden = String(indice + 1).padStart(2, '0')
  const sello = pieza.creadaEn.replace(/[:.]/g, '-')
  return `${orden}_${pieza.tipo}_${sello}.${extension(pieza)}`
}

function enlaceMapa(pieza: Pieza): string {
  if (!pieza.ubicacion) return ''
  const { latitud, longitud } = pieza.ubicacion
  return `https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=19/${latitud}/${longitud}`
}

export function construirIndice(caso: Caso, piezas: Pieza[]): string {
  const lineas: string[] = []
  lineas.push('EXPEDIENTE DE EVIDENCIA')
  lineas.push('='.repeat(60))
  lineas.push('')
  lineas.push(`Caso: ${caso.titulo}`)
  if (caso.numeroCitacion) lineas.push(`Citación: ${caso.numeroCitacion}`)
  lineas.push(`Caso abierto: ${fechaLegible(caso.creadoEn)}`)
  lineas.push(`Paquete generado: ${fechaLegible(new Date().toISOString())}`)
  lineas.push(`Piezas: ${piezas.length}`)
  lineas.push('')
  lineas.push('Generado por Mi Derecho Vial (software libre). Todo el material fue')
  lineas.push('capturado y almacenado en el dispositivo de la persona usuaria; la')
  lineas.push('aplicación no envía nada a ningún servidor.')
  lineas.push('')
  lineas.push('-'.repeat(60))
  lineas.push('')

  piezas.forEach((pieza, i) => {
    lineas.push(`[${i + 1}] ${nombreEnZip(pieza, i)}`)
    lineas.push(`    Tipo:          ${pieza.tipo}`)
    lineas.push(`    Capturado:     ${fechaLegible(pieza.creadaEn)}`)
    lineas.push(`    Tamaño:        ${pieza.tamano} bytes`)
    lineas.push(`    Tipo MIME:     ${pieza.mime}`)
    lineas.push(`    SHA-256:       ${pieza.hash}`)
    if (pieza.ubicacion) {
      lineas.push(
        `    Ubicación:     ${pieza.ubicacion.latitud.toFixed(6)}, ${pieza.ubicacion.longitud.toFixed(6)} (±${Math.round(pieza.ubicacion.precisionMetros)} m)`,
      )
      lineas.push(`    Mapa:          ${enlaceMapa(pieza)}`)
    }
    if (pieza.nota) lineas.push(`    Nota:          ${pieza.nota}`)
    lineas.push('')
  })

  lineas.push('-'.repeat(60))
  lineas.push('')
  lineas.push('CÓMO VERIFICAR QUE NADA FUE ALTERADO')
  lineas.push('')
  lineas.push('Cada archivo tiene su huella SHA-256 anotada arriba. Para comprobar')
  lineas.push('que un archivo es idéntico al que se capturó, ejecute:')
  lineas.push('')
  lineas.push('    sha256sum <nombre-del-archivo>        (Linux)')
  lineas.push('    shasum -a 256 <nombre-del-archivo>    (macOS)')
  lineas.push('    certutil -hashfile <archivo> SHA256   (Windows)')
  lineas.push('')
  lineas.push('El resultado debe coincidir carácter por carácter con el valor de')
  lineas.push('esta lista. Si difiere, el archivo cambió después de la captura.')
  lineas.push('')
  lineas.push('El archivo huellas.txt permite verificar todo de una sola vez:')
  lineas.push('')
  lineas.push('    sha256sum -c huellas.txt')
  lineas.push('')
  lineas.push('-'.repeat(60))
  lineas.push('')
  lineas.push('ADVERTENCIA')
  lineas.push('')
  lineas.push('Este paquete es material de trabajo, no un documento certificado. Los')
  lineas.push('hashes prueban que los archivos no cambiaron desde que se generó el')
  lineas.push('paquete, no la veracidad de su contenido ni la fecha real del hecho.')
  lineas.push('Para presentarlo en un proceso, consulte con un profesional del')
  lineas.push('derecho. La Defensoría Pública patrocina gratuitamente.')
  lineas.push('')
  return lineas.join('\n')
}

export interface Expediente {
  blob: Blob
  nombreArchivo: string
  piezas: number
  hashPaquete: string
}

export async function generarExpediente(caso: Caso): Promise<Expediente> {
  const piezas = await listarPiezas(caso.id)
  const entradas: EntradaZip[] = []

  for (const [i, pieza] of piezas.entries()) {
    entradas.push({
      nombre: nombreEnZip(pieza, i),
      datos: new Uint8Array(await pieza.blob.arrayBuffer()),
      fecha: new Date(pieza.creadaEn),
    })
  }

  const codificador = new TextEncoder()
  const indice = construirIndice(caso, piezas)
  entradas.push({
    nombre: 'INDICE.txt',
    datos: new Uint8Array(codificador.encode(indice)),
    fecha: new Date(),
  })

  const huellas = piezas.map((p, i) => `${p.hash}  ${nombreEnZip(p, i)}`).join('\n') + '\n'
  entradas.push({
    nombre: 'huellas.txt',
    datos: new Uint8Array(codificador.encode(huellas)),
    fecha: new Date(),
  })

  const blob = crearZip(entradas)
  const sello = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')
  const referencia = (caso.numeroCitacion ?? caso.titulo).replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 40)

  return {
    blob,
    nombreArchivo: `expediente_${referencia}_${sello}.zip`,
    piezas: piezas.length,
    hashPaquete: await sha256(blob),
  }
}

export function descargar(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
