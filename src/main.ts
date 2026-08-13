import './style.css'
import { montar } from './ui/app'
import { reanudarSiYaEstaLista } from './core/busqueda'
import { registerSW } from 'virtual:pwa-register'

const raiz = document.getElementById('app')
if (raiz) montar(raiz)

// Si el modelo ya se descargó antes, se reactiva solo. Nadie debería tener que
// acordarse de encender algo que ya encendió una vez.
void reanudarSiYaEstaLista()

registerSW({ immediate: true })
