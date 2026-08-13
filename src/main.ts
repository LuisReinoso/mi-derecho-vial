import './style.css'
import { montar } from './ui/app'
import { reanudarSiYaEstaLista } from './core/busqueda'
import { iniciarActualizaciones } from './actualizacion'

const raiz = document.getElementById('app')
if (raiz) montar(raiz)

// Si el modelo ya se descargó antes, se reactiva solo. Nadie debería tener que
// acordarse de encender algo que ya encendió una vez.
void reanudarSiYaEstaLista()

// La app se mantiene sola en la última versión. Ver src/actualizacion.ts.
void iniciarActualizaciones()
