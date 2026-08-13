/**
 * Motor de reglas.
 *
 * Cada regla contrasta lo que dice la boleta contra lo que dice la ley y
 * describe la diferencia. Ninguna regla emite un juicio sobre una persona:
 * una discrepancia puede venir de corrupción, pero también de un error de
 * digitación, de una mala tipificación o de un sistema que copia mal el hecho
 * al rubro. El programa reporta la diferencia; calificarla es de un juez.
 */
import { buscarNumeral, esAmbiguo, numeralesDeArticulo, clave } from './coip'
import { buscarRapido } from './busqueda'
import { elementosDe } from './elementos'
import { calcularMulta, diferenciaEntre, formatearPorcentaje, formatearUsd, sbuDelAnio, sbuMasReciente } from './calculadora'
import type { SbuAplicado } from './calculadora'
import { aISO, plazoCaducidadNotificacion, plazoImpugnacion, plazoProntoPago, PLAZOS, soloFecha } from './plazos'
import type { Citacion, Hallazgo, Numeral, RelatoUsuario, ResultadoAnalisis } from './tipos'

const CLASES_SIN_PUNTOS = new Set(['tercera', 'cuarta', 'quinta', 'sexta', 'séptima'])

function sbuParaCitacion(citacion: Citacion): SbuAplicado {
  const anio = citacion.fechaEmision?.getUTCFullYear()
  return (anio ? sbuDelAnio(anio) : null) ?? sbuMasReciente()
}

/** Traduce texto libre (observación o relato) al numeral que mejor lo describe. */
function numeralDesdeTexto(texto: string | null): Numeral | null {
  if (!texto) return null
  const [mejor] = buscarRapido(texto, 1)
  return mejor?.numeral ?? null
}

export function analizar(
  citacion: Citacion,
  relato: RelatoUsuario | null,
  hoy: Date,
): ResultadoAnalisis {
  const hallazgos: Hallazgo[] = []
  const sbu = sbuParaCitacion(citacion)
  const numeralRubro = buscarNumeral(citacion.rubro)
  const numeralObservacion = numeralDesdeTexto(citacion.observacion)
  const numeralRelato = relato ? (buscarNumeral(relato.numeralSugerido) ?? numeralDesdeTexto(relato.hecho)) : null

  const montoLegal = numeralRubro ? calcularMulta(numeralRubro, sbu).monto : null

  // -- R01a: la boleta se contradice a sí misma ------------------------------
  if (numeralRubro && numeralObservacion && clave(numeralRubro) !== clave(numeralObservacion)) {
    const a = calcularMulta(numeralRubro, sbu)
    const b = calcularMulta(numeralObservacion, sbu)
    hallazgos.push({
      regla: 'R01a',
      severidad: 'alta',
      titulo: 'La observación y el rubro de la boleta no describen la misma conducta',
      detalle:
        `La observación dice "${citacion.observacion}", que corresponde al Art. ${numeralObservacion.articulo}.${numeralObservacion.literal} ` +
        `(${formatearPorcentaje(numeralObservacion.porcentajeSbu)} = ${formatearUsd(b.monto)}). ` +
        `El rubro cobrado es el Art. ${numeralRubro.articulo}.${numeralRubro.literal} ` +
        `(${formatearPorcentaje(numeralRubro.porcentajeSbu)} = ${formatearUsd(a.monto)}). ` +
        `Diferencia: ${formatearUsd(diferenciaEntre(a, b))}.`,
      baseLegal: `COIP Arts. ${numeralRubro.articulo} y ${numeralObservacion.articulo}`,
      accionSugerida:
        'Pide copia certificada del expediente para ver qué se registró realmente, y plantea un reclamo administrativo por error de tipificación.',
      requiereVerificacion: false,
    })
  }

  // -- R01b: lo que pasó no es lo que dice la boleta -------------------------
  if (numeralRubro && numeralRelato && clave(numeralRubro) !== clave(numeralRelato)) {
    const a = calcularMulta(numeralRubro, sbu)
    const b = calcularMulta(numeralRelato, sbu)
    const cobranDeMas = a.monto > b.monto
    hallazgos.push({
      regla: 'R01b',
      severidad: 'alta',
      titulo: 'El hecho que describes no coincide con lo que te tipificaron',
      detalle:
        `Tu relato encaja con el Art. ${numeralRelato.articulo}.${numeralRelato.literal} ` +
        `(${formatearPorcentaje(numeralRelato.porcentajeSbu)} = ${formatearUsd(b.monto)}): ${numeralRelato.conducta} ` +
        `Te cobraron el Art. ${numeralRubro.articulo}.${numeralRubro.literal} ` +
        `(${formatearPorcentaje(numeralRubro.porcentajeSbu)} = ${formatearUsd(a.monto)}). ` +
        (cobranDeMas
          ? `Si tu versión es la correcta, la diferencia en tu contra es de ${formatearUsd(diferenciaEntre(a, b))}.`
          : `Ojo: el artículo que describes es más caro que el que te cobraron.`),
      baseLegal: `COIP Art. ${numeralRelato.articulo} numeral ${numeralRelato.literal}`,
      accionSugerida:
        'Esta es la discrepancia que hay que probar. Recoge evidencia del lugar antes de que cambie y pide el expediente.',
      requiereVerificacion: true,
    })
  }

  // -- R02: el monto cobrado no es el porcentaje legal ------------------------
  if (numeralRubro && citacion.montoCobrado !== null && montoLegal !== null) {
    const desvio = Math.abs(citacion.montoCobrado - montoLegal)
    if (desvio > 0.02) {
      hallazgos.push({
        regla: 'R02',
        severidad: 'alta',
        titulo: 'El monto cobrado no cuadra con el porcentaje que fija la ley',
        detalle:
          `El Art. ${numeralRubro.articulo}.${numeralRubro.literal} sanciona con ${formatearPorcentaje(numeralRubro.porcentajeSbu)}. ` +
          `Con el SBU ${sbu.anio} (${formatearUsd(sbu.sbu)}) eso da ${formatearUsd(montoLegal)}, ` +
          `pero la boleta cobra ${formatearUsd(citacion.montoCobrado)}.`,
        baseLegal: `COIP Art. ${numeralRubro.articulo}; SBU fijado por ${sbu.norma}`,
        accionSugerida:
          'Verifica si el valor incluye tasas administrativas o intereses. Si no, reclama el error de cálculo por escrito.',
        requiereVerificacion: true,
      })
    }
  }

  // -- R03: puntos que ya no se descuentan -----------------------------------
  if (numeralRubro && citacion.puntosPerdidos !== null && citacion.puntosPerdidos > 0) {
    if (CLASES_SIN_PUNTOS.has(numeralRubro.clase)) {
      hallazgos.push({
        regla: 'R03',
        severidad: 'alta',
        titulo: 'Te descuentan puntos en una contravención que ya no los descuenta',
        detalle:
          `La boleta registra ${citacion.puntosPerdidos} puntos. El Art. ${numeralRubro.articulo} es de clase ` +
          `${numeralRubro.clase}, y la reforma de 2021 suprimió la reducción de puntos para las contravenciones ` +
          `de tercera a séptima clase.`,
        baseLegal:
          'Ley Orgánica Reformatoria a la LOTTTSV, R.O. Suplemento 512 de 10 de agosto de 2021',
        accionSugerida: 'Solicita por escrito la corrección del registro de puntos ante la entidad y ante la ANT.',
        requiereVerificacion: false,
      })
    }
  }

  // -- R04: campos de identificación en blanco -------------------------------
  const faltantes: string[] = []
  if (!citacion.agente) faltantes.push('identificación del agente')
  if (!citacion.provincia) faltantes.push('provincia')
  if (!citacion.localidad) faltantes.push('localidad')
  if (!citacion.zona && !citacion.distrito && !citacion.circuito) faltantes.push('zona, distrito y circuito')
  if (faltantes.length > 0) {
    hallazgos.push({
      regla: 'R04',
      severidad: 'media',
      titulo: 'Faltan datos de identificación y de ubicación en el registro consultado',
      detalle:
        `No consta: ${faltantes.join(', ')}. El Art. 179 de la LOTTTSV exige que la boleta identifique la ` +
        `contravención y a la persona responsable, y la reforma de 2021 al Art. 163 detalló los elementos que ` +
        `debe contener el parte.`,
      baseLegal: 'LOTTTSV Arts. 163 y 179',
      accionSugerida:
        'Antes de alegar esto, compara contra la boleta física o la copia certificada del expediente: puede ser una limitación de lo que el portal muestra, no de la boleta.',
      requiereVerificacion: true,
    })
  }
  if (citacion.lugar && !citacion.provincia && !citacion.localidad) {
    hallazgos.push({
      regla: 'R04b',
      severidad: 'media',
      titulo: 'El lugar es texto libre, sin georreferenciación',
      detalle: `El lugar consta como "${citacion.lugar}", sin coordenadas ni división territorial. Eso hace difícil verificar el sitio exacto del hecho.`,
      baseLegal: 'LOTTTSV Art. 163 (elementos del parte o boleta)',
      accionSugerida: 'Pide en el expediente las coordenadas registradas por el dispositivo que emitió la citación.',
      requiereVerificacion: true,
    })
  }

  // -- R05: notificación fuera de plazo --------------------------------------
  if (citacion.fechaEmision && citacion.fechaNotificacion) {
    const plazo = plazoCaducidadNotificacion(citacion.fechaEmision, citacion.fechaNotificacion)
    if (plazo.vencido) {
      hallazgos.push({
        regla: 'R05',
        severidad: 'alta',
        titulo: 'La notificación llegó fuera del plazo reglamentario',
        detalle: `Entre la infracción y la notificación pasaron más de ${PLAZOS.caducidadNotificacionDias} días.`,
        baseLegal: 'Reglamento a la LOTTTSV',
        accionSugerida: 'Alega caducidad, adjuntando prueba de la fecha real de notificación.',
        requiereVerificacion: true,
      })
    }
  }

  // -- R06: el hecho tipificado tiene que existir en el lugar -----------------
  if (numeralRubro) {
    const elementos = elementosDe(numeralRubro)
    if (elementos.length > 0) {
      hallazgos.push({
        regla: 'R06',
        severidad: 'media',
        titulo: 'Comprobable en el sitio: ¿existe realmente el elemento que se invoca?',
        detalle:
          `El Art. ${numeralRubro.articulo}.${numeralRubro.literal} supone ${elementos.join(', ')}. ` +
          (citacion.lugar ? `Lugar registrado: "${citacion.lugar}". ` : '') +
          `Si en ese punto no existe, o estaba tapado, borrado o apagado, el hecho tipificado no se configura.` +
          (numeralRubro.condicionExpresa ? ` La propia norma lo exige: ${numeralRubro.condicionExpresa}` : ''),
        baseLegal: `COIP Art. ${numeralRubro.articulo} numeral ${numeralRubro.literal}`,
        accionSugerida:
          'Ve al sitio y graba video continuo mostrando el punto y el entorno. Si no puedes ir, la app genera instrucciones para que un tercero lo haga bien.',
        requiereVerificacion: true,
      })
    }
  }

  // -- R08 y R09: plazos ------------------------------------------------------
  const plazos = []
  const notificacion = citacion.fechaNotificacion ?? citacion.fechaEmision
  if (notificacion) {
    const impugnacion = plazoImpugnacion(notificacion, hoy)
    plazos.push(impugnacion)
    hallazgos.push({
      regla: 'R08',
      severidad: impugnacion.vencido ? 'alta' : (impugnacion.diasRestantes ?? 0) <= 1 ? 'alta' : 'media',
      titulo: impugnacion.vencido
        ? `Término de impugnación VENCIDO (venció el ${aISO(impugnacion.vence ?? notificacion)})`
        : `Te quedan ${impugnacion.diasRestantes} día(s) para impugnar (hasta el ${aISO(impugnacion.vence ?? notificacion)})`,
      detalle:
        'Son 3 días de término, es decir solo días hábiles: no cuentan sábados, domingos ni feriados, y no cuenta el día de la notificación. ' +
        impugnacion.diasContados.join(' · '),
      baseLegal: 'COIP Art. 644',
      accionSugerida: impugnacion.vencido
        ? 'La vía de impugnación judicial está cerrada, pero siguen abiertas otras dos: el reclamo administrativo por error de tipificación y, si hubo conducta irregular, la denuncia. Son vías distintas y no se excluyen.'
        : 'La impugnación requiere patrocinio de abogado. La Defensoría Pública patrocina gratis. No dejes pasar el plazo.',
      requiereVerificacion: false,
    })

    const prontoPago = plazoProntoPago(notificacion, hoy)
    plazos.push(prontoPago)
    hallazgos.push({
      regla: 'R09',
      severidad: 'informativa',
      titulo: prontoPago.vencido
        ? 'El plazo de pronto pago ya pasó'
        : `Pronto pago disponible hasta ~${aISO(prontoPago.vence ?? notificacion)}`,
      detalle:
        'Ojo con esto: pagar cierra la vía de impugnación. No impide el reclamo administrativo por error de tipificación ni la denuncia, que son vías distintas.',
      baseLegal: 'Normativa de descuento vigente y política de cada entidad',
      accionSugerida: 'Confirma en el portal de la entidad el valor exacto con descuento antes de pagar.',
      requiereVerificacion: true,
    })
  }

  if (citacion.fechaEmision && citacion.fechaNotificacion) {
    plazos.push(plazoCaducidadNotificacion(citacion.fechaEmision, citacion.fechaNotificacion))
  }

  // -- R10: tipificación genérica cuando existe una específica ----------------
  if (numeralRubro?.generica) {
    const alternativa = numeralRelato ?? numeralObservacion
    if (alternativa && clave(alternativa) !== clave(numeralRubro)) {
      const a = calcularMulta(numeralRubro, sbu)
      const b = calcularMulta(alternativa, sbu)
      if (a.monto > b.monto) {
        hallazgos.push({
          regla: 'R10',
          severidad: 'media',
          titulo: 'Te aplicaron un numeral genérico existiendo uno específico más barato',
          detalle:
            `${numeralRubro.notaGenerica ?? ''} El Art. ${alternativa.articulo}.${alternativa.literal} describe el hecho de forma específica ` +
            `y cuesta ${formatearUsd(b.monto)} frente a ${formatearUsd(a.monto)}.`,
          baseLegal: `COIP Arts. ${numeralRubro.articulo} y ${alternativa.articulo}`,
          accionSugerida: 'En derecho sancionador la norma específica desplaza a la general. Es un argumento concreto para el reclamo.',
          requiereVerificacion: false,
        })
      }
    }
  }

  // -- Ambigüedad estructural del Art. 386 ------------------------------------
  if (citacion.rubro && esAmbiguo(citacion.rubro)) {
    hallazgos.push({
      regla: 'R11',
      severidad: 'media',
      titulo: 'El rubro no permite saber qué sanción corresponde',
      detalle:
        `El Art. 386 tiene dos bloques de sanción distintos (uno de 1 SBU y otro de 2 SBU) y ambos numeran sus ` +
        `literales desde 1. Con "Art. 386 - Lit. ${citacion.rubro.literal}" no se puede determinar cuál se aplicó.`,
      baseLegal: 'COIP Art. 386',
      accionSugerida: 'Pide que se precise la conducta imputada. Sin eso no hay forma de verificar el monto.',
      requiereVerificacion: false,
    })
  }

  if (!numeralRubro && citacion.rubroTexto) {
    hallazgos.push({
      regla: 'R00',
      severidad: 'informativa',
      titulo: 'No se pudo identificar el artículo del rubro',
      detalle: `El rubro dice "${citacion.rubroTexto}" y no coincide con ningún numeral de los Arts. 386 a 392 conocidos por esta app.`,
      baseLegal: '—',
      accionSugerida:
        'Puede ser una multa por ordenanza municipal, o un artículo fuera del alcance de esta app (por ejemplo el Art. 385, alcohol). Verifícalo con la entidad.',
      requiereVerificacion: true,
    })
  }

  const orden = { alta: 0, media: 1, baja: 2, informativa: 3 }
  hallazgos.sort((a, b) => orden[a.severidad] - orden[b.severidad])

  return {
    citacion,
    numeralRubro,
    numeralRelato: numeralRelato ?? numeralObservacion,
    montoLegal,
    sbuAplicado: sbu.sbu,
    anioSbu: sbu.anio,
    plazos,
    hallazgos,
  }
}

/** R07: duplicidad. Necesita más de una citación, así que va aparte. */
export function detectarDuplicados(citaciones: Citacion[], ventanaHoras = 2): Hallazgo[] {
  const salida: Hallazgo[] = []
  for (let i = 0; i < citaciones.length; i += 1) {
    for (let j = i + 1; j < citaciones.length; j += 1) {
      const a = citaciones[i]
      const b = citaciones[j]
      if (!a || !b || !a.fechaEmision || !b.fechaEmision) continue
      if (a.placa !== b.placa) continue
      const horas = Math.abs(a.fechaEmision.getTime() - b.fechaEmision.getTime()) / 3_600_000
      const mismoLugar = (a.lugar ?? '') === (b.lugar ?? '')
      if (horas <= ventanaHoras && mismoLugar) {
        salida.push({
          regla: 'R07',
          severidad: 'media',
          titulo: 'Dos citaciones a la misma placa, mismo lugar y en pocas horas',
          detalle:
            `${a.numero ?? 'sin número'} (${aISO(soloFecha(a.fechaEmision))}) y ${b.numero ?? 'sin número'} ` +
            `(${aISO(soloFecha(b.fechaEmision))}) coinciden en placa y lugar dentro de ${ventanaHoras} horas.`,
          baseLegal: 'Principio non bis in idem',
          accionSugerida: 'Verifica si se trata del mismo hecho sancionado dos veces y pide la anulación de una.',
          requiereVerificacion: true,
        })
      }
    }
  }
  return salida
}

export { numeralesDeArticulo }
