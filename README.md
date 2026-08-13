# Mi Derecho Vial

La ley de tránsito del Ecuador en la mano durante un control, y el expediente de
evidencia listo para llevárselo a un abogado. Funciona sin internet.

**Licencia:** MIT · Sin servidor, sin cuenta, sin analítica.

## Qué problema resuelve

Cuando un agente te dice "esto es tal artículo, son tantos dólares", casi nadie
tiene forma de contrastarlo ahí mismo. Con los nervios y la prisa uno acepta lo
que le digan. Después, el plazo real para defenderse es de tres días de término
(días hábiles) y se vence antes de que uno se entere de que existía.

Esta app hace tres cosas, en ese orden de urgencia:

1. **Contrastar en segundos.** Escribes lo que te están diciendo, en tus
   palabras, y aparece el numeral exacto del COIP, el monto legal calculado con
   el SBU vigente, si de verdad se pierden puntos y qué condiciones exige la
   norma para que esa infracción se configure.
2. **Grabar y registrar.** Un botón grande arranca la grabación de audio o
   video, guarda tu ubicación con precisión y sella cada archivo con su huella
   SHA-256. Todo se queda en tu teléfono.
3. **Armar el expediente.** Exporta un ZIP con los archivos, un índice legible
   con hora y coordenadas de cada pieza, y un `huellas.txt` verificable con
   `sha256sum -c`. Eso es lo que un abogado puede presentar; un montón de fotos
   sueltas en la galería, no.

Además analiza una citación ya emitida: pegas el texto de la consulta del portal
y compara lo que dice la boleta contra lo que dice la ley.

## Lo que no hace, a propósito

- **No consulta ningún portal.** El usuario copia y pega lo que él mismo
  consultó. Así la app sirve para cualquier entidad del país sin integrar veinte
  portales, y es imposible usarla para husmear las multas de otra persona. Eso
  último no es un detalle: recorrer un portal público construyendo una base de
  infracciones ajenas viola la Ley Orgánica de Protección de Datos Personales.
- **No arma registros de agentes.** Un ranking público de servidores
  "sospechosos" a partir de multas impugnadas es difamación esperando ocurrir.
  Las sanciones disciplinarias las determina el COESCOP mediante proceso, no un
  algoritmo.
- **No acusa a nadie.** Una discrepancia entre el hecho y el artículo puede
  venir de corrupción, pero también de un error de digitación, de una mala
  tipificación o de un sistema que copia mal el hecho al rubro. La app describe
  la diferencia; calificarla le corresponde a un juez.
- **No promete resultados legales.** Informa y organiza.
- **No envía nada a ningún servidor.** No hay backend. Grabaciones, ubicación,
  citaciones y búsquedas no salen del dispositivo.

## Alcance de la base legal

Cubre las contravenciones de tránsito de los **artículos 386 a 392 del COIP**,
con el texto de cada numeral y su porcentaje del SBU. Los montos nunca están
escritos a mano: la ley fija porcentajes y el SBU cambia cada año.

```
multa = SBU del año × porcentaje del artículo
SBU 2026 = USD 482.00 (Acuerdo Ministerial MDT-2025-195, R.O. Sup. 187 de 18-dic-2025)
```

Queda **fuera de alcance** y la app lo dice explícitamente: el Art. 385 (alcohol
y sustancias), los Arts. 376 a 380 (accidentes con lesiones o muertes) y las
multas por ordenanza municipal.

Sobre los puntos: la reforma a la LOTTTSV de 2021 (R.O. Suplemento 512 de
10-ago-2021) suprimió la reducción de puntos para las contravenciones de tercera
a séptima clase. La app guarda tanto lo que dice el texto original del COIP como
lo que se aplica hoy, y avisa cuando una boleta descuenta puntos que ya no
corresponden.

## Cómo cuenta los plazos

Este es el módulo donde un error de un día cuesta el derecho a defenderse.

- "Término" significa **solo días hábiles**: no cuentan sábados, domingos ni
  feriados nacionales, y no cuenta el día de la notificación.
- Los feriados de 2026 vienen del calendario oficial. Para otros años se
  calculan aplicando las reglas de traslado del R.O. Suplemento 906 de
  20-dic-2016, con la Pascua resuelta por el algoritmo de Meeus, y la app avisa
  de que ese cómputo no está verificado contra fuente oficial.
- Los **feriados locales no están** en la lista y sí suspenden términos en su
  cantón. La app lo advierte en cada cómputo.

La app muestra el cómputo día por día, para que no haya que creerle nada.

## Búsqueda: primero rápida, después inteligente

Por defecto la búsqueda es léxica (BM25) sobre el texto de los numerales, con un
diccionario de cómo habla la gente de verdad: "me pasé el rojo", "contravía",
"sin casco", "hablando por celular". No descarga nada, responde en
milisegundos y funciona con la batería al 4%.

Encima de eso hay una capa semántica opcional. Descarga una sola vez un modelo
de embeddings multilingüe (unos 120 MB) con transformers.js, calcula los
vectores de los numerales **en el propio dispositivo**, los guarda en IndexedDB
y a partir de ahí funciona sin conexión para siempre. Se activa a mano desde
Derechos → Ajustes, y se puede desactivar liberando el espacio. Los resultados
de ambos motores se fusionan con Reciprocal Rank Fusion: si la capa semántica
está apagada, el resultado es exactamente el de BM25.

El bundle base que se instala pesa unos 306 KB. El motor de IA no se precachea:
solo lo descarga quien lo activa a propósito.

## Correr el proyecto

```bash
npm install     # requiere Node >= 20.19
npm run dev     # servidor de desarrollo
npm test        # tests del núcleo legal
npm run build   # bundle de producción en dist/
```

`.npmrc` desactiva la compilación del binding nativo de ONNX para Node, que aquí
no se usa (el modelo corre en el navegador) y falla en máquinas con CUDA 11.

## Estructura

```
src/
├── data/          base legal en JSON, cada dato con su fuente y fecha de consulta
├── core/          parser, plazos, calculadora, motor de reglas, búsqueda
├── evidencia/     captura, almacén local, hashes, empaquetado del expediente
└── ui/            cuatro pantallas, sin framework
tests/             el caso semilla real como fixture
```

## El motor de reglas

Cada regla contrasta la boleta contra la ley y reporta la diferencia con su base
legal y una acción sugerida.

| Regla | Qué detecta |
|---|---|
| R01a | La observación y el rubro de la boleta no describen la misma conducta |
| R01b | Lo que la persona dice que pasó no coincide con lo que le tipificaron |
| R02 | El monto cobrado no es el porcentaje legal del SBU |
| R03 | Descuento de puntos en contravenciones que ya no los descuentan |
| R04 | Campos de identificación y georreferenciación vacíos |
| R05 | Notificación fuera del plazo reglamentario |
| R06 | El elemento invocado (semáforo, señal) tiene que existir en el sitio |
| R07 | Dos citaciones a la misma placa, mismo lugar, ventana corta |
| R08 | Estado del término de impugnación, con el cómputo a la vista |
| R09 | Disponibilidad del pronto pago |
| R10 | Numeral genérico aplicado existiendo uno específico más barato |
| R11 | El Art. 386 numera dos bloques de sanción desde 1: el rubro es ambiguo |

Los hallazgos que necesitan comprobación externa salen marcados "a verificar" y
nunca como nulidad automática. Que un campo esté vacío en el portal no significa
que lo esté en la boleta física.

## Cómo aportar

Lo más valioso que puede aportar alguien no es código, es **datos verificados**:

- Un porcentaje o un texto legal desactualizado en `src/data/coip_contravenciones.json`.
  Cada entrada lleva `fuente` y `consultado`; si algo cambió, cámbialo con su fuente.
- El SBU de un año nuevo en `sbu_historico.json`, con el acuerdo ministerial y su
  Registro Oficial. Las entradas marcadas `"verificar": true` esperan justamente eso.
- El calendario oficial de feriados de un año en `feriados_ec.json`.
- Un rubro abreviado de un portal que la app todavía no traduce, en
  `glosario_rubros.json`. Esto crece con cada citación real que alguien analiza.
- Frases de calle que no encuentran su numeral, en `sinonimos_calle.json`.

No inventes valores. Si no puedes verificar un porcentaje contra el texto
oficial, déjalo en `null` con `"verificar": true`.

## Despliegue

GitHub Actions construye y publica en GitHub Pages en cada push a `main`
(`.github/workflows/deploy.yml`).

Sin dominio propio el sitio vive en `usuario.github.io/mi-derecho-vial/` y el
workflow ajusta la base solo. Para pasar a un dominio propio basta con definir
la variable de repositorio `CUSTOM_DOMAIN` en Settings → Secrets and variables →
Actions → Variables: entonces el workflow escribe el `CNAME` y la base vuelve a
`/`, sin tocar código.

En el DNS: un `CNAME` de `www` hacia `usuario.github.io`, y para el ápice los
cuatro registros `A` de GitHub Pages. Después activa "Enforce HTTPS" en la
configuración de Pages. Pide privacidad WHOIS al registrador si no quieres que
tus datos de contacto queden públicos.

## Aviso

Esta aplicación organiza información pública sobre normativa ecuatoriana. No es
asesoría legal. Para actuar sobre una citación concreta consulta con un abogado
o con la Defensoría Pública, que patrocina gratuitamente.

La app tampoco es un detector de corrupción. Es una herramienta para verificar
la legalidad de lo que te están cobrando, y para que la evidencia exista antes
de que se pierda.
