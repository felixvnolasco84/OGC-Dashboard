# Formato de requisiciones de WhatsApp v2

El formato v2 utiliza nueve variables, idioma `es_MX` y categoría Servicio/UTILITY. La plantilla común `ogc_requisicion_estado_v2`, identificador `1143846168130897`, continúa disponible como alternativa aprobada.

El 13 de noviembre también se editaron las cinco plantillas originales en Meta, conservando sus nombres terminados en `_v1` y sus identificadores. Cada una tiene una introducción y cierre específicos de su evento, el mismo resumen de estados y el enlace en el cuerpo; ya no tienen botón URL. Sus cuerpos exactos y muestras ficticias están en `templates.events-v2.json`. El sufijo del nombre no determina la cantidad de variables: estas versiones editadas requieren nueve.

Meta aprobó las cinco ediciones el 13 de noviembre. El escenario [Envío WhatsApp](https://us2.make.com/201093/scenarios/6920547/edit) utiliza la plantilla correspondiente a cada evento, con módulos de envío `10`, `28`, `46`, `64` y `82`, nueve variables por módulo y 93 módulos totales. Se guardó, se recargó y se verificó la exportación persistida, conservando filtros, conexiones, los demás 88 mapeos y ajustes del escenario. `build-make-send.mjs` reproduce este contrato y conserva los filtros originales. Antes de aplicarlo en otra cuenta se debe comprobar la aprobación de las cinco en Meta. El estado aplicado se registra en `setup-status.md`.

`templates.state-v2.json` documenta la alternativa común. `templates.prepared.json` conserva únicamente el contenido histórico de cuatro variables y botón; ese contenido ya no describe las plantillas originales editadas.

| Variable | Dato de `formatted_parameters` |
| --- | --- |
| 1 | Folio disponible, o identificador real de la requisición |
| 2 | Proyecto |
| 3 | Partida — familia, sin duplicados |
| 4 | Solicitante original · fecha DD/MM |
| 5 | Revisión vigente |
| 6 | Pago vigente; beneficiario e importe efectivamente confirmados cuando existen |
| 7 | Recepción vigente; nombre capturado del receptor cuando existe |
| 8 | Siguiente paso según los estados independientes |
| 9 | Enlace real de detalle de OGC |

En Make, el campo `body_N` usa `{{get(3.data.formatted_parameters; N+1)}}`. `template` conserva el nombre del evento y se usa para seleccionar su ruta; `formatted_template` identifica la alternativa común. Los cuatro valores de `parameters` se conservan como información histórica: no sirven para enviar las plantillas actuales de nueve variables. El enlace está en la variable 9 del cuerpo y sustituye al botón histórico. No se usa el dominio de ejemplo `ogc.mx/req/…` porque no hay una ruta verificada para ese formato.

El backend se publicó en `animated-walrus-612`, el mismo deployment que utiliza el dashboard público. La captura de pago añade `pago_confirmado: { beneficiario, importe }`; la recepción añade `recibido_por_nombre`. Ambos son opcionales para conservar la compatibilidad con registros y clientes anteriores. Beneficiario e importe se capturan juntos. No se toma el monto presupuestado como importe pagado, ni se supone que el solicitante o quien registra una entrega sea quien recibió los materiales.

Los registros históricos sin esos datos muestran `Pagado`, `Recibido` o `Parcial`, según corresponda. Una recepción completa no implica que el pago esté realizado. El siguiente paso contempla revisión pendiente, aprobada, parcial o rechazada; solicitud de pago en obra; pago pendiente, realizado o cancelado; y recepción pendiente, parcial o completa.

Validación: 140 pruebas de reglas, flujo y contratos de WhatsApp/requisiciones aprobadas; TypeScript y build aprobados. La comprobación de Make se realizó mediante configuración persistida y exportación; no se enviaron mensajes de prueba a destinatarios reales durante este cambio.
