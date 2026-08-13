/** Helpers mínimos de DOM. No hace falta un framework para cuatro pantallas. */

type Hijo = Node | string | null | undefined | false

export function el<K extends keyof HTMLElementTagNameMap>(
  etiqueta: K,
  atributos: Record<string, string | boolean | number> = {},
  ...hijos: Hijo[]
): HTMLElementTagNameMap[K] {
  const nodo = document.createElement(etiqueta)
  for (const [k, v] of Object.entries(atributos)) {
    if (v === false || v === null || v === undefined) continue
    if (k === 'class') nodo.className = String(v)
    else if (k === 'text') nodo.textContent = String(v)
    else nodo.setAttribute(k, String(v))
  }
  for (const hijo of hijos) {
    if (hijo === null || hijo === undefined || hijo === false) continue
    nodo.append(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo)
  }
  return nodo
}

export function boton(
  texto: string,
  alPulsar: () => void,
  clase = '',
): HTMLButtonElement {
  const b = el('button', { class: clase, type: 'button' }, texto)
  b.addEventListener('click', alPulsar)
  return b
}

export function vaciar(nodo: HTMLElement): void {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild)
}

/** Anuncia un mensaje breve sin robar el foco. */
export function avisar(mensaje: string): void {
  let region = document.getElementById('avisos')
  if (!region) {
    region = el('div', {
      id: 'avisos',
      role: 'status',
      'aria-live': 'polite',
      style:
        'position:fixed;left:12px;right:12px;bottom:calc(var(--nav) + 12px);z-index:20;background:#1b2740;border:1px solid #2a3a5c;border-radius:14px;padding:12px;text-align:center;font-size:0.9rem',
    })
    document.body.append(region)
  }
  region.textContent = mensaje
  region.style.display = 'block'
  window.setTimeout(() => {
    if (region) region.style.display = 'none'
  }, 4000)
}
