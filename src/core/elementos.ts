/**
 * Qué tiene que existir en el mundo real para que una conducta encaje en un
 * numeral. Es la base de la refutación: no se discute la intención de nadie, se
 * comprueba si el elemento que la norma invoca estaba ahí.
 */
import type { Numeral } from './tipos'

const ELEMENTOS: [RegExp, string][] = [
  [/sem[aá]foro/i, 'un semáforo, y encendido'],
  [/\bpare\b/i, 'una señal de PARE'],
  [/ceda el paso/i, 'una señal de CEDA EL PASO'],
  [/se[ñn]alizaci[oó]n|se[ñn]ales/i, 'la señalización que se invoca, visible desde el volante'],
  [/ciclov[ií]a/i, 'una ciclovía demarcada'],
  [/l[ií]nea f[eé]rrea/i, 'un cruce de línea férrea señalizado'],
  [/v[ií]as exclusivas|carril exclusivo/i, 'la demarcación del carril exclusivo'],
  [/sentido contrario/i, 'señalización de sentido único, clara y visible'],
  [/l[ií]mites de velocidad/i, 'el límite señalizado en ese tramo, y un medidor calibrado'],
  [/zonas? de seguridad|curvas|puentes|t[uú]neles/i, 'que el sitio sea realmente uno de los que enumera la norma'],
  [/lugares no permitidos|sitios prohibidos/i, 'la prohibición señalizada en ese punto'],
]

export function elementosDe(numeral: Numeral): string[] {
  return ELEMENTOS.filter(([p]) => p.test(numeral.conducta)).map(([, n]) => n)
}

/**
 * Guion corto para decir en voz alta, sin pelear: qué habría que comprobar para
 * que esa imputación se sostenga.
 */
export function guionDeRefutacion(numeral: Numeral): string[] {
  const lineas: string[] = []
  const elementos = elementosDe(numeral)

  if (elementos.length > 0) {
    lineas.push(`Para que se configure tiene que haber ${elementos.join('; ')}.`)
  }
  if (numeral.condicionExpresa) {
    lineas.push(`La norma lo exige expresamente: ${numeral.condicionExpresa}`)
  }
  if (numeral.generica) {
    lineas.push(
      'Es un numeral de alcance amplio. Si el hecho encaja en uno específico, en derecho sancionador la norma especial desplaza a la general.',
    )
  }
  if (numeral.puntosTextoOriginal > 0 && numeral.puntosVigentes === 0) {
    lineas.push(
      `Aquí no se pierden puntos: la reforma de 2021 los suprimió para las contravenciones de tercera a séptima clase, aunque el texto del COIP siga diciendo ${numeral.puntosTextoOriginal}.`,
    )
  }
  lineas.push('Pide que conste en la boleta el hecho concreto, no solo el número del artículo.')
  return lineas
}
