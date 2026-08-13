/**
 * Se importa dentro del service worker generado (ver workbox.importScripts).
 *
 * Resuelve un problema que solo se ve al actualizar una app ya instalada: el
 * service worker nuevo se queda ESPERANDO indefinidamente si el código que hay
 * en la pantalla es de una versión que no sabe activarlo. El usuario abre la
 * app, la app descarga la versión nueva, y sigue usando la vieja. Para siempre.
 *
 * Esto es lo único que puede arreglarlo, porque es el único código nuevo que
 * llega a ejecutarse en un dispositivo que tiene la versión vieja.
 *
 * La regla es sencilla:
 *  - Si en pantalla hay código que sabe gestionar la actualización, se le deja
 *    a él, que sabe esperar a que no estés grabando.
 *  - Si no contesta nadie, es código viejo: se toma el control y se recarga.
 */

const MARCA = 'mdv-version-instalada'
const CANAL = 'mdv-version'

/**
 * Pregunta a las pantallas abiertas si alguna sabe gestionar actualizaciones.
 * Las versiones nuevas responden por BroadcastChannel; las viejas, ni se enteran.
 */
async function hayPantallaQueSabeActualizar() {
  const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (clientes.length === 0) return false

  return new Promise((resolver) => {
    let respondio = false
    let canal
    try {
      canal = new BroadcastChannel(CANAL)
    } catch {
      resolver(false)
      return
    }
    canal.onmessage = (e) => {
      if (e.data === 'se-gestionar-actualizaciones') respondio = true
    }
    canal.postMessage('hay-alguien-ahi')
    setTimeout(() => {
      try {
        canal.close()
      } catch {
        /* da igual */
      }
      resolver(respondio)
    }, 1200)
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (await hayPantallaQueSabeActualizar()) return
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(MARCA)
      const yaHabiaUnaVersion = await cache.match('instalada')
      await cache.put('instalada', new Response('1'))

      await self.clients.claim()

      // En la primera instalación no hay nada viejo que recargar.
      if (!yaHabiaUnaVersion) return

      const clientes = await self.clients.matchAll({ type: 'window' })
      for (const cliente of clientes) {
        try {
          await cliente.navigate(cliente.url)
        } catch {
          cliente.postMessage({ tipo: 'recarga-por-version-nueva' })
        }
      }
    })(),
  )
})
