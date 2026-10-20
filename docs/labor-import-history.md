# Respaldo e historial de importaciones de pagos

Al confirmar un Excel en las transacciones de un proyecto, la aplicación crea un intento, guarda el `File` original en Convex Storage y verifica su SHA-256 y tamaño antes de modificar pagos. Validar o previsualizar un archivo no crea historial.

`labor_payment_import_attempts` conserva usuario, fecha, metadatos, respaldo, resultado o error. `labor_payment_import_attempt_items` conserva las transacciones y filas que realmente aparecieron en cada Excel, con sus valores al importar. Los cortes consolidados pueden contener pagos de varios archivos; por ello no se usan como prueba de que un Excel incluya una transacción.

Las cargas nuevas, actualizaciones y confirmaciones sin cambios conservan eventos independientes. Los reintentos del mismo `request_id` recuperan el intento y resultado guardados. El archivo puede reutilizarse por hash dentro del mismo proyecto. Una carga fallida conserva su respaldo si se alcanzó a registrar; una transferencia que no terminó aparece sin archivo disponible. Los intentos abandonados fallan automáticamente después de 30 minutos.

Las consultas y descargas requieren acceso al proyecto. Solo quien inició un intento, con permiso de escritura vigente, puede adjuntar o confirmar. Eliminar una transacción conserva los originales y sus valores históricos. Eliminar definitivamente el proyecto elimina también el historial, sus cortes y sus respaldos; los historiales grandes se limpian en lotes programados, sin acceso desde el momento en que se elimina el proyecto.

## Despliegue y metadatos anteriores

Desplegar el esquema y las funciones de Convex junto con el frontend actualizado. La mutación `laborPaymentImports.replaceLaborPaymentImport` ahora exige `attempt_id`; ya no admite importaciones sin respaldo. Las pestañas con el frontend anterior deben recargarse.

Después de desplegar las funciones, revisar primero el diagnóstico:

```sh
node scripts/run-labor-import-history-migration.mjs
```

Aplicar la migración en el entorno de desarrollo:

```sh
node scripts/run-labor-import-history-migration.mjs --apply
```

Para un despliegue en producción, agregar `--prod` tanto al diagnóstico como a la aplicación. El script procesa 25 cortes por llamada. Es seguro reiniciarlo: agrupa por proyecto, hash, usuario y fecha de importación, y omite los cortes ya incorporados. No cambia pagos ni inventa archivos, resultados o asociaciones anteriores. Los registros migrados aparecen como históricos sin original disponible.

## Verificación

```sh
npm run typecheck:convex
npm run build
npm run test:labor-import
npx vitest run --config vitest.config.ts --configLoader runner --no-isolate convex/laborPaymentImports.test.mjs convex/proveedoresPermissions.test.mjs convex/transactionDeletion.test.mjs
npm run test:labor-import-ui
```

La prueba visual usa datos ficticios en localhost, carga un Excel real y comprueba sus bytes de subida y descarga, nombre, historial, paginación, referencias, errores y recuperación de respuestas perdidas a 1440, 390 y 320 px. No usa el backend ni cuentas reales.

La línea base anterior a esta mejora ya falla en `retains manual honorarios and calculates indirectos only after their starting date` (6405 frente a 6225). Esta mejora no modifica las reglas de cálculo de indirectos.
