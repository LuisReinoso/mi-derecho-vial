import './style.css'
import { montar } from './ui/app'
import { reanudarSiYaEstaLista } from './core/busqueda'
import { registerSW } from 'virtual:pwa-register'

const raiz = document.getElementById('app')
if (raiz) montar(raiz)

// Si el modelo ya se descargó antes, se reactiva solo. Nadie debería tener que
// acordarse de encender algo que ya encendió una vez.
void reanudarSiYaEstaLista()

const actualizar = registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    // Buscar actualizaciones al volver a la app. Sin esto, un teléfono que
    // nunca cierra la pestaña puede quedarse meses con una versión vieja.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registro?.update()
    })
  },
})

/** Fuerza descargar la última versión. Se usa desde Derechos → Ajustes. */
export async function buscarActualizacion(): Promise<void> {
  await actualizar(true)
}
