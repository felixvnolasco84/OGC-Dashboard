# Formato de requisiciones de WhatsApp v2

Plantilla de Meta: `ogc_requisicion_estado_v2`, identificador `1143846168130897`, idioma `es_MX`, categoría Servicio/UTILITY. Aprobación observada el 13 de noviembre de 2026.

Las cinco rutas del escenario [Envío WhatsApp](https://us2.make.com/201093/scenarios/6920547/edit) usan esta plantilla. Se guardó el escenario, se recargó y se comprobó la exportación resultante: módulos de envío `10`, `28`, `46`, `64` y `82`, nueve variables por módulo, 93 módulos totales y mapeos, filtros y conexiones ajenos al formato conservados.

El contenido exacto aprobado y sus muestras ficticias están en `templates.state-v2.json`. `build-make-send.mjs` reproduce el nuevo contrato conservando los cinco identificadores de evento originales como filtros. `templates.prepared.json` documenta las plantillas v1 históricas.

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

En Make, el campo `body_N` usa `{{get(3.data.formatted_parameters; N+1)}}`. `template` y `parameters` del claim mantienen el contrato v1 para los filtros y compatibilidad; `formatted_template` identifica la plantilla v2. El enlace está en el cuerpo aprobado y sustituye al botón de las plantillas históricas. No se usa el dominio de ejemplo `ogc.mx/req/…` porque no hay una ruta verificada para ese formato.

El backend se publicó en `animated-walrus-612`, el mismo deployment que utiliza el dashboard público. La captura de pago añade `pago_confirmado: { beneficiario, importe }`; la recepción añade `recibido_por_nombre`. Ambos son opcionales para conservar la compatibilidad con registros y clientes anteriores. Beneficiario e importe se capturan juntos. No se toma el monto presupuestado como importe pagado, ni se supone que el solicitante o quien registra una entrega sea quien recibió los materiales.

Los registros históricos sin esos datos muestran `Pagado`, `Recibido` o `Parcial`, según corresponda. Una recepción completa no implica que el pago esté realizado. El siguiente paso contempla revisión pendiente, aprobada, parcial o rechazada; solicitud de pago en obra; pago pendiente, realizado o cancelado; y recepción pendiente, parcial o completa.

Validación: 140 pruebas de reglas, flujo y contratos de WhatsApp/requisiciones aprobadas; TypeScript y build aprobados. La comprobación de Make se realizó mediante configuración persistida y exportación; no se enviaron mensajes de prueba a destinatarios reales durante este cambio.
