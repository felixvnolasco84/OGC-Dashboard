# Requisiciones: Make + WhatsApp Business Cloud

La integración suma WhatsApp a app/correo. Está desactivada por defecto por proyecto; no procesa historial anterior. No aprobar requisiciones ni realizar pagos desde WhatsApp. Los escenarios deben permanecer **inactivos** hasta contar con línea, plantillas aprobadas y un piloto verificado.

## Requisitos y secretos

1. Una línea nueva de OGC capaz de recibir SMS o llamada y acceso administrativo a Meta Business Suite. En Make, usar **WhatsApp Business Cloud → Regular**, sin conexión legacy. Completar alta, nombre comercial y facturación requeridos por Meta.
2. Presentar las cinco plantillas de `templates.json` en WhatsApp Manager. Reemplazar `https://dashboard.example.com` por el origen HTTPS real de `APP_URL` en botones y ejemplos antes de presentarlas. `UTILITY` es la categoría solicitada; Meta decide aprobación/categorización. Mantener nombres, idioma `es_MX`, cuatro parámetros posicionales y botón URL. Si una plantilla no está aprobada, no activar el piloto.
3. Configurar en **Convex**, nunca en Vite o Git:

| Variable | Valor |
| --- | --- |
| `APP_URL` | URL pública HTTPS del dashboard, sin subruta |
| `MAKE_WHATSAPP_WEBHOOK_URL` | Webhook Custom webhook de Make, `https://hook.us2.make.com/...` (o su región) |
| `MAKE_WHATSAPP_API_KEY` | Clave aleatoria dedicada, al menos 32 bytes; configurar la misma en API Key authentication del webhook de Make |
| `WHATSAPP_CALLBACK_SECRET` | Otra clave aleatoria, al menos 32 bytes, para solicitudes Make → OGC |
| `WHATSAPP_SENDER_ID` | Phone Number ID de Meta, **no** el teléfono ni el WABA ID |

Configurar `Authorization: Bearer <WHATSAPP_CALLBACK_SECRET>` en las peticiones HTTP de Make. Preferir una conexión API Key con restricciones al dominio `https://<deployment>.convex.site`. Restringir editores de Make; sus escenarios pueden solicitar contactos/contenido al backend. Nunca guardar secretos en notas, capturas, enlaces o exports. No configurar rutas de callback a partir de datos del webhook.

Los endpoints están bajo `https://<deployment>.convex.site`, no `.convex.cloud` ni el dominio del frontend. Crear configuraciones distintas para desarrollo y producción. Esta implementación no mueve automáticamente claves ni activa proyectos.

### Registro del emisor después de conectar Make

Una conexión marcada **Verified** en Make no confirma que el teléfono ya esté operativo en Cloud API. Si Meta muestra el teléfono como **Pendiente**, completar el registro con **WhatsApp Business Cloud → Register a Sender**, seleccionando la conexión y el Phone Number ID de la línea nueva. El titular debe crear y enviar el PIN de seis dígitos de verificación en dos pasos; no incluirlo en el repositorio, capturas ni documentación. Ejecutar ese módulo una sola vez y comprobar su resultado y el estado del teléfono en Meta. Retirar después el módulo temporal que contenga el PIN, conservándolo únicamente en el gestor seguro del titular. [Instrucciones oficiales de Make](https://apps.make.com/whatsapp-business-cloud-troubleshooting).

Comprobar por separado la aprobación empresarial, el nombre para mostrar, el registro del teléfono y la facturación requerida para iniciar conversaciones. La aprobación de uno de estos pasos no sustituye los demás.

### Si Meta bloquea el alta por cupo de números

El error `2388386` indica que no hay capacidad para añadir la línea al porfolio seleccionado. Verificar el SMS no implica que el número ya esté registrado en Cloud API ni que Make tenga acceso. No volver a crear cuentas ni borrar números existentes para reintentar el alta. Revisar la verificación empresarial y las opciones de ampliación del porfolio en Meta Business Suite; si Meta exige documentos o una aprobación, completar ese proceso antes de reanudar la conexión. Mantener los proyectos y escenarios desactivados mientras falta el Phone Number ID.

Si el porfolio hereda un sitio web de otra marca, no cambiar los datos globales de ese porfolio sin revisar el efecto sobre sus activos. El perfil nuevo de OGC debe usar su propio sitio antes del piloto.

## Escenario 1: OGC · Requisiciones · Envío WhatsApp

1. **Webhooks / Custom webhook**, inmediato, con API Key authentication habilitada. Datos de entrada: `delivery_id` (texto). OGC enviará exclusivamente ese campo con la cabecera `x-make-apikey`.
2. **HTTP / Make a request**, POST a `/integrations/whatsapp/claim`, Parse response = Yes, JSON:

```json
{"delivery_id":"{{WEBHOOK.delivery_id}}"}
```

3. Filtro obligatorio `claim.send = true`. Si es `false`, terminar exitosamente sin enviar y sin repetir la reclamación. Las llamadas concurrentes/duplicadas devuelven `send:false` después de la primera reclamación.
4. **Router con cinco ramas**, una por nombre de `claim.template`: la interfaz vigente de **WhatsApp Business Cloud / Send a Template Message** permite seleccionar una plantilla estática. Cada rama filtra su nombre exacto y selecciona su versión `es_MX`; conexión Regular de OGC; Sender ID = `claim.sender_id`; Receiver = `claim.phone`. Mapear, en orden, las cuatro posiciones de `claim.parameters` al cuerpo. Botón URL, índice 0: `claim.url_suffix`. Make usa índices de arrays desde 1; probar el mapeo antes de activar.
5. **HTTP / Make a request**, POST autenticado a `/integrations/whatsapp/events`, con el ID `messages[1].id` devuelto por WhatsApp:

```json
{
  "kind":"accepted",
  "sender_id":"{{CLAIM.sender_id}}",
  "delivery_id":"{{CLAIM.delivery_id}}",
  "attempt_token":"{{CLAIM.attempt_token}}",
  "provider_message_id":"{{WHATSAPP.messages[1].id}}"
}
```

En expresiones de Make, el primer ID se obtiene con `get(WHATSAPP.messages; "1.id")`. Un router posterior comprueba que exista y no esté vacío; una respuesta sin ID publica el resultado incierto. Al construir el JSON para Make, conservar las comillas literales dentro de `{{...}}`: añadir escapes JSON a los argumentos de una función altera su evaluación. Los generadores incluidos realizan esa conversión antes de importar.

Si la respuesta del proveedor no contiene un identificador, tratar como resultado incierto, nunca como entrega. La respuesta 200 del webhook de Make solo confirma recepción en Make.

### Manejo de errores

- **No** habilitar repetición automática del escenario completo ni reintentar el módulo de WhatsApp desde ejecuciones incompletas. Convex controla los reintentos seguros.
- En el módulo de WhatsApp, agregar un manejador que publique `kind:error` con los mismos `sender_id`, `delivery_id`, `attempt_token` de la reclamación. `outcome:rejected` únicamente cuando el proveedor confirme que **no aceptó** el mensaje; `retryable:true` solo para rechazo temporal confirmado (por ejemplo, límite de tasa). Los rechazos permanentes usan `retryable:false`.
- En timeout, desconexión, respuesta sin ID o resultado dudoso: `outcome:unknown`, `retryable:false`. No convertir un error genérico en rechazo seguro. Ejemplo:

```json
{
  "kind":"error", "sender_id":"{{CLAIM.sender_id}}",
  "delivery_id":"{{CLAIM.delivery_id}}", "attempt_token":"{{CLAIM.attempt_token}}",
  "outcome":"unknown", "retryable":false, "error":"No se pudo confirmar la aceptación"
}
```

- Reintentar **solo el callback HTTP** cuando falle después de un envío aceptado; conservar su ID y token. Es idempotente. Nunca regresar al módulo de envío para resolver el fallo del callback.
- La configuración generada realiza hasta tres intentos del mismo callback. Los errores genéricos del módulo nativo de WhatsApp se registran conservadoramente como `unknown`, sin reenvío. No se deduce un rechazo seguro de un error genérico; añadir una clasificación futura requiere probar la respuesta concreta del proveedor.
- Sin reclamación en 10 minutos: OGC vuelve a notificar Make. Reintentos máximos: 1, 5 y 15 minutos (cuatro intentos en total). Con reclamación pero sin resultado: estado **Requiere revisión**, sin reenvío automático. Revisar la ejecución en Make y reenviar su callback conservado.

## Escenario 2: OGC · WhatsApp · Estados y bajas

Usar **WhatsApp Business Cloud / Watch Events**, inmediato, con la misma conexión y emisor. Seleccionar eventos de mensajes/estados. Una notificación puede incluir varios `entry`, `changes`, `statuses` y `messages`: iterar **todos**, sin tomar únicamente el primero. Un router separa estados de mensajes entrantes.

Por cada estado, hacer POST autenticado a `/integrations/whatsapp/events`:

```json
{
  "kind":"status", "sender_id":"{{metadata.phone_number_id}}",
  "provider_message_id":"{{status.id}}", "phone":"+{{status.recipient_id}}",
  "status":"{{status.status}}", "occurred_at":1793815200000
}
```

- `occurred_at` siempre es numérico en **milisegundos Unix**: multiplicar el timestamp Unix de Meta por 1000. No enviar la fecha como texto ni como segundos.
- En la versión nativa **Watch Events 2** configurada, `timestamp` ya se expone como fecha de Make. Se usa `formatDate(ITERATOR.timestamp; "x")` sin comillas alrededor del resultado en el cuerpo JSON. Si se sustituye por un webhook de Meta sin transformación, usar la conversión de segundos a milisegundos indicada arriba. La interfaz nativa expone `metadata`, `statuses` y `messages` directamente; cada ruta recorre el array completo con Iterator y usa `emptyarray` cuando falta. Verificar también un lote con varios `entry`/`changes` durante el piloto real del conector.
- Estados admitidos: `sent`, `delivered`, `read`, `failed`; filtrar otros valores. En fallos, `error` es opcional (máximo 500 caracteres de descripción operativa, sin credenciales).
- El escenario conserva el código de `errors[1].code` y hasta 420 caracteres de `error_data.details` (o el título) en `error`. Los textos dinámicos se pasan por [`escapeJSON`](https://help.make.com/text-and-binary-functions) para preservar comillas y saltos de línea sin romper el callback. La aceptación de un ID no prueba que Meta vaya a entregar el mensaje: puede emitir después un `failed` con problemas de facturación o elegibilidad.
- Normalizar `phone` al formato `+` y dígitos, sin agregar dos signos `+`.
- OGC normaliza los identificadores mexicanos antiguos `+521` + 10 dígitos a `+52` + 10 dígitos para asociar confirmaciones y bajas al contacto correcto.
- Los estados tempranos se conservan hasta asociarlos al callback de aceptación. OGC no hace retroceder un mensaje leído/entregado por confirmaciones tardías. Confirmaciones sin asociación caducan tras siete días.

Para mensajes de texto entrantes cuyo contenido, tras quitar espacios y convertir a mayúsculas, sea `BAJA`, publicar:

```json
{
  "kind":"inbound", "sender_id":"{{metadata.phone_number_id}}",
  "phone":"+{{message.from}}", "text":"{{message.text.body}}",
  "occurred_at":1793815200000
}
```

No convertir una solicitud de BAJA en una nueva autorización. OGC desactiva el número; administración solo puede reactivarlo registrando una nueva autorización. Repetir callbacks de baja es seguro. No enviar respuestas ni otros textos desde este escenario.

El filtro acepta únicamente mensajes de tipo `text` cuyo cuerpo normalizado sea `BAJA`. El callback envía el texto constante `BAJA`, evitando reenviar contenido adicional de conversaciones a OGC. Un filtro previo comprueba tanto el WABA ID como el Phone Number ID configurados.

## Generar y revisar los escenarios

`build-make-send.mjs` toma un export de referencia con webhook protegido, claim HTTP, envío de plantilla y callback HTTP ya conectados. Genera las cinco ramas, los controles de ID y los manejadores de error. `build-make-events.mjs` toma un export de Watch Events con Iterator y el export de envío para reutilizar la conexión HTTP restringida. Ambos conservan referencias a conexiones; no incluyen los valores de sus credenciales.

```sh
node integrations/whatsapp/build-make-send.mjs referencia-envio.json /tmp/envio.blueprint.json
node integrations/whatsapp/build-make-events.mjs referencia-eventos.json referencia-envio.json /tmp/eventos.blueprint.json PHONE_NUMBER_ID WABA_ID
```

Importar en los escenarios correspondientes y revisar las conexiones. **Make restablece la programación a intervalos al importar**: volver a seleccionar **Immediately**, guardar la programación, elegir **Not yet** y guardar el escenario. Mantener **Store incomplete executions** desactivado en envío para evitar repeticiones automáticas. Los proyectos siguen desactivados hasta verificar el piloto. No incluir claves, PIN ni direcciones privadas del webhook en exports o en Git.

## Administración y piloto

1. Gestión de Usuarios → WhatsApp: capturar número internacional, autorización obtenida del usuario y habilitación. La casilla registra la autorización que administración ya obtuvo; no afirma verificar la titularidad por SMS. Cambiar el número invalida la autorización previa.
2. Requisiciones → Notificaciones → WhatsApp automático: habilitar **un** proyecto de prueba. Sin conexión completa, el backend rechaza la activación. Deshabilitar el proyecto impide reclamar nuevos envíos, pero no retira mensajes ya aceptados.
3. Verificar los cinco eventos: creación (Administración/Finanzas), revisión (solicitante), solicitud de pago (Finanzas/Administración), pago confirmado (solicitante/Administración/Almacén), recepción (solicitante/Finanzas/Administración). Se excluye al actor y a quien no tenga acceso vigente.
4. Confirmar que los enlaces abran la requisición correcta tras iniciar sesión. No mandar documentos, importes ni datos bancarios en estas plantillas.
5. Simular baja, número ausente, error temporal, callback duplicado y desconexión tras enviar. Leer la requisición en OGC no debe marcar WhatsApp como leído.
6. Revisar consumo de créditos e historial de ejecuciones en Make, cargos/categorías en Meta, y entregados/leídos/fallidos/omitidos en OGC. Hasta 1,000 mensajes es una estimación, no una cuota implementada. El plan gratuito de Make puede servir para preparar escenarios; no garantiza capacidad suficiente para operar el piloto.

## Validación local

`npm run test:whatsapp` usa Convex en memoria y transporte simulado. `npm run test:requisicion-notifications`, `npm run test:requisicion-states`, `npm run test:requisicion-integration`, `npm run test:requisiciones-ui`, `npm run typecheck:convex` y `npm run build` cubren regresiones y frontend.

Fuentes de configuración: [conexión oficial de Make](https://apps.make.com/whatsapp-business-cloud), [módulos de WhatsApp](https://apps.make.com/whatsapp-business-cloud-modules), [autenticación del webhook](https://apps.make.com/gateway). Revisar la interfaz vigente al conectar la línea.
