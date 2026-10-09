# Bitácora: recuperación del funcionamiento online

## Comportamiento implementado

- Con conexión del navegador y WebSocket del servidor, se usan consultas reactivas y paginadas de Convex. Los nuevos reportes y los reportes ya sincronizados se guardan directamente en el servidor, sin escribir una operación en IndexedDB.
- Las escrituras directas reutilizan la operación atómica existente, con identificador único, revisión del reporte, validación de permisos y registro de archivos. El nombre interno del endpoint es `applyOfflineOperation`; en este flujo se invoca directamente, sin una cola local.
- La caché se prepara y actualiza en segundo plano. Un fallo de IndexedDB no bloquea la consulta o el guardado online.
- Sin conexión del navegador, sin WebSocket o con una señal de red lenta se usa el respaldo local previamente preparado. No se borran los datos ni la cola al cambiar de modo.
- Se considera lenta una señal `slow-2g`/`2g`, un ancho de banda reportado inferior a 0.5 Mbps o una latencia reportada de al menos 1000 ms. La API de calidad es opcional; cuando no está disponible se usan las señales del navegador y del servidor, sin afirmar que se midió el ancho de banda.
- Al reconectar, los pendientes y conflictos se superponen a los datos del servidor. Las eliminaciones locales pendientes permanecen ocultas. El sincronizador existente procesa la cola; los reportes que aún tienen cambios locales mantienen su flujo local hasta resolverlos.
- El indicador online y los mensajes de confirmación distinguen un guardado aceptado por el servidor de uno que quedó en el dispositivo. Los avisos de preparación y disponibilidad offline se muestran en el respaldo.

## Comprobaciones

- 48 pruebas de Bitácora aprobadas en 3 archivos. Incluyen conexión disponible/lenta/ausente, guardado directo sin IndexedDB, espera de confirmación, rechazos del servidor, carga de archivos, protección ante cambio de cuenta/proyecto, revisión de edición y conservación de pendientes/conflictos/eliminaciones.
- TypeScript de la aplicación y del entorno de validación: aprobado.
- Build de producción y generación de PWA: aprobados. Persiste el aviso existente sobre tamaño de chunks.
- ESLint de los archivos modificados: sin errores. Dos avisos de Fast Refresh en el archivo de entrada del entorno de prueba; aviso de configuración de Tailwind del proyecto.
- `git diff --check`: aprobado.

## Validación visual con datos simulados

Se utilizó un único navegador en `localhost:4186`, una base de datos del origen de prueba y un cliente simulado. No se utilizaron credenciales ni mutaciones de una obra real.

1. Con conexión adecuada: modo `online`, reporte visible y guardado confirmado como `server`; cero operaciones locales.
2. Al desconectar el servidor: modo `offline`, reporte nuevo guardado como `local`; una operación pendiente y ninguna mutación remota adicional.
3. Al reconectar: vuelta al modo `online`, envío del pendiente y contador de pendientes en cero, sin duplicar filas.
4. Con señal de conexión lenta: respaldo `offline` aunque el servidor estuviera conectado; recuperación automática al restaurar una buena señal.
5. Guardado desde el modal real: cierre del modal y mensaje «Reporte guardado en el servidor».
6. Con IndexedDB cerrado: consulta y guardado online disponibles; confirmación `server` y almacenamiento local no disponible.

Las capturas están en esta carpeta: `01-modo-online.jpg`, `02-respaldo-offline.jpg` y `03-online-sin-almacenamiento.jpg`.

## Alcance

Implementación local, sin despliegue. Queda pendiente la comprobación integrada con una sesión real de Clerk y un backend de Convex de prueba. Las capturas son evidencia de la interfaz y del flujo simulado; no representan operaciones realizadas en una obra.
