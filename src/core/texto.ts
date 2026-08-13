/** Normalización de texto. La gente escribe sin tildes y con prisa. */

const COMBINANTES = /[\u0300-\u036f]/g

/** Minúsculas, sin tildes, sin puntuación, espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(COMBINANTES, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

/** Igual que `normalizar` pero en mayúsculas, para comparar rubros de portales. */
export function normalizarClave(texto: string): string {
  return normalizar(texto).toUpperCase()
}

/**
 * Palabras vacías.
 *
 * Ojo con qué se mete aquí: en este dominio hay palabras que parecen vacías y
 * son justo lo contrario. "contra" es la mitad de "contravía"; "sin" distingue
 * "sin casco" de "casco"; "no" invierte el sentido de "no respetar la señal".
 * Tenerlas en esta lista hacía que "me pasé en contra vía" se redujera a
 * [pase, via] y acabara en el artículo equivocado, con el doble de multa.
 */
const VACIAS = new Set([
  'a','al','ante','anti','asi','aun','aunque','cada','como','con','cual','cuando','cuyo',
  'de','del','desde','donde','dos','e','el','ella','ellas','ello','ellos','en','entre','era','eran',
  'es','esa','esas','ese','eso','esos','esta','estan','estas','este','esto','estos','fue','fueron',
  'ha','han','hasta','hay','la','las','le','les','lo','los','mas','me','mi','misma','mismo','mucho',
  'muy','nos','otra','otras','otro','otros','para','pero','poco','por','porque','que',
  'quien','se','segun','ser','si','sobre','son','su','sus','tal','tambien','tanto','te',
  'tiene','todo','todos','tras','tu','un','una','uno','unos','y','ya',
  // ruido específico del dominio: aparece en casi todos los numerales y no discrimina
  'conductor','conductora','persona','personas','vehiculo','vehiculos','automotor','ol',
])

/**
 * Variantes que la gente escribe separado y la ley junto, o al revés. Sin esto
 * "contra via" nunca alcanza a "contravía".
 */
const EQUIVALENCIAS: [RegExp, string][] = [
  [/\bcontra\s+via\b/g, 'contravia'],
  [/\ben\s+contra\b/g, 'contravia'],
  [/\bal\s+reves\b/g, 'contravia'],
  [/\bsentido\s+contrario\b/g, 'contravia sentido contrario'],
  [/\bluz\s+roja\b/g, 'semaforo rojo'],
  [/\bme\s+comi\b/g, 'me pase'],
  [/\bcelu\b/g, 'celular'],
  [/\bmovil\b/g, 'celular'],
  [/\bcinturon\s+de\s+seguridad\b/g, 'cinturon'],
]

/** Aplica las equivalencias sobre texto ya normalizado. */
export function expandir(texto: string): string {
  let salida = texto
  for (const [patron, reemplazo] of EQUIVALENCIAS) salida = salida.replace(patron, reemplazo)
  return salida
}

/** Normalizado y sin espacios. Sirve para comparar "contra via" con "contravia". */
export function pegado(texto: string): string {
  return normalizar(texto).replace(/ /g, '')
}

/** Tokeniza y quita palabras vacías. Palabras de 1 letra no aportan. */
export function tokens(texto: string): string[] {
  return expandir(normalizar(texto))
    .split(' ')
    .filter((t) => t.length > 1 && !VACIAS.has(t))
}
