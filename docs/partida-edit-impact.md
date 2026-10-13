# Edición de presupuesto con revisión de impacto

Implementación local del 13 de octubre de 2026. Alcance: Construcción; Sales y Sincronizar datos quedan fuera.

## Comportamiento

El formulario carga datos actuales y muestra «Cambios al guardar» sin añadir un segundo paso de confirmación. Incluye campos anteriores/nuevos, moneda vigente del proyecto, aprobado/por gastar de la jerarquía, pagado conservado, originales recalculados y totales globales. Los filtros de presentación no limitan la revisión. El pie del diálogo permanece accesible al recorrer el formulario.

Las ediciones directas del aprobado de padres no se distribuyen entre hijos. Una edición posterior de hijos puede sustituirlas mediante rollup; el formulario explica esta regla. Cantidad × precio no se convierte automáticamente en aprobado.

Se muestra cuántos detalles actuales de Programa cambian al renombrar una subpartida. Se conservan IDs, snapshots e históricos. Si otro hermano mantiene el nombre anterior equivalente, las referencias de Programa conservan ese nombre. La clasificación actual de indirectos utiliza también nombres; el análisis recalcula esa consecuencia con las reglas existentes.

Cancelar/cerrar/Escape piden descartar el borrador dentro del mismo diálogo cuando hay cambios pendientes. Durante el guardado se bloquean nuevas solicitudes y cierres. Errores y conflictos conservan el borrador; al actualizar la revisión se conservan sólo los campos editados por el usuario y se renuevan los demás.

## Contrato y reglas compartidas

- `partida.getEditContext({id, proyecto, nivel})`: datos actuales y autorización.
- `partida.getEditImpact({id, proyecto, nivel, changes})`: consulta sin escrituras con la transición y `expectedReview`.
- `partida.update({id, proyecto, nivel, changes, expectedReview})`: recalcula el análisis dentro de la transacción, compara la revisión y aplica sólo los cambios permitidos.

`nivel` es el nivel persistido 1/2/3; el dropdown usa 0/1/2. Los campos inmutables y derivados ya no viajan como valores a escribir. En todos los niveles se permite aprobado; sólo en subpartidas, nombre/unidad/cantidad/precio. El servidor valida finitud, no negatividad, nombres equivalentes, existencia y acceso al proyecto, incluyendo el rechazo de viewer/almacenista.

`budgetRollupRules` conserva las reglas de agregación y los pagos propios de padres; también se usa en las cascadas y rollups existentes. El plan de edición se usa tanto para revisar como para guardar. Los triggers siguen activos. El cache final de métricas de esta edición usa la composición revisada con honorarios e indirectos, evitando que el recálculo anterior omitiera indirectos. No se cambian sus fórmulas ni transacciones/pagos.

La revisión compara datos relevantes del proyecto y documentos de presupuesto completos, además de las referencias de Programa afectadas. Es deliberadamente conservadora: un cambio en otra partida del proyecto también requiere revisar de nuevo. El token no sustituye autorización ni validación; su contenido se vuelve a construir en el servidor.

Los análisis completos se limitan a 5.000 documentos, 4 MiB y 2.800 lecturas indexadas, reservando margen para guardar. Al superar esos límites no se presenta una estimación como impacto verificado y no se aplica la edición. No hay migraciones.

## Validación y capturas

- `npm run test:partida-edit`: 42 casos con `convex-test`, mutaciones y triggers reales; comparación preview/persistencia, padres/hojas, pagos directos, negativos/cero, nombres, permisos, concurrencia, conservación de fuentes y límites.
- `npm run test:partida-edit-ui`: interfaz real a través de tabla y dropdown sobre un backend aislado en memoria. Revisa 1440/390/320 px, un viewport corto de 320 × 640, filtros, USD, cancelación/reapertura, teclado, errores, rebase, respuestas obsoletas y un solo envío.
- Regresión: 256 pruebas aprobadas (incluyen las 42 nuevas) y una omitida, cubriendo presupuesto, jerarquía de pagos, borrado, Programa, honorarios/indirectos, pagos y P&L. En el sandbox de Windows, ejecutar Vitest con `--pool=threads` evita un fallo de acceso a temporales de los procesos fork.
- Compilación, tipos de Convex y ESLint del editor aprobados. El lint del archivo completo `convex/partida.ts` conserva 16 errores de `no-explicit-any`, verificados también en HEAD; no los introduce esta implementación.

Capturas inspeccionadas en `output/partida-edit-impact/`: formulario, comparación, totales, conflicto y éxito en escritorio/móvil; error de guardado en escritorio. Usan exclusivamente datos de prueba, no son capturas de proyectos reales ni evidencia de producción.

## Publicación

No se desplegó ni se modificaron datos de un entorno conectado. La firma de `partida.update` cambia respecto al formulario anterior: publicar backend y frontend de forma coordinada. No se debe servir este frontend contra un backend que aún no tenga las consultas y el contrato nuevos.
