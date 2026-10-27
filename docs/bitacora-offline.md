# Bitácora offline-first

Bitácora usa IndexedDB como fuente de lectura y escritura. Convex se usa para preparar el proyecto, descargar cambios y vaciar una cola durable; Clerk continúa siendo la autoridad cuando hay red. La interfaz usa el modo conectado sólo mientras el navegador tenga red y el cliente mantenga conexión con Convex. Si la conexión falla al abrir un proyecto ya preparado, tras unos segundos se abre la copia local y se vuelve a cargar la aplicación al reconectar.

## Despliegue

1. Desplegar primero `convex/schema.ts`, `convex/bitacoraOffline.ts`, `convex/bitacora.ts` y `convex/files.ts`.
2. Ejecutar `bitacoraOffline.backfillOfflineMetadata` por proyecto, pasando cursores hasta que `isDone` sea `true`. El proceso es idempotente y los clientes nuevos también pueden leer registros heredados antes de terminarlo.
3. Desplegar el cliente con `VITE_BITACORA_OFFLINE_ENABLED=true`. El valor predeterminado es habilitado; usar `false` como interruptor de emergencia para impedir el arranque offline.
4. Abrir cada proyecto de Bitácora con conexión para descargar reportes y catálogos. La pantalla indica cuándo la preparación terminó.
5. Empezar el piloto con administradores y contratistas. Después de verificar telemetría y conflictos, ampliar al resto de roles.

La autorización offline vence siete días después de la última preparación online. Los datos pendientes se conservan si vence; no se envían hasta que Clerk y Convex vuelvan a validar permisos.

## Edición de reportes

El autor identificado por `created_by` puede corregir avance e incidencias, añadir fotografías y corregir sus descripciones mientras conserve un rol de captura y acceso al proyecto. Fecha, responsable, clasificación, estado, documentos y eliminación de archivos o reportes quedan reservados a administradores. Los reportes históricos sin autor verificable solo pueden ser editados por administradores; el nombre del responsable no establece autoría. Los comentarios de conversación en la galería mantienen sus permisos actuales.

La acción `Editar` está en el menú de cada reporte y en el detalle que se abre desde el calendario. Las fotos históricas sin descripción no impiden corregir notas. Las fotos nuevas y las descripciones modificadas deben tener texto. Guardar en línea espera confirmación del servidor; sin conexión conserva los cambios en la cola local. Un rechazo o conflicto mantiene el formulario y explica el motivo. Para revisar una nueva revisión se cierra y vuelve a abrir el reporte; los conflictos offline conservan la resolución manual existente, con los mismos permisos al reaplicar.

La caché Dexie v2 fuerza una descarga completa al reconectar para incorporar autoría. Conserva archivos, capturas y cola; solo atribuye a la cuenta local los borradores que aún no tienen registro en el servidor. Descargar la misma revisión no reemplaza ediciones pendientes. Desplegar los cambios de `bitacoraOffline` junto con el cliente antes de habilitar esta edición para autores.

## Sincronización

El orden es: renovar sesión, descargar cambios, detectar conflictos, subir originales, aplicar operaciones idempotentes y descargar confirmaciones. Un Web Lock serializa cada proyecto entre pestañas y Dexie propaga los cambios locales entre ellas. Cuando la PWA está abierta se reintenta al recuperar red, volver al primer plano, pulsar `Reintentar` o vencer el backoff.

Los archivos admitidos son JPEG, PNG, PDF, DOC, DOCX, XLS y XLSX, con máximo de 10 MiB. Se avisa al 70% de cuota y se bloquea antes del 80%. Con conexión estable, las fotos históricas se muestran directamente desde su URL original en las tarjetas y galerías, sin descarga manual. Para uso sin conexión se prepara una miniatura JPEG de 64 px como respaldo borroso; el original se guarda en IndexedDB al solicitarlo o al visitar la foto en la galería online. Si la solicitud se hace sin red, queda marcada de forma durable y se atiende en la siguiente sincronización. La galería offline filtra los originales que realmente existen en el dispositivo. `cleanupAbandonedUploads` elimina reservas de upload antiguas; debe ejecutarse periódicamente desde una tarea administrativa.

## Verificación

```bash
npm run typecheck:convex
npm run test:bitacora-offline
npm run test:bitacora-edit
npm run test:bitacora-edit-ui
npm run build
```

Las pruebas E2E requieren una sesión de Clerk previamente guardada y una ruta de proyecto accesible:

```bash
E2E_STORAGE_STATE=playwright/.auth/user.json \
E2E_BITACORA_PATH=/proyecto/<id>/bitacora \
npm run test:e2e:bitacora
```

Se configuran proyectos Chromium y WebKit. La sincronización con la PWA completamente cerrada no está garantizada; no se depende de Background Sync.
