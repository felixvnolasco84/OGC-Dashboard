# Excel originales e historial de cargas de Programa de obra

Al pulsar **Aplicar cambios revisados**, el programa registra una confirmación y respalda el `File` recibido, sin reconstruirlo ni modificarlo con los ajustes de la vista previa. Se conserva su nombre exacto, extensión, tamaño, SHA-256 y, cuando el lector la informa, la hoja. Seleccionar, leer o revisar el archivo no crea intentos.

## Arquitectura y decisiones

- `programa_obra_import_attempts`: proyecto, identificador de confirmación, usuario de sesión y nombre al confirmar, fechas, metadatos del archivo, estado, resultado terminal y referencia a la revisión. Los estados son en proceso, completada, sin cambios, fallida e histórica.
- `programa_obra_import_reviews`: evidencia confirmada y aplicada en documentos separados. Conserva las decisiones de conflictos de fechas, filas revisadas, mapeos por ID, propuesta, advertencias y ausentes. Separar estos JSON evita cargar documentos grandes al paginar intentos o consultar las últimas revisiones del programa.
- `programa_obra_import_items`: filas efectivamente incluidas, identidad de partida/familia/subpartida, valores antes/después y resultado de la fila. Los efectos sobre actividades se guardan como `activity_effect`, separados de la procedencia directa de las filas. Incluye cambios por dependencias e incorporación de actividades, incluso cuando la familia no apareció en el archivo.
- `programa_obra_revisions.import_attempt_id`: enlaza la revisión con su confirmación. Las revisiones nuevas también existen sin configuración de ejecución. No se atribuyen archivos a aprobaciones o reprogramaciones manuales.

La asociación histórica usa los IDs que resolvió el servidor, con nombres al importar. No se reconstruye a partir del estado actual ni se vinculan registros ausentes como si aparecieran en el nuevo Excel. Los índices del arreglo identifican posiciones en los datos revisados; el lector no entrega coordenadas físicas y no se presentan como números de fila del Excel.

La comparación de filas considera fechas civiles, nombres, hitos, porcentajes, peso y orden que efectivamente escribe la importación. Si esos valores y los efectos en actividades son iguales, el resultado es **sin cambios**, se conserva el respaldo y se registra una revisión sin incrementar la versión. Los ceros que la primera vista ya convertía a `undefined` mantienen su comportamiento anterior; esta mejora no cambia su interpretación.

## Confirmación, concurrencia y permisos

1. El cliente retiene el archivo hasta la confirmación y calcula el hash de sus bytes originales.
2. `startAttempt` exige escritura y acceso; cuando existe configuración, exige capacidad `plan`, incluso con ejecución desactivada. Vincula el identificador a los datos revisados mediante una huella canónica calculada por el servidor. Cada nueva confirmación crea otro evento. Puede reutilizar un objeto verificado del mismo proyecto y hash, conservando el nombre propio de cada confirmación.
3. Storage recibe directamente el archivo original. `attachFile` verifica existencia, tamaño y SHA-256 contra sus metadatos del servidor. Solo el iniciador con permiso vigente puede adjuntar o aplicar.
4. `confirmImport` llama a `bulkUpsertFromExcel`. La mutación vuelve a comprobar autorización y la identidad de la confirmación; recupera un resultado terminal antes de comparar la huella anterior del programa. Después verifica el respaldo y recalcula la previsualización y concurrencia.
5. Las filas, actividades, vínculos, revisión, versión y resultado se escriben en una sola mutación. Cualquier fallo revierte todos esos cambios. La acción registra el fallo en otra mutación, conservando un original que haya quedado verificado.

No se interpreta un error de conexión como autorización para crear otra confirmación. El cliente conserva el identificador y ofrece **Comprobar resultado** cuando no consigue recuperar la respuesta. Las confirmaciones completadas no se convierten en fallidas por una respuesta perdida. Cerrar, cambiar de proyecto o desmontar cancela el parseo/subida en curso e impide aplicar después una operación que aún no se había enviado. Una aplicación ya enviada conserva su resultado en el proyecto confirmado. Los intentos interrumpidos sin resultado expiran a los 30 minutos.

Los lectores autorizados del proyecto pueden consultar y descargar. Las consultas exigen que el proyecto siga existiendo. Las fuentes se consultan por proyecto e identidad histórica, incluso si el registro se archivó o eliminó. Los originales no cuentan como facturas, comprobantes ni evidencia de aceptación técnica.

## Interfaz y límites

**Historial de cargas** está disponible en el programa y en actividades por frente. Ofrece páginas de 25 intentos, descarga, detalles paginados, decisiones y valores históricos. **Fuentes de Excel** aparece en las opciones de cada partida/familia. El detalle de una actividad distingue archivos de su familia y efectos registrados en ese frente. Las revisiones de importación abren este mismo historial.

Se admiten `.xls` y `.xlsx` de hasta 10 MB y de 1 a 2000 filas revisadas. La evidencia confirmada se limita a 750 KB y la aplicada a 900 KB por documento para respetar los límites de Convex; se informa si hace falta dividir una revisión muy extensa. Los datos de historial y eliminación se procesan en lotes acotados. Una transferencia que no llegó a adjuntarse no se muestra como original disponible.

Eliminar o archivar un registro individual conserva archivos y valores históricos. La eliminación definitiva del proyecto inicia la limpieza por lotes de intentos, evidencia, vínculos, Storage y todas las tablas de Programa de obra, incluyendo registros anteriores a esta mejora. El acceso desaparece con el proyecto; los objetos compartidos dentro de él se eliminan sin afectar otros proyectos.

## Preparación del despliegue e históricos

Desplegar esquema, funciones y frontend de forma coordinada. `bulkUpsertFromExcel` ahora requiere `attempt_id`, `review` y huella revisada; las pestañas anteriores deben recargarse. No se han ejecutado despliegues ni migraciones durante esta implementación.

Después de desplegar, el diagnóstico de revisiones anteriores se ejecuta explícitamente:

```sh
node scripts/run-programa-import-history-migration.mjs
```

Para incorporar esas revisiones al historial:

```sh
node scripts/run-programa-import-history-migration.mjs --apply
```

`--prod` selecciona explícitamente producción en ambos comandos. La migración procesa 25 revisiones por llamada y es idempotente por ID de revisión. Solo incorpora revisiones `import` de proyectos existentes, conservando actor, fecha y JSON comprobables. El nombre del actor anterior se resuelve desde su perfil actual. No inventa nombres/hash/bytes de archivos, resultados ni relaciones a filas actuales. Los históricos aparecen con **Archivo original no disponible**. Las importaciones antiguas que no generaron revisión no tienen evidencia que permita reconstruir un historial confiable.

## Verificación local

```sh
npm run typecheck:convex
npm run build
npm run test:programa
npm run test:programa-import
npm run test:programa-import-ui
npm run test:programa-ui
npm run test:programa-weight-ui
npm run test:programa-export-ui
npm run test:reports
```

Las pruebas nuevas usan el esquema de la aplicación y Storage emulado por `convex-test`. Cubren bytes y nombres de ambas extensiones, programas sin configuración/preparados/activos, confirmaciones simultáneas, repetidas y nuevas, hash compartido por proyecto, renombres, omisiones, fechas reales, frentes divididos, efectos por dependencias, concurrencia, permisos, tamaño/hash/metadatos, rollback, expiración, migración idempotente y limpieza paginada.

La prueba visual usa los componentes de la aplicación y un transporte simulado en localhost a 1440, 390 y 320 px. Genera archivos Excel reales y verifica sus bytes de subida/descarga, nombre, ambas revisiones, mapeos, historial, fuentes, paginación, cancelación, teclado, permisos y recuperación de respuestas perdidas. No accede a cuentas ni datos reales. Capturas y resultados: `output/programa-import-history/`.

Línea base verificada antes de editar: 51 pruebas de ejecución aprobadas y reglas puras del programa aprobadas. Resultado final: esas 51 pruebas, 16 pruebas nuevas de importación y 9 de reportes aprobadas (76 en total); tipos, build y las cuatro suites visuales aprobadas. Los cambios concurrentes de otros módulos se conservaron.
