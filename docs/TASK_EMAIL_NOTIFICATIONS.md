# Notificaciones por correo de tareas

## Eventos cubiertos

| Evento | Destinatarios | Cuándo se envía |
| --- | --- | --- |
| `assigned` | Nuevos responsables | Al crear, duplicar o agregar responsables |
| `unassigned` | Responsables retirados | Al retirar a un responsable |
| `comment_added` | Creador y responsables | Al agregar un comentario; excluye autor y mencionados |
| `mentioned` | Usuarios mencionados | Al detectar `@nombre` o `@correo` en un comentario |
| `due_date_changed` | Creador y responsables | Al cambiar la fecha límite |
| `priority_changed` | Creador y responsables | Al cambiar la prioridad |
| `status_changed` | Creador y responsables | Para cambios generales de estado |
| `blocked` | Creador y responsables | Al marcar la tarea como bloqueada |
| `reopened` | Creador y responsables | Al reactivar una tarea completada o cancelada |
| `cancelled` | Creador y responsables | Al cancelar la tarea |
| `completed` | Creador y responsables | Al completar la tarea, incluso automáticamente por subtareas |
| `due_soon` | Responsables | Una vez al entrar en la ventana de tres días |
| `due_today` | Responsables | Una vez el día de vencimiento |
| `overdue` | Responsables | Una vez cuando la tarea queda vencida |

El actor se excluye de los destinatarios y las entregas se deduplican en
`task_email_deliveries`. Los recordatorios se evalúan diariamente a las 07:00
de `America/Mexico_City`.

## Configuración de Convex

Configurar estas variables en el deployment donde correrán los correos:

- `RESEND_API_KEY`: API key de Resend.
- `RESEND_FROM_EMAIL`: remitente verificado, por ejemplo `OGC Dashboard <tareas@dominio-verificado.mx>`.
- `APP_URL`: URL pública del dashboard sin `/` final. El logo se carga desde
  `${APP_URL}/OGC-LOGO.svg`.
- `TASK_EMAIL_MOCK_SECRET`: secreto aleatorio que protege el endpoint de mocks.
- `TASK_EMAIL_MOCK_RECIPIENT`: destinatario permitido para mocks. Por defecto
  es `felixvnolasco@gmail.com`.

## Pruebas y vistas previas

```powershell
npm.cmd run test:task-emails
```

El comando valida las 14 variantes y genera el índice visual en
`output/task-email-previews/index.html`.

Para enviar la suite después de configurar las variables, proporcionar el mismo
secreto al proceso (sin guardarlo en el repositorio) y ejecutar:

```powershell
$env:TASK_EMAIL_MOCK_SECRET = "<secreto configurado en Convex>"
npm.cmd run send:task-email-mocks
Remove-Item Env:TASK_EMAIL_MOCK_SECRET
```

El cliente llama a `taskNotifications:sendMockEmailSuite`. La función solo
acepta el destinatario configurado y devuelve el identificador de Resend de los
14 mensajes.
