# Despliegue de la relación proveedor–transacción

## Orden seguro

1. Desplegar primero el esquema y el código tolerante a campos opcionales.
2. Ejecutar la migración interna `migrations:normalizeExistingProviders` en el deployment objetivo.
3. Revisar `name_collisions` y `rfc_collisions`; resolverlas desde la administración de proveedores mediante fusión. No crear proveedores nuevos hasta resolver colisiones activas.
4. Desplegar la versión de `ogc-excel-reader` descrita en `ogc-excel-reader-provider-contract.md`.
5. Validar una importación en vista previa. Los proveedores nuevos se crean incompletos; `DISPERSIÓN`, `EFECTIVO` y `VARIOS` se crean como genéricos.

Ejemplo de ejecución contra el deployment configurado:

```powershell
npx.cmd convex run migrations:normalizeExistingProviders
```

La migración es idempotente: vuelve a calcular normalizaciones y solo reporta colisiones; nunca fusiona registros automáticamente.

## Compatibilidad

- Las transacciones existentes conservan `proveedor_id` vacío.
- No se infiere un proveedor desde `banco`.
- Las tablas permiten filtrar `Sin proveedor`, seleccionar registros y asignar o limpiar el proveedor en lote.
- Los proveedores archivados siguen visibles en relaciones históricas, pero quedan fuera de selectores para nuevas asignaciones.
- Un archivo completado se bloquea por hash. Un lote fallido o interrumpido se reanuda por `import_batch_id + import_source_key`.

## Dependencia externa

El contrato del lector está documentado en este repositorio, pero su código y deployment no forman parte de este workspace. Hasta que ese servicio se actualice, respuestas antiguas siguen siendo compatibles y se importan sin proveedor cuando no envían `proveedor_nombre`.
