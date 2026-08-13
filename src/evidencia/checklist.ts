/**
 * Qué recolectar, según el hecho.
 *
 * La evidencia se degrada rápido: pintan la señal, podan el árbol que la
 * tapaba, arreglan el semáforo. Lo que hoy se puede probar en cinco minutos,
 * en dos semanas ya no.
 */
import type { Numeral } from '../core/tipos'

export interface ItemChecklist {
  que: string
  porque: string
  urgente: boolean
}

const SIEMPRE: ItemChecklist[] = [
  {
    que: 'Descarga las imágenes que la propia entidad adjuntó a la multa.',
    porque:
      'Es la prueba que aportó quien te sancionó, y suele ser la más difícil de refutar o la más fácil de desmontar. Los portales rotan o expiran esos archivos.',
    urgente: true,
  },
  {
    que: 'Captura de pantalla completa de la consulta, con la fecha visible.',
    porque: 'Deja constancia de qué mostraba el sistema el día que lo consultaste.',
    urgente: true,
  },
  {
    que: 'Foto de la boleta física, si te la entregaron, por ambos lados.',
    porque:
      'El portal muestra menos campos que la boleta. Antes de alegar que falta un dato, hay que ver el papel.',
    urgente: false,
  },
  {
    que: 'Anota de tu puño y letra qué pasó, con hora y calle, cuanto antes.',
    porque: 'Un relato escrito el mismo día vale mucho más que uno reconstruido tres semanas después.',
    urgente: true,
  },
]

const POR_ELEMENTO: [RegExp, ItemChecklist[]][] = [
  [
    /sem[aá]foro/i,
    [
      {
        que: 'Video continuo del punto exacto, mostrando si hay semáforo y en qué estado está.',
        porque:
          'Si en ese punto no existe semáforo, o estaba apagado o intermitente, el hecho tipificado no pudo ocurrir.',
        urgente: true,
      },
      {
        que: 'Graba un ciclo completo del semáforo, si existe, con la duración de cada luz.',
        porque: 'Un ámbar demasiado corto es un argumento técnico, no una excusa.',
        urgente: false,
      },
    ],
  ],
  [
    /se[ñn]alizaci[oó]n|se[ñn]ales|\bpare\b|ceda el paso/i,
    [
      {
        que: 'Fotos de la señal desde la posición del conductor, no desde la vereda.',
        porque:
          'Lo que importa es si la señal era visible para quien conduce. Una foto de cerca prueba que existe, no que se veía.',
        urgente: true,
      },
      {
        que: 'Si está tapada por vegetación, borrada, girada o contradictoria, fotografíala así antes de que la arreglen.',
        porque: 'Ese es exactamente el estado que hay que probar, y es el que primero desaparece.',
        urgente: true,
      },
    ],
  ],
  [
    /sentido contrario/i,
    [
      {
        que: 'Fotografía la entrada de la calle desde donde ingresaste, en el mismo sentido de marcha.',
        porque:
          'El Art. 390.3 exige que la señalización esté "clara y visible". Si no lo estaba, el tipo no se configura: es una condición del propio texto legal.',
        urgente: true,
      },
      {
        que: 'Fotografía si hay señal de "no entrar", flecha de sentido único o demarcación en el pavimento.',
        porque: 'La ausencia de señalización es el centro de la defensa en este numeral.',
        urgente: true,
      },
    ],
  ],
  [
    /velocidad/i,
    [
      {
        que: 'Fotografía los límites de velocidad señalizados en ese tramo.',
        porque: 'Un límite mal señalizado o inexistente cambia por completo el cálculo del exceso.',
        urgente: true,
      },
      {
        que: 'Pide en el expediente el certificado de calibración vigente del radar.',
        porque: 'Un instrumento de medición sin calibración certificada no sostiene la medición.',
        urgente: false,
      },
    ],
  ],
  [
    /estacion|detenga/i,
    [
      {
        que: 'Fotos del sitio mostrando si había señal de prohibición y si era visible desde el lugar donde parqueaste.',
        porque: 'La prohibición tiene que estar señalizada para poder exigirse.',
        urgente: true,
      },
    ],
  ],
]

const UBICACION_Y_HORA: ItemChecklist[] = [
  {
    que: 'Historial de ubicación de tu teléfono para esa hora (Google Maps: Cronología).',
    porque: 'Si estabas en otro lado, esto lo muestra con hora y coordenadas.',
    urgente: false,
  },
  {
    que: 'Recibos, facturas o registros con hora de ese momento.',
    porque: 'Un comprobante con hora impresa ubica el vehículo o a la persona.',
    urgente: false,
  },
  {
    que: 'Video de dashcam, si tienes, antes de que el ciclo de grabación lo sobrescriba.',
    porque: 'Las dashcam borran solas. Esa grabación tiene fecha de caducidad de días.',
    urgente: true,
  },
]

export function checklistPara(numeral: Numeral | null, hechoRelatado: string | null): ItemChecklist[] {
  const items = [...SIEMPRE]
  const texto = `${numeral?.conducta ?? ''} ${hechoRelatado ?? ''}`

  for (const [patron, extra] of POR_ELEMENTO) {
    if (patron.test(texto)) items.push(...extra)
  }
  items.push(...UBICACION_Y_HORA)

  // Sin duplicados, urgentes primero.
  const vistos = new Set<string>()
  return items
    .filter((i) => (vistos.has(i.que) ? false : (vistos.add(i.que), true)))
    .sort((a, b) => Number(b.urgente) - Number(a.urgente))
}

/**
 * Instrucciones imprimibles para que otra persona recolecte la evidencia.
 * Necesidad real y frecuente: la multa es en Ibarra y uno vive en Quito.
 */
export function instruccionesParaUnTercero(
  lugar: string | null,
  numeral: Numeral | null,
  hechoRelatado: string | null,
): string {
  const items = checklistPara(numeral, hechoRelatado)
  const lineas: string[] = []

  lineas.push('CÓMO RECOGER LA EVIDENCIA (para quien va al sitio)')
  lineas.push('='.repeat(55))
  lineas.push('')
  lineas.push(`Lugar: ${lugar ?? '(pendiente de precisar)'}`)
  if (numeral) {
    lineas.push(`Se discute: COIP Art. ${numeral.articulo} numeral ${numeral.literal}`)
    lineas.push(`Conducta imputada: ${numeral.conducta}`)
  }
  lineas.push('')
  lineas.push('REGLAS QUE HACEN QUE EL MATERIAL SIRVA')
  lineas.push('')
  lineas.push('1. Graba en video, no en fotos sueltas. Un video continuo, sin cortes,')
  lineas.push('   es mucho más difícil de cuestionar que diez fotos.')
  lineas.push('2. Empieza el video mostrando una referencia que ubique la calle:')
  lineas.push('   el nombre de la vía, un número de casa, un negocio con letrero.')
  lineas.push('3. Camina despacio hacia el punto sin dejar de grabar. La continuidad')
  lineas.push('   es lo que prueba que el punto y la referencia son el mismo sitio.')
  lineas.push('4. Graba a la altura de los ojos de quien conduce, en el mismo sentido')
  lineas.push('   de marcha. Lo que importa es qué se ve desde el volante.')
  lineas.push('5. Deja la fecha y hora automáticas del teléfono activadas. No pongas')
  lineas.push('   fecha con un editor: eso arruina la credibilidad del material.')
  lineas.push('6. No recortes, no filtres, no edites nada. Envía el archivo original.')
  lineas.push('7. Si hay que mostrar ausencia de algo (no hay semáforo, no hay señal),')
  lineas.push('   haz un barrido lento de 360 grados en el punto.')
  lineas.push('')
  lineas.push('QUÉ HAY QUE CONSEGUIR')
  lineas.push('')
  items.forEach((item, i) => {
    lineas.push(`${i + 1}. ${item.que}`)
    lineas.push(`   Por qué: ${item.porque}`)
    lineas.push('')
  })
  lineas.push('Cuando termines, envía los archivos SIN comprimir ni reenviar por')
  lineas.push('aplicaciones que bajan la calidad. Usa el archivo original.')
  lineas.push('')
  return lineas.join('\n')
}
