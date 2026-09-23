# Bitácora offline-first

Bitácora usa IndexedDB como fuente de lectura y escritura. Convex se usa para preparar el proyecto, descargar cambios y vaciar una cola durable; Clerk continúa siendo la autoridad cuando hay red.

## Despliegue

1. Desplegar primero `convex/schema.ts`, `convex/bitacoraOffline.ts`, `convex/bitacora.ts` y `convex/files.ts`.
2. Ejecutar `bitacoraOffline.backfillOfflineMetadata` por proyecto, pasando cursores hasta que `isDone` sea `true`. El proceso es idempotente y los clientes nuevos también pueden leer registros heredados antes de terminarlo.
3. Desplegar el cliente con `VITE_BITACORA_OFFLINE_ENABLED=true`. El valor predeterminado es habilitado; usar `false` como interruptor de emergencia para impedir el arranque offline.
4. Abrir cada proyecto de Bitácora con conexión para descargar reportes y catálogos. La pantalla indica cuándo la preparación terminó.
5. Empezar el piloto con administradores y contratistas. Después de verificar telemetría y conflictos, ampliar al resto de roles.

La autorización offline vence siete días después de la última preparación online. Los datos pendientes se conservan si vence; no se envían hasta que Clerk y Convex vuelvan a validar permisos.

## Sincronización

El orden es: renovar sesión, descargar cambios, detectar conflictos, subir originales, aplicar operaciones idempotentes y descargar confirmaciones. Un Web Lock serializa cada proyecto entre pestañas y Dexie propaga los cambios locales entre ellas. Cuando la PWA está abierta se reintenta al recuperar red, volver al primer plano, pulsar `Reintentar` o vencer el backoff.

Los archivos admitidos son JPEG, PNG, PDF, DOC, DOCX, XLS y XLSX, con máximo de 10 MiB. Se avisa al 70% de cuota y se bloquea antes del 80%. Para una foto histórica sólo se prepara una miniatura JPEG de 64 px que la interfaz muestra desenfocada; nunca se usa el URL del original en la tarjeta. El original se guarda en IndexedDB al solicitar la descarga o al visitar la foto en la galería online. Si la solicitud se hace sin red, queda marcada de forma durable y se atiende en la siguiente sincronización. La galería offline filtra los originales que realmente existen en el dispositivo. `cleanupAbandonedUploads` elimina reservas de upload antiguas; debe ejecutarse periódicamente desde una tarea administrativa.

## Verificación

```bash
npm run typecheck:convex
npm run test:bitacora-offline
npm run build
```

Las pruebas E2E requieren una sesión de Clerk previamente guardada y una ruta de proyecto accesible:

```bash
E2E_STORAGE_STATE=playwright/.auth/user.json \
E2E_BITACORA_PATH=/proyecto/<id>/bitacora \
npm run test:e2e:bitacora
```

Se configuran proyectos Chromium y WebKit. La sincronización con la PWA completamente cerrada no está garantizada; no se depende de Background Sync.
