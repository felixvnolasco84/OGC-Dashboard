# Mensajes de WhatsApp aplicados en Make

Estado: aplicado y verificado el 13 de noviembre de 2026. Las cinco plantillas originales también fueron editadas y aprobadas por Meta como Servicio/UTILITY en `es_MX`. Cada ruta usa ahora su plantilla de evento actualizada, con nueve variables. `ogc_requisicion_estado_v2` sigue disponible como alternativa común.

Escenario identificado: **OGC · Requisiciones · Envío WhatsApp**, ID `6920547`.

Se guardó el escenario, se recargó y se verificó su exportación: los cinco módulos de envío tienen las nueve variables de `3.data.formatted_parameters`. Se conservaron filtros, conexiones y mapeos de los otros 88 módulos. El dashboard público ya incluye la captura opcional de beneficiario e importe pagado y del nombre del receptor. Se comprobaron el backend publicado, el bundle público y el despliegue exitoso de Vercel; pasaron 140 pruebas de WhatsApp y requisiciones.

El contrato exacto aprobado está en [integrations/whatsapp/format-v2.md](../integrations/whatsapp/format-v2.md) y los cinco textos por evento en `integrations/whatsapp/templates.events-v2.json`. Los ejemplos siguientes conservan la propuesta original como referencia; Meta aprobó el formato con una breve introducción transaccional y texto de consulta y baja. El enlace utiliza la URL real del dashboard, no el dominio de ejemplo. No se enviaron mensajes de prueba a destinatarios reales durante este cambio.

## Formato común

Usar un solo asterisco para los textos destacados y saltos de línea reales. Mantener el mismo orden de información en las cinco rutas:

```text
*{folio} · {proyecto}*
{partida} — {categoría}

Solicitó: {solicitante} · {fecha_solicitud_dd/mm}

Revisión: {revisión}
Pago: {pago}
Recepción: {recepción}

👉 *Siguiente paso:* {siguiente_paso}
🔗 {enlace_requisición}
```

Los estados se deben resolver a partir de la requisición vigente. El tipo de evento determina qué cambió, pero no basta para inferir el estado de los otros procesos. Por ejemplo, una entrega registrada no demuestra que ya se haya pagado.

## 1. Requisición creada

Ruta observada: `ogc_requisicion_creada_v1`.

```text
*LH-REQ-0142 · Larena Torre H*
Albañilería — Cementantes/Agregados/Otros

Solicitó: Yaneth Cosío · 26/10

Revisión: Pendiente
Pago: Pendiente
Recepción: Pendiente

👉 *Siguiente paso:* Administración revisa la requisición
🔗 ogc.mx/req/LH-REQ-0142
```

## 2. Requisición revisada

Ruta observada: `ogc_requisicion_revisada_v1`.

```text
*LH-REQ-0142 · Larena Torre H*
Albañilería — Cementantes/Agregados/Otros

Solicitó: Yaneth Cosío · 26/10

Revisión: Aprobada
Pago: Pendiente
Recepción: Pendiente

👉 *Siguiente paso:* Administración libera pago
🔗 ogc.mx/req/LH-REQ-0142
```

Si la revisión es parcial o rechazada, conservar el estado real y adaptar el siguiente paso según la tabla de reglas. No presentar todas las revisiones como aprobadas.

## 3. Solicitud de pago en obra

Ruta observada: `ogc_requisicion_pago_obra_v1`.

```text
*LH-REQ-0142 · Larena Torre H*
Albañilería — Cementantes/Agregados/Otros

Solicitó: Yaneth Cosío · 26/10

Revisión: Aprobada
Pago: Pendiente · Pago en obra solicitado
Recepción: Pendiente

👉 *Siguiente paso:* Administración atiende la solicitud de pago en obra
🔗 ogc.mx/req/LH-REQ-0142
```

Una solicitud de pago no es una confirmación de pago. Si se muestra el importe solicitado, identificarlo como tal para distinguirlo del importe efectivamente pagado.

## 4. Requisición pagada

Ruta observada: `ogc_requisicion_pagada_v1`.

```text
*LH-REQ-0142 · Larena Torre H*
Albañilería — Cementantes/Agregados/Otros

Solicitó: Yaneth Cosío · 26/10

Revisión: Aprobada
Pago: Pagado a Ferretería Santana · $48,300
Recepción: Pendiente

👉 *Siguiente paso:* Obra registra la recepción de materiales
🔗 ogc.mx/req/LH-REQ-0142
```

Usar el beneficiario real del pago y el importe efectivamente pagado. No sustituirlos por el usuario que registró el movimiento, el presupuesto o el monto solicitado.

## 5. Recepción de materiales

Ruta observada: `ogc_requisicion_entrega_v1`.

```text
*LH-REQ-0142 · Larena Torre H*
Albañilería — Cementantes/Agregados/Otros

Solicitó: Yaneth Cosío · 26/10

Revisión: Aprobada
Pago: Pagado a Ferretería Santana · $48,300
Recepción: Recibido por Yaneth Cosío

👉 *Siguiente paso:* Proceso completo
🔗 ogc.mx/req/LH-REQ-0142
```

Para una entrega parcial, usar `Recepción: Parcial · Recibido por {receptor}`. El receptor debe provenir del registro de recepción; no asumir que es el solicitante o quien editó la requisición. Si se registran varias recepciones, identificar al receptor de la entrega notificada.

## Reglas de los estados

| Condición real | Texto |
| --- | --- |
| Revisión pendiente | `Revisión: Pendiente` |
| Revisión aprobada | `Revisión: Aprobada` |
| Revisión parcialmente aprobada | `Revisión: Parcialmente aprobada` |
| Revisión rechazada | `Revisión: Rechazada` |
| Pago pendiente | `Pago: Pendiente` |
| Solicitud de pago en obra pendiente | `Pago: Pendiente · Pago en obra solicitado` |
| Pago confirmado con datos completos | `Pago: Pagado a {beneficiario} · {importe_pagado}` |
| Pago confirmado sin beneficiario | `Pago: Pagado · {importe_pagado}` |
| Pago confirmado sin importe disponible | `Pago: Pagado a {beneficiario}`; omitir el beneficiario también si falta |
| Pago cancelado | `Pago: Cancelado` |
| Recepción pendiente | `Recepción: Pendiente` |
| Recepción parcial | `Recepción: Parcial · Recibido por {receptor}` |
| Recepción completa | `Recepción: Recibido por {receptor}` |
| Recepción registrada sin receptor disponible | `Recepción: Parcial` o `Recepción: Recibido`, según el estado real |

Para valores faltantes, omitir el separador y el dato ausente. Nunca mostrar `undefined`, `null`, `$0` para un importe desconocido, ni nombres inventados. Un importe cero confirmado no equivale a un importe desconocido.

## Reglas del siguiente paso

Evaluar en orden y usar únicamente acciones respaldadas por el estado vigente:

| Condición | Siguiente paso |
| --- | --- |
| Requisición o pago cancelado | `Consulta el detalle de la cancelación` |
| Revisión rechazada | `Solicitante revisa los comentarios` |
| Revisión pendiente | `Administración revisa la requisición` |
| Revisión parcialmente aprobada | `Consulta los materiales aprobados y los comentarios` |
| Aprobada y pago en obra solicitado pendiente | `Administración atiende la solicitud de pago en obra` |
| Aprobada y pago pendiente | `Administración libera pago` |
| Pagada y recepción pendiente | `Obra registra la recepción de materiales` |
| Pagada y recepción parcial | `Obra registra la recepción de los materiales restantes` |
| Pagada y recepción completa | `Proceso completo` |
| Estado no reconocido o datos insuficientes | `Consulta el detalle de la requisición` |

## Fuentes de datos de referencia

| Dato | Fuente que debe verificarse |
| --- | --- |
| Folio y proyecto | Requisición original, no el ID interno del evento |
| Partida y categoría | Clasificación de la requisición |
| Solicitante y fecha | Autor y fecha de la solicitud original, no los del último cambio |
| Revisión, pago y recepción | Estados vigentes en el momento de construir el mensaje |
| Beneficiario e importe pagado | Pago confirmado relacionado con la requisición |
| Receptor | Registro de la recepción notificada |
| Enlace | URL real de detalle enviada por la integración; el dominio del ejemplo no se ha verificado |

## Criterios de verificación

- Revisar el tipo de envío de WhatsApp: si usa plantillas aprobadas, comprobar qué partes del texto son fijas y cuáles son parámetros antes de cambiar el formato.
- Revisar las cinco rutas y cualquier ruta alternativa de envío que use el mismo contenido.
- Mantener los valores dinámicos, filtros, destinatarios y manejo de errores existentes.
- Confirmar que los saltos de línea se muestran como líneas reales y que la negrita usa un solo asterisco.
- Verificar revisión rechazada y parcial; pago pendiente, solicitado y pagado; recepción pendiente, parcial y completa; y datos opcionales faltantes.
- Guardar y volver a abrir el escenario para comprobar la persistencia de los cambios.
- Una vista previa no demuestra entrega. Cualquier envío de prueba debe tener un destinatario autorizado.
