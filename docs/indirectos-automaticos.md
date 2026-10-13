# Indirectos automáticos

## Uso

- Crear o editar una obra y capturar **Indirectos (%)**, independiente de honorarios.
- Dejar vacío un proyecto sin activar conserva su cálculo anterior. Una vez activado, **0%** mantiene el esquema automático sin generar cargo.
- El inicio es **2026-10-01**. Cambiar el porcentaje recalcula desde esa fecha; septiembre y fechas anteriores mantienen la lógica histórica.
- En P&L → **Cargar movimientos** → captura manual o Excel, registrar el gasto real con tipo **Costo estructura** y categoría **INDIRECTOS**. La obra es opcional: sin obra afecta solamente el consolidado; con obra también afecta su rentabilidad.
- **Saldo de indirectos** muestra el ingreso de indirectos menos sus costos reales y el componente histórico de costo. Un saldo negativo indica que el gasto excede el cargo.

## Cálculo y compatibilidad

- El porcentaje se aplica a pagos de transacciones **Pagado**, en su fecha, usando las mismas exclusiones de partidas que honorarios en P&L. Los pagos de Honorarios no integran la base.
- Se redondea el cargo a centavos por pago. P&L utiliza MXN y su conversión existente; el presupuesto utiliza la moneda principal de la obra.
- Presupuesto y Control incluyen el cargo automático una sola vez, incluso sin una partida manual de indirectos. Los importes de partidas manuales posteriores al inicio son sustituidos en los totales; sus documentos y movimientos permanecen consultables.
- Los ingresos manuales OGC de indirectos de una obra activada posteriores al inicio no se suman nuevamente al P&L. Su registro bancario sigue disponible en el ledger y en cobrado.
- Los movimientos reales de indirectos forman parte de costos OGC; su fila de detalle y saldo no agregan un segundo gasto.
- Las obras sin porcentaje configurado no requieren migración. No se borran ni trasladan registros históricos, ni se activan porcentajes en producción desde las pruebas.

## Validación

- Editar proyecto muestra una revisión **Actual → Propuesto → Diferencia** al cambiar porcentajes, modo o exclusiones. Presupuesto y P&L tienen bloques separados con moneda, periodo y bases. El filtro mensual de P&L solo cambia la revisión; guardar aplica a todo el proyecto.
- La revisión incluye manuales sustituidos y el efecto sobre gasto total, por gastar, saldo de indirectos y EBITDA. Activar al 0% también puede sustituir manuales, sin borrar registros.
- Solo se envían campos editados. Los cambios externos no sobrescriben el borrador. Si cambian los datos financieros, se debe revisar la actualización; el backend vuelve a comprobar el alcance y los permisos antes de guardar.
- La simulación usa únicamente consultas. Cancelar no escribe y el guardado usa una sola mutación con los triggers existentes. Creación e importación de Excel quedan fuera de esta revisión.
- `npm run test:project-fees`: cálculo anterior/nuevo, coincidencia con el guardado mediante los triggers sobre una base sintética, exclusiones, modos, fechas, monedas, signos, redondeo, permisos, errores y concurrencia. La prueba de rollback modela el contrato transaccional de Convex en una base de prueba; no se ejecuta contra producción.
- La revisión completa está limitada a 2,500 registros combinados de partidas, transacciones, conceptos y movimientos del proyecto, y a 512 KiB de alcance canónico. Si se excede, se bloquea el guardado financiero sin presentar una muestra parcial. Se conserva la lectura por transacción para conceptos históricos sin `proyecto_id`.

- `npm run test:pnl`: incluye corte histórico, porcentaje cero, exclusiones, monedas, gastos corporativos, cambios de pagos y sustitución de indirectos en obra/WIP.
- `npm run test:indirectos-ui`: revisión del impacto, filtro mensual, cambios concurrentes, conflictos de campos, fallos, cancelación, guardado único y accesibilidad del formulario a 390 y 1440 px, además de cargo en presupuesto y saldo P&L. Usa datos sintéticos y stubs sin conexión a Convex; genera capturas en `output/indirectos-ui`.
- Pruebas relacionadas de presupuesto, jerarquía de pagos y clasificación OGC; TypeScript, lint de archivos modificados y build.

Para usarlo en el sistema publicado se deben desplegar conjuntamente el schema/backend de Convex y el frontend. Después, configurar el porcentaje deseado en cada obra.
