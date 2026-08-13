import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// En GitHub Pages con dominio propio la base es '/'. En una URL de proyecto
// (usuario.github.io/repo/) hay que pasar BASE_PATH=/repo/ al construir.
const base = process.env.BASE_PATH ?? '/'

// Sello de compilación: permite ver desde el teléfono qué versión está
// corriendo, que es justo lo que hace falta cuando algo se queda en caché.
const sello = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base,
  define: {
    __VERSION__: JSON.stringify(sello),
  },
  build: {
    target: 'es2022',
    // Todo el conocimiento legal viaja dentro del bundle: sin red, sin fetch.
    assetsInlineLimit: 0,
    sourcemap: false,
    // El aviso solo aplicaría al chunk de IA, que se carga bajo demanda.
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    VitePWA({
      // El registro y la recarga los lleva src/actualizacion.ts a mano. Con el
      // registro automático se llegaba a un estado en el que el service worker
      // nuevo estaba activo pero la página seguía ejecutando el código viejo.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // La app base tiene que instalarse en segundos con mala señal. El motor
        // de IA no se precachea: solo lo descarga quien lo activa a propósito.
        globIgnores: ['**/transformers*.js', '**/sw-transicion.js'],
        // Se ejecuta dentro del service worker. Es lo único capaz de rescatar
        // a un teléfono que tiene instalada una versión que no sabe activar la
        // siguiente. Ver public/sw-transicion.js.
        importScripts: ['sw-transicion.js'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        // skipWaiting a false a propósito: el service worker nuevo espera a que
        // la app diga "ahora". Si se activara solo, la página seguiría
        // corriendo código viejo contra assets nuevos, que es exactamente el
        // estado mezclado que rompió la base de datos una vez.
        skipWaiting: false,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Runtime de ONNX y el chunk de transformers: se guardan la primera
            // vez que se usan, para que después funcionen sin conexión.
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.endsWith('.wasm') || /transformers.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'motor-ia',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Pesos del modelo de embeddings, descargados una sola vez.
            urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs[^/]*\.hf\.co)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'modelo-embeddings',
              expiration: { maxEntries: 40 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Mi Derecho Vial',
        short_name: 'Mi Derecho Vial',
        description:
          'La ley de tránsito en la mano durante un control. Montos, plazos, derechos y evidencia, sin internet.',
        lang: 'es-EC',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        // Mantener pulsado el ícono lleva directo a grabar: un toque en vez de
        // abrir la app y buscar el botón.
        shortcuts: [
          {
            name: 'Grabar ya',
            short_name: 'Grabar',
            description: 'Empieza a grabar el control de inmediato',
            url: `${base}#grabar`,
            icons: [{ src: 'icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Buscar un artículo',
            short_name: 'Buscar',
            description: 'Contrasta el artículo que te están diciendo',
            url: `${base}#ahora`,
            icons: [{ src: 'icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Mis derechos',
            short_name: 'Derechos',
            description: 'Qué puedes hacer y cómo se paga una multa',
            url: `${base}#derechos`,
            icons: [{ src: 'icon-192.png', sizes: '192x192' }],
          },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
