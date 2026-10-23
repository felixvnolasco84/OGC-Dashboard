# Respaldo e historial de proyecciones de gasto y cobro

Las tres entradas de Excel (menú del proyecto de obra, `/admin/flujo` y `/admin/sales-flujo`) comparten revisión y confirmación. Seleccionar o validar no crea intentos ni modifica cifras. Confirmar registra el intento, respalda los bytes originales en Convex Storage y comprueba SHA-256 y tamaño en el servidor. El servidor vuelve a enviar ese original al mismo formato del lector y exige que su respuesta normalizada coincida con la revisión. No se confía en que el lector externo conserve archivos.

`projection_import_attempts` conserva proyecto y tipo, usuario y nombre al cargar, fecha, archivo, hoja, formato, huellas, resultado o error. `projection_import_items` conserva las partidas, importes por semana y metadatos realmente recibidos; no inventa filas o columnas. Los originales no se registran como documentos, facturas ni comprobantes. La primera versión permite consulta y descarga; no incluye comparación ni restauración.

Las tablas `projected_transactions`, `weekly_projected_totals` y `sales_projected_transactions` contienen únicamente cifras vigentes. Gasto recalcula sus totales semanales en el mismo reemplazo atómico; ventas continúa consultando sus proyecciones directamente y no llena `sales_weekly_projected_totals`. El reemplazo, las instantáneas y el resultado exitoso se confirman juntos. Los valores de los historiales nunca entran en las sumas financieras. Una confirmación equivalente conserva un evento «Sin cambios» y su original sin reemplazar la versión financiera.

Los reintentos técnicos recuperan el mismo `request_id`, incluso después de perder una respuesta. El navegador conserva la referencia pendiente en `sessionStorage`; volver a seleccionar el mismo Excel permite recuperar su intento. Si ya terminó, una nueva confirmación crea otro evento. Los respaldos idénticos se reutilizan únicamente dentro del mismo proyecto y tipo. Las transferencias nuevas están vinculadas a su intento mediante el tipo de almacenamiento. Un fallo posterior al respaldo conserva el archivo; una transferencia sin asociación confirmada figura sin original disponible. Los intentos abandonados fallan después de 30 minutos. Los errores del lector y fechas inválidas rechazan la carga completa; no se guardan subconjuntos ni fechas `0`.

Se permiten `.xlsx` y `.xls`, hasta 10 MB, 1000 partidas y 5000 proyecciones semanales por carga. Se valida además el trabajo del reemplazo con margen para las instantáneas anteriores y los agregados; una recarga que exceda ese límite falla sin modificar cifras. El original debe contener al menos una proyección procesada. El formato `/projections` puede omitir semanas con importe cero; no se reconstruyen celdas omitidas por el lector.

La revisión captura una huella de las cifras y totales vigentes. Si otra operación los modifica antes de confirmar, se conserva un intento fallido con su respaldo y se exige revisar de nuevo. No hay sobrescrituras silenciosas por concurrencia.

Consultar historial, valores, origen y descargas requiere acceso actual al proyecto. Adjuntar o confirmar exige permiso de escritura actual y ser quien inició la carga. Obra usa su política de acceso existente; ventas respeta administradores globales, administradores de la organización y asignaciones de proyectos de ventas. Las mutaciones anteriores de carga ya no aceptan reemplazos. La herramienta antigua de totales en `/admin` se bloquea, tanto en UI como en servidor, para proyectos incorporados al historial.

El historial se consulta desde las pantallas de proyecciones y las entradas administrativas. «Ver origen» muestra el respaldo vigente y los valores de una semana, respetando el filtro por partida. El historial también está disponible cuando las cifras vigentes están vacías. Las listas de cargas y partidas se paginan de 25 en 25. La descarga conserva el nombre y bytes originales.

Eliminar definitivamente un proyecto revoca el acceso inmediatamente y limpia historial y archivos en lotes programados. Los originales reutilizados dentro de ese proyecto se eliminan durante la misma limpieza. Recargar proyecciones no elimina sus respaldos anteriores.

Las transferencias que dejaron objetos sin asociar (por ejemplo, al perderse la respuesta de subida) se limpian dos horas después del inicio, en páginas acotadas a la ventana de transferencia. La limpieza reconoce la etiqueta de ese intento, conserva el respaldo asociado y no borra archivos de otros módulos.

## Activación e históricos

Desplegar el esquema y funciones junto con el frontend actualizado. Las pestañas antiguas deben recargarse: sus mutaciones de carga dejaron de aceptar datos sin respaldo. Este trabajo local no ejecuta despliegues ni migraciones de producción.

Los metadatos y valores vigentes anteriores se conservan automáticamente antes de la primera recarga respaldada. Para incorporar también los proyectos que aún no se recargan, ejecutar primero el diagnóstico en el entorno elegido:

```sh
node scripts/run-projection-import-history-migration.mjs
```

La aplicación es explícita:

```sh
node scripts/run-projection-import-history-migration.mjs --apply
```

`--prod` selecciona producción, tanto para diagnóstico como para aplicación. La migración procesa un proyecto por llamada y se puede reiniciar. No altera cifras vigentes. Agrupa únicamente datos todavía presentes por proyecto y `upload_id`; los identifica como históricos, sin autor ni original disponible. Los valores son una instantánea al incorporar el historial, no una reconstrucción del resultado original. Las versiones ya reemplazadas y los archivos nunca guardados no son recuperables. Los totales de origen independiente no se atribuyen a un Excel de proyecciones.

## Verificación local

```sh
npm run typecheck:convex
npm run build
npm run test:projection-import
npm run test:projection-import-ui
```

Las pruebas de backend usan Convex en memoria, sin despliegues. Las pruebas de UI usan las tres entradas y pantallas reales con un backend simulado y un Excel real generado con fórmula y formato. Comprueban nombre y bytes de subida/descarga, historial, origen, paginación, fallos, recuperación de respuestas perdidas y anchos de 1440, 390 y 320 px. Las capturas en `output/projection-import-history/` corresponden a datos ficticios locales, no a una validación en producción.
