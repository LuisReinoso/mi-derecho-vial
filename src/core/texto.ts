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

const VACIAS = new Set([
  'a','al','ante','anti','asi','aun','aunque','cada','como','con','contra','cual','cuando','cuyo',
  'de','del','desde','donde','dos','e','el','ella','ellas','ello','ellos','en','entre','era','eran',
  'es','esa','esas','ese','eso','esos','esta','estan','estas','este','esto','estos','fue','fueron',
  'ha','han','hasta','hay','la','las','le','les','lo','los','mas','me','mi','misma','mismo','mucho',
  'muy','ni','no','nos','o','otra','otras','otro','otros','para','pero','poco','por','porque','que',
  'quien','se','segun','ser','si','sin','sobre','solo','son','su','sus','tal','tambien','tanto','te',
  'tiene','todo','todos','tras','tu','un','una','uno','unos','y','ya',
  // ruido específico del dominio: aparece en casi todos los numerales y no discrimina
  'conductor','conductora','persona','personas','vehiculo','vehiculos','automotor','o','ol',
])

/** Tokeniza y quita palabras vacías. Palabras de 1 letra no aportan. */
export function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((t) => t.length > 1 && !VACIAS.has(t))
}
