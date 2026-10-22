# Respaldo del Excel original de ingresos

Al confirmar una carga masiva en Ingresos, se crea un intento y se guarda el `File` original en Convex Storage. Antes de crear ingresos, el servidor comprueba su existencia, tamaño y SHA-256. Los bytes no se reconstruyen: se conservan fórmulas, formato y contenido, y la descarga usa el nombre original. Se aceptan `.xlsx`, `.xls` y `.xlsm` de hasta 10 MiB, 1,000 registros devueltos y una vista previa de hasta 512 KiB. Un registro excepcional cuya evidencia serializada (datos recibidos más normalizados) supere 768 KiB se rechaza explícitamente antes de confirmar.

Seleccionar, validar y cancelar antes de confirmar no crean historial. Para confirmar debe existir al menos un registro válido. Se mantiene la normalización anterior de fechas y monedas: fechas D/M/YYYY, día 1–31 y mes 1–12, sin validación adicional de calendario; moneda no reconocida → MXN. Esta mejora no modifica las definiciones contables de ingresos ni los movimientos OGC.

## Datos y atomicidad

- `income_import_attempts`: metadatos pequeños, actor de sesión, resultado, estado y errores.
- `income_import_reviews`: respuesta inmutable usada para la confirmación. Se guarda aparte para no cargar hasta 512 KiB por entrada al paginar el historial.
- `income_import_items`: valores recibidos, normalizados, errores y vínculo al ingreso creado.
- `ingresos.import_attempt_id`: procedencia de los ingresos nuevos.

La respuesta del lector externo puede omitir filas del Excel. Su resumen se conserva como información reportada; los conteos propios se refieren exclusivamente a los registros devueltos. `rowIndex` se muestra como fila reportada; si falta, se muestra la posición en la respuesta, sin inventar hoja ni coordenadas físicas. Los totales del resultado se separan por moneda.

`ingresos.bulkCreate` exige `attempt_id` y consume los registros guardados, sin aceptar nuevas filas financieras del cliente. Usa un escritor sin triggers por fila, llama una vez al mismo cálculo de `ingresos_totals` y confirma ingresos, vínculos y éxito en una única mutación. Los triggers de altas manuales, ediciones y eliminaciones siguen activos. `incomeImportHistory.confirmImport` registra el fallo en otra mutación si la operación financiera revierte. Nunca queda una carga financiera parcial.

## Reintentos y fallos

El identificador se conserva antes de iniciar el intento. Un puntero en `sessionStorage`, separado por usuario y proyecto, permite recuperarlo después de cerrar el modal o recargar la pestaña. El servidor mantiene la vista previa; no se guardan filas financieras ni bytes del Excel en el navegador. El historial permite continuar intentos pendientes con el mismo actor y permisos vigentes. Cuando falta el respaldo, hay que seleccionar un archivo con los mismos bytes y tamaño.

El mismo intento devuelve el resultado ya confirmado y no duplica ingresos. Una nueva confirmación, con otro identificador, agrega registros incluso si el archivo y los importes coinciden. La interfaz advierte cuando el hash ya tiene una carga completada y exige reconocer que se agregarán ingresos otra vez. El hash verifica archivos y permite advertir; no deduplica ingresos.

Los estados son en proceso, completada y fallida. Los rechazos conocidos forman parte del resultado. Una transferencia interrumpida conserva el intento y su error para recuperarlo. Un fallo financiero conserva el original verificado. Los intentos incompletos expiran después de 30 minutos; también pueden descartarse expresamente, conservando su evidencia. Un resultado confirmado nunca se convierte en fallido por una respuesta perdida, descarte tardío o expiración.

Cada intento tiene su propio objeto de respaldo; los ingresos referencian ese intento. Las transferencias usan un MIME reservado que identifica el intento, mientras sus metadatos conservan el tipo original. Una tarea diaria elimina, en páginas de 100, objetos marcados de más de una hora que no quedaron vinculados, incluido un POST cuya respuesta se perdió. Conserva los objetos vinculados. Los archivos de otros flujos no se modifican.

## Consulta, permisos y retención

El historial está en el modal de ingresos y se pagina en grupos de 25. El botón de archivo de origen de cada ingreso muestra el respaldo y sus valores importados. Los lectores con acceso al proyecto pueden consultar y descargar. Solo admin/finance con acceso al proyecto pueden escribir; adjuntar, confirmar o descartar exige ser quien inició el intento. La identidad proviene de la sesión; el `clerk_id` heredado no atribuye operaciones.

Los valores históricos y el Excel sobreviven a ediciones y eliminaciones de ingresos. El historial señala ingresos modificados o eliminados. El Excel fuente está separado de facturas y comprobantes; no se puede registrar como comprobante individual y quitar un comprobante que lo referencie conserva el original.

La eliminación definitiva del proyecto programa la limpieza de ingresos, totales, documentos de ingresos, vistas previas, registros de historial y originales en lotes. Además de limitar registros, cada conjunto de lecturas se detiene al alcanzar aproximadamente 256 KiB, y los trabajos continúan hasta una pasada vacía. Esto admite historiales con filas o respuestas extensas. Si existen referencias de otro proyecto al mismo original, se conserva hasta eliminar la última. Desde que desaparece el proyecto, las consultas quedan bloqueadas aunque la limpieza continúe programada.

No se ejecuta migración: los ingresos anteriores no contienen evidencia suficiente para identificar una importación o su archivo. Se muestra la ausencia de información de origen, sin atribuirles procedencia manual ni inventar un respaldo. Este historial no se incorpora al gestor general de Documentos.

## Despliegue y verificación

Publicar esquema, funciones y frontend juntos. El contrato anterior de `ingresos.bulkCreate` ya no está disponible; las pestañas antiguas deben recargarse. No requiere migración, cambios en el lector externo ni nuevas variables de entorno. Esta implementación no ejecuta despliegues.

```sh
npm run typecheck:convex
npm run build
npm run test:income-import
npm run test:income-import-ui
```

La prueba visual ejecuta la interfaz real con fixtures y servicios simulados, sin cuentas ni backend reales, a 1440, 390 y 320 px. Comprueba bytes y nombres en subida y descarga, historial, permisos de lectura, paginación, origen y ausencia histórica, advertencia de nueva confirmación, error financiero, respuesta perdida y recuperación de una transferencia tras recargar la pestaña. Sus capturas están en `output/income-import-history/`.

Línea base comprobada antes de implementar: 112 aprobadas, una omitida y un fallo de indirectos (`laborPaymentImports.test.mjs`, 6405 frente a 6225) en seis suites. Ese fallo es previo a esta mejora.

Verificación final: 43 pruebas de ingresos y permisos aprobadas. En las siete suites relacionadas: 134 aprobadas, una omitida y el mismo fallo previo de indirectos; sin errores adicionales no controlados. `typecheck:convex`, compilación de producción y prueba visual a 1440/390/320 px completadas. La compilación conserva el aviso de tamaño de los bundles existentes.
