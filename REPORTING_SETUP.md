# Reportes financieros automatizados

La implementación activa vive en `convex/`. El directorio `convex-SAAS/` se
conserva únicamente como referencia y no participa en codegen ni despliegues.

## Variables de Convex

Configura únicamente en Convex:

```text
OPENAI_API_KEY=...
OPENAI_REPORT_MODEL=gpt-5.6-terra
RESEND_API_KEY=...
RESEND_FROM_EMAIL=Reportes <reportes@example.com>
APP_URL=https://app.example.com
```

`OPENAI_REPORT_MODEL` es opcional. La integración usa Responses API con salida
estructurada, `store: false` y sin herramientas externas. Si OpenAI no está
disponible o devuelve una respuesta inválida, el PDF se genera con las alertas
deterministas y una advertencia.

El cron `scan due financial report subscriptions` se ejecuta cada cinco minutos.
La combinación `subscription_id + period_key`, junto con el lease de la
programación, evita ejecuciones duplicadas.

## Permisos y perfiles

- Superadmin: acceso global.
- Admin con organización: proyectos de su organización o asignados.
- Otros roles: proyectos incluidos en `allowed_desarrollos`.
- Sólo los administradores pueden abrir Reportes, generar ejecuciones y
  administrar programaciones.
- Los destinatarios pueden pertenecer a otros roles; cada uno recibe el PDF
  limitado a su perfil vigente.

Los destinatarios siempre son IDs de `users`; no se aceptan correos externos.
Antes de cada envío se vuelve a validar el acceso al proyecto, el rol, el estado
de invitación y el correo. Un cambio de rol selecciona automáticamente el PDF
correspondiente:

- `admin` y `user`: completo.
- `viewer`: financiero sin detalle transaccional.
- `finance`: flujo, pagos y requisiciones agregadas.
- `contratista`: programa, bitácora y requisiciones operativas.

## Pipeline

1. Construye un `ReportSnapshotV1` con fechas ISO y cálculos deterministas.
2. Ejecuta reglas críticas aunque OpenAI no esté disponible.
3. Sanitiza el contenido para IA y valida toda evidencia contra el snapshot.
4. Genera un PDF por perfil y guarda PDF más snapshot JSON en Convex Storage.
5. Resend adjunta PDFs menores de 25 MB; para archivos mayores envía el enlace.
6. Cada destinatario tiene entrega e intentos independientes.
7. Los reintentos reemplazan y eliminan del Storage los archivos anteriores.

## Verificación local

```powershell
npm.cmd run typecheck:convex
npm.cmd run test:reports
npx.cmd convex codegen
npm.cmd run build
node --experimental-strip-types .\scripts\render-report-fixture.ts
```

El último comando crea `output/pdf/reporte-financiero-fixture.pdf` para revisión
visual y extracción de texto.
