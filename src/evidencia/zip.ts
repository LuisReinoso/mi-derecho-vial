/**
 * Escritor de ZIP mínimo, método "store" (sin compresión).
 *
 * Sin dependencias a propósito: la app tiene que pesar poco y funcionar sin
 * red. Y no comprimir no cuesta nada aquí, porque audio, video y JPEG ya vienen
 * comprimidos; solo el índice de texto pierde algo de tamaño.
 */

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i += 1) {
    c = (TABLA_CRC[(c ^ (datos[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

export interface EntradaZip {
  nombre: string
  datos: Uint8Array<ArrayBuffer>
  fecha: Date
}

function fechaDos(d: Date): { hora: number; fecha: number } {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f)
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, fecha }
}

export function crearZip(entradas: EntradaZip[]): Blob {
  const codificador = new TextEncoder()
  const partes: Uint8Array<ArrayBuffer>[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let desplazamiento = 0

  for (const entrada of entradas) {
    const nombre = new Uint8Array(codificador.encode(entrada.nombre))
    const crc = crc32(entrada.datos)
    const { hora, fecha } = fechaDos(entrada.fecha)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // versión mínima
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 0, true) // método: store
    local.setUint16(10, hora, true)
    local.setUint16(12, fecha, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, entrada.datos.length, true)
    local.setUint32(22, entrada.datos.length, true)
    local.setUint16(26, nombre.length, true)
    local.setUint16(28, 0, true)

    partes.push(new Uint8Array(local.buffer), nombre, entrada.datos)

    const dir = new Uint8Array(46 + nombre.length)
    const vista = new DataView(dir.buffer)
    vista.setUint32(0, 0x02014b50, true)
    vista.setUint16(4, 20, true)
    vista.setUint16(6, 20, true)
    vista.setUint16(8, 0x0800, true)
    vista.setUint16(10, 0, true)
    vista.setUint16(12, hora, true)
    vista.setUint16(14, fecha, true)
    vista.setUint32(16, crc, true)
    vista.setUint32(20, entrada.datos.length, true)
    vista.setUint32(24, entrada.datos.length, true)
    vista.setUint16(28, nombre.length, true)
    vista.setUint32(42, desplazamiento, true)
    dir.set(nombre, 46)
    central.push(dir)

    desplazamiento += 30 + nombre.length + entrada.datos.length
  }

  const tamanoCentral = central.reduce((s, c) => s + c.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, entradas.length, true)
  fin.setUint16(10, entradas.length, true)
  fin.setUint32(12, tamanoCentral, true)
  fin.setUint32(16, desplazamiento, true)

  const bloques: Uint8Array<ArrayBuffer>[] = [
    ...partes,
    ...central,
    new Uint8Array(fin.buffer),
  ]
  const total = bloques.reduce((s, b) => s + b.length, 0)
  const salida = new Uint8Array(total)
  let cursor = 0
  for (const b of bloques) {
    salida.set(b, cursor)
    cursor += b.length
  }

  return new Blob([salida], { type: 'application/zip' })
}
