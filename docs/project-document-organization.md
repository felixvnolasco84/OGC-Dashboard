# Organización de documentos del proyecto

La raíz física se identifica por `proyecto` y `system_kind=project_root`. El proyecto muestra sus hijos directamente bajo Documentos; la biblioteca general conserva el árbol físico. Los tipos se identifican por `type_key`, incluso si se renombra la carpeta. Los documentos registran `folder_assignment=automatic|manual`.

## Despliegue y corrección histórica

1. Publicar primero el backend compatible en el despliegue correspondiente (`npx convex dev --once` para desarrollo, `npx convex deploy` para producción).
2. Ejecutar `node scripts/run-project-document-migration.mjs` y revisar el reporte de diagnóstico en `outputs/`. El diagnóstico escribe únicamente registros operativos de migración; no altera carpetas ni documentos.
3. Ejecutar `node scripts/run-project-document-migration.mjs --apply`. Los IDs de ejecución y el progreso se conservan en el servidor; repetir el comando reanuda la ejecución.
4. Ejecutar `node scripts/run-project-document-migration.mjs --apply --restart` para verificar que una segunda pasada termine con cero cambios.
5. Publicar la interfaz tras verificar los resultados. Los casos compartidos o sin propietario inequívoco se reportan y conservan su ubicación; requieren resolver su propiedad antes de otra pasada.

Agregar `--prod` a los comandos de migración para producción. Sin esa opción usan el despliegue de desarrollo configurado. Los informes de diagnóstico y aplicación se guardan por separado. `--restart` inicia una nueva revisión completa; nunca elimina archivos.

La migración inventaría primero las declaraciones de propiedad y después todos los documentos, propagando sus propietarios a los ancestros. Solo adopta árboles con un único proyecto y sin contenido de ventas/general. Conserva destinos existentes y clasifica únicamente documentos sin carpeta. Consolida raíces duplicadas y Minutas por lotes, verificando que la carpeta esté vacía antes de eliminarla.

Las cargas nuevas siempre resuelven ubicación dentro de la transacción de creación. Las lecturas indexadas permiten que Convex detecte conflictos y reintente cargas concurrentes, evitando duplicar raíz y carpetas por tipo. Las operaciones manuales validan toda la ascendencia del destino. Ventas y las minutas del módulo Tareas conservan sus flujos existentes.

## Validación realizada

- `npm run test:project-documents`: 12 pruebas de handlers y reglas; cargas normales/heredadas, Bitácora (alta, edición y foto adicional), operación offline con reintento, factura directa con reintento, destinos manuales, aislamiento, cambios de tipo, renombrado/movimiento de carpetas y migración por lotes.
- `npx vitest run --config vitest.config.ts --configLoader runner src/lib/bitacora-offline`: 10 pruebas existentes del almacenamiento offline.
- Compilación completa, comprobación de tipos de Convex y ESLint de los archivos nuevos y navegación modificada.
- Recarga completa: las consultas esperan a la autenticación de Convex y al acceso al proyecto antes de solicitar sus carpetas.
- Sesión real en Chrome: árbol de Larena sin Biblioteca/raíz repetida, Factura con cinco archivos, breadcrumb a Documentos, selector de destino simplificado, Minutas dentro de Larena en Documentos generales y ausencia de Organizar en ambas vistas.
- Vista móvil a 390 px CSS: ancho del documento igual al viewport, árbol accesible desde el menú y paginación de bitacora_documento (1–25 de 78). Se restauró el viewport original al terminar.
- La corrección se aplicó en el despliegue de desarrollo configurado. Los reportes históricos están en `outputs/project-document-migration-dev-first-apply.json` y `outputs/project-document-migration-dev-type-keys.json`; la verificación final queda en `outputs/project-document-migration-dev-apply.json`. Los 14 casos compartidos o sin propietario inequívoco conservan sus ubicaciones.
