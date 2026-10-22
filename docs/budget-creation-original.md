# Excel original del presupuesto inicial de obra

Al confirmar **Crear proyecto y guardar Excel**, se registra un intento de creación y se conservan los bytes y el nombre originales del `.xls` o `.xlsx`. Seleccionar, cambiar o validar un archivo no crea historial. El tamaño máximo sigue siendo 10 MB.

El original se verifica por SHA-256 y tamaño antes de llamar al lector existente. El servidor envía al lector ese mismo respaldo, conserva una interpretación inmutable y solo entonces crea el proyecto. Se mantienen la normalización numérica de obra, el orden secuencial de las partidas, la jerarquía, los cálculos existentes y los pagos semanales positivos en MXN con estado Pendiente. Un valor numérico no interpretable se reporta; no se introduce otra conversión silenciosa a cero.

## Consulta

- **Presupuesto → Excel de origen** y **Documentos → Excel del presupuesto inicial** consultan el mismo respaldo protegido.
- **Proyectos → Creaciones de proyectos** permite consultar intentos fallidos sin proyecto y reanudar creaciones incompletas. La lista se pagina de 25 en 25.
- El menú de cada partida y el detalle de las transacciones semanales generadas permiten consultar su origen.
- Los valores históricos y los vínculos se conservan aunque posteriormente se editen o eliminen partidas o pagos. El original no cuenta como factura, comprobante ni presupuesto adjunto de una transacción.
- Los números de registro indican el orden interpretado por el lector, no coordenadas físicas del Excel. No se inventan hojas, filas, versiones del lector o archivos históricos. Los conceptos anteriores muestran su nombre de origen cuando existe y “Archivo original no disponible”.

## Recuperación y conservación

`budget_creation_attempts` identifica cada confirmación mediante usuario y `request_id`. La creación del proyecto y su asociación al intento se guardan juntas. Cada partida o pago y su registro en `budget_creation_items` se confirman en la misma mutación que avanza el cursor. Las peticiones concurrentes comparan el cursor dentro de la transacción. Una respuesta perdida no crea otro proyecto ni repite una operación confirmada.

El proceso completo consta de varias mutaciones. Cada llamada a `continueCreation` ejecuta hasta diez operaciones; el navegador continúa por bloques y puede detenerse al cerrar o pausar. La siguiente llamada recupera el cursor persistido. Si falla una etapa, se conservan el original, la interpretación y los pasos confirmados. Un resultado completado no puede convertirse en fallido por una respuesta tardía.

El proyecto muestra **Creación incompleta** hasta concluir. Los accesos de escritura de presupuesto, edición/eliminación de partidas, creación/edición/eliminación de pagos, importación laboral y sincronización de presupuesto verifican esta condición para evitar interferir con la recuperación. Se puede eliminar definitivamente el proyecto.

La inactividad de treinta minutos marca la carga como interrumpida, conservando su recuperación. Los intentos sin proyecto se eliminan a los treinta días de su confirmación, incluidos sus respaldos. Los proyectos incompletos no expiran. Al eliminar definitivamente el proyecto se cancela el acceso de inmediato y se programa la eliminación del historial y archivos en lotes de cien registros.

Las cargas HTTP guardan en Storage un marcador interno de intento y tipo de archivo, sin alterar los bytes. Una conciliación diaria paginada elimina únicamente archivos propios sin asociación, con más de una hora de antigüedad. Cubre una interrupción entre almacenar y asociar o archivos duplicados cuyo identificador no recibió el navegador. No borra documentos de otros módulos.

Crear y reanudar exige administrador y que el usuario autenticado sea el iniciador con su ámbito de organización vigente. La consulta y descarga de proyectos usa sus permisos actuales; los intentos sin proyecto requieren administrador del mismo ámbito o administrador global. La descarga autentica cada petición HTTP y no entrega una URL pública de Storage.

## Capacidad y despliegue

La interpretación admite hasta 3,000 registros, 260 referencias semanales por registro y 4 MiB de manifiesto. Si supera la capacidad o falla la validación antes de crear el proyecto, el intento conserva el original y muestra el error. Los bloques posteriores siguen sujetos a los límites de ejecución de Convex; un error conserva el avance recuperable.

Desplegar el backend y el frontend juntos. La antigua mutación `desarrollos.create` rechaza creaciones sin respaldo y pide recargar las pestañas anteriores. Ventas permanece en su flujo existente. No se requieren migraciones de datos históricos ni se reimportan presupuestos de proyectos existentes.

Configurar en Convex `BUDGET_IMPORT_ALLOWED_ORIGINS` con los orígenes exactos del frontend separados por comas. Si no se define, se usa `APP_URL`. Los orígenes locales `http://localhost:<puerto>` y `http://127.0.0.1:<puerto>` también se admiten con autenticación. `VITE_CONVEX_SITE_URL` es opcional para despliegues estándar: se deriva de `VITE_CONVEX_URL` cambiando `.convex.cloud` por `.convex.site`; los dominios personalizados deben configurar la URL explícitamente.

## Validación local

```sh
npm run typecheck:convex
npm run build
npx vitest run --config vitest.config.ts --configLoader runner convex/budgetCreation.test.mjs convex/presupuesto.test.mjs convex/projectFeeImpact.test.mjs convex/projectDocumentFolders.test.mjs convex/partidaEdit.test.mjs convex/partidaDeletion.test.mjs convex/paymentHierarchy.test.mjs convex/paymentEdit.test.mjs convex/transactionDeletion.test.mjs convex/laborPaymentImports.test.mjs
node scripts/test-budget-creation-ui.mjs
```

En Windows con sandbox, utilizar `npm.cmd` y configurar `TEMP` y `TMP` a un directorio temporal del workspace cuando Vitest o el generador de Convex no puedan compartir los temporales del sistema. La prueba visual levanta localhost y usa datos ficticios, stubs del backend y Excel reales con fórmula y formato; verifica los bytes y nombres de `.xlsx` y `.xls` y captura 1440, 390 y 320 px en `output/budget-creation/`. No usa datos reales ni despliega cambios.

La suite laboral tiene documentado desde antes el fallo `retains manual honorarios and calculates indirectos only after their starting date` (6405 obtenido frente a 6225 esperado). Esta implementación no modifica las reglas financieras de indirectos.
