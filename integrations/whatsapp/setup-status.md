# Estado de WhatsApp — 10 de noviembre de 2026

## Meta y emisor

- Empresa: **OGC DEVELOPMENTS SOCIEDAD ANONIMA DE CAPITAL VARIABLE**, México, `https://www.ogc.mx/`.
- Verificación empresarial aprobada el **5 de noviembre de 2026**.
- Porfolio autorizado para OGC: `571627552030354`, denominado **Felix Enrique Vega Nolasco**. El titular autorizó actualizar sus datos empresariales para OGC.
- Emisor: **+52 55 1485 2232**. Nombre aprobado: **OGC Developments**. Estado: **Conectado**.
- Messaging Account ID: `1649790299950806`; Phone Number ID: `1468034436387832`.
- Conexión Regular de Make: **OGC Developments · WhatsApp 5514852232**, ID `12169840`, verificada nuevamente el 9 de noviembre.

La verificación empresarial resolvió el bloqueo de capacidad `2388386`. No se retiraron números existentes. El titular creó y envió el PIN de registro; el módulo temporal Register a Sender se retiró. No conservar el PIN en documentación ni código. Make puede conservar ejecuciones y versiones anteriores según su retención y los permisos del equipo.

Meta puede representar números mexicanos con el prefijo móvil antiguo `+52 1`. OGC normaliza contactos, recibos y bajas a `+52` seguido de diez dígitos.

## Facturación

El titular completó los métodos de pago. El primer envío devolvió un recibo fallido `131042`: Meta señaló que faltaba configurar la divisa en una segunda cuenta con el mismo nombre. Se completó esa configuración y se observó **Peso mexicano (MXN)**. Los envíos posteriores ya tienen confirmación de entrega y lectura.

Para evitar confundir las cuentas:

| Activo de facturación | Cuenta de pago | Observación |
| --- | --- | --- |
| `1649790299950806` | `2130980290850643` | Cuenta abierta desde WhatsApp Manager; el titular añadió el método de pago. |
| `1134658792390768` | `2171655950115346` | Cuenta indicada por el error `131042`; el titular completó ubicación, MXN y método de pago. |

No se almacenaron datos de tarjeta en el repositorio. [Administrar la cuenta indicada por el error](https://business.facebook.com/latest/billing_hub/accounts/details?business_id=571627552030354&asset_id=1134658792390768&nav_ref=billing_hub&payment_account_id=2171655950115346).

## Cinco plantillas aprobadas

Estado observado el 9 de noviembre: **Activa: calidad pendiente** para las cinco. Idioma `es_MX`, categoría **Servicio/UTILITY**, cuatro parámetros posicionales y botón dinámico **Ver requisición**.

| Evento | Plantilla | ID de Meta |
| --- | --- | --- |
| Creación | `ogc_requisicion_creada_v1` | `1655954052579894` |
| Revisión | `ogc_requisicion_revisada_v1` | `1507106671246386` |
| Pago en obra solicitado | `ogc_requisicion_pago_obra_v1` | `1617036340223088` |
| Pago confirmado | `ogc_requisicion_pagada_v1` | `1143784381341735` |
| Recepción | `ogc_requisicion_entrega_v1` | `4262952764013531` |

Los textos presentados están en `templates.prepared.json`; `templates.json` usa un dominio de ejemplo. La URL aprobada es `https://ogc-dashboard.vercel.app/{{1}}`. Meta puede revisar posteriormente categoría, calidad o disponibilidad.

## OGC y Make

Backend desplegado en **animated-walrus-612**. El dashboard público usa ese mismo deployment, verificado en su bundle: su denominación «desarrollo» no lo aísla del dashboard publicado. `APP_URL` apunta a `https://ogc-dashboard.vercel.app`. No se desplegó otro backend Convex de producción.

Configuradas exclusivamente en Convex y conexiones cifradas de Make: `MAKE_WHATSAPP_WEBHOOK_URL`, `MAKE_WHATSAPP_API_KEY`, `WHATSAPP_CALLBACK_SECRET` y `WHATSAPP_SENDER_ID`. Las dos claves dedicadas contienen 32 bytes aleatorios cada una. No hay valores de secretos en Git.

Ambos escenarios están guardados, **activos** y programados **Immediately** para el piloto:

- [OGC · Requisiciones · Envío WhatsApp](https://us2.make.com/201093/scenarios/6920547/edit): webhook protegido `3030477`, claim, cinco ramas de plantillas, ID del proveedor y callbacks. Reintenta solo los callbacks; los resultados inciertos nunca regresan al módulo de envío. Store incomplete executions permanece desactivado. Son 93 módulos contando manejadores; cada ejecución recorre únicamente su rama.
- [OGC · WhatsApp · Estados y bajas](https://us2.make.com/201093/scenarios/6925826/edit): Watch Events 2, webhook `3030555`, Messages y Message Statuses, filtros por cuenta/emisor, iteradores, fechas en milisegundos y BAJA. Son 14 módulos contando reintentos. Los fallos remiten código y detalle de Meta, acotados y escapados para JSON.

Credencial de entrada: **OGC · Convex a Make · Desarrollo**. Conexión HTTP: **OGC · WhatsApp backend · Desarrollo**, ID `12177036`, restringida a `https://animated-walrus-612.convex.site`, sin redirecciones. El titular autorizó su acceso a teléfonos/contenidos de entregas autorizadas y callbacks para ese dominio. Los generadores `build-make-send.mjs` y `build-make-events.mjs` reproducen la configuración usando referencias de conexión, sin sus secretos.

## Resultado del piloto real

El titular autorizó datos ficticios y el receptor terminado en **6020**. Se creó un proyecto aislado **PRUEBA WhatsApp OGC · Datos ficticios**, con usuarios ficticios sin inicio de sesión, consentimientos registrados y requisiciones claramente identificadas como prueba. No se ejecutaron compras ni pagos reales.

| Evento | Resultado confirmado por WhatsApp |
| --- | --- |
| Nueva requisición, caso de control independiente | Leído |
| Resultado de revisión | Leído |
| Pago en obra solicitado | Leído |
| Pago confirmado | Leído |
| Recepción | Leído |

Se conservan dos incidencias iniciales en el historial: el fallo confirmado de facturación `131042` y un resultado incierto del conector nativo (respuesta HTML inesperada). Este último permanece **Requiere revisión**, sin reenvío. La creación exitosa corresponde a una requisición ficticia independiente, no a la repetición del intento incierto.

El 10 de noviembre, el titular confirmó que **Ver requisición** funciona tras iniciar sesión y que envió **BAJA**. Se comprobó en el backend que el contacto quedó deshabilitado y con fecha de baja registrada. Un evento ficticio posterior recorrió el productor real y terminó **Omitido**, con **cero intentos de envío** y evento **Sin destinatarios habilitados**.

El proyecto ficticio quedó desactivado para WhatsApp y ambos usuarios ficticios tienen WhatsApp deshabilitado. Se conservó el historial del piloto, incluidas las incidencias. Se retiró el módulo interno temporal de pruebas del backend desplegado y se verificó que sus funciones ya no existen; no se publicaron en Git.

La interfaz se publicó en el dashboard mediante el commit `61396273`; Vercel confirmó el despliegue y se verificaron los módulos públicos de Gestión de Usuarios y Requisiciones contra el backend esperado. El piloto de los cinco eventos, enlaces y baja está completado.

## Validación técnica

- 35 pruebas de WhatsApp y 95 de estados/integración de requisiciones: **130 aprobadas**.
- Reglas de notificaciones, TypeScript de Convex y build: aprobados.
- Interfaz WhatsApp: consentimiento, cambio de teléfono, activación, canales y permisos de Finanzas; anchos 320 y 1440 px.
- Requisiciones: pruebas de interfaz aprobadas en seis anchos, de 320 a 1536 px.
- Transporte real: webhook autenticado 200; sin clave 401; falta de ID o campos extra 400. Claim duplicado/no elegible detiene el flujo con `send:false`.
- Los cinco tipos recorrieron el productor OGC, claim, plantilla real y callbacks de entrega/lectura. Las audiencias, fallos, duplicados y estados fuera de orden también se verifican en las pruebas automatizadas.

## Operación posterior

Make continúa en **Free, 1,000 créditos mensuales**; no se contrató un plan pagado. Una notificación y sus estados consumen varios créditos. Revisar consumo antes de ampliar el piloto a 1,000 mensajes mensuales.

Para activar un proyecto operativo: registrar contactos y su autorización en Gestión de Usuarios, comprobar acceso al proyecto y habilitar WhatsApp automático desde Notificaciones de requisiciones. Solo se envían eventos nuevos. Las omisiones y fallos de WhatsApp no impiden app/correo. El envío manual sigue siendo por correo.

No reejecutar escenarios completos para resolver un envío incierto. Revisar el resultado en Make y corregir exclusivamente su callback cuando exista evidencia del ID del proveedor.
