# Reporte de cambios de lógica — P&L OGC

Fecha de implementación: 22 de julio de 2026

## Alcance

Se adaptaron al repositorio actual cinco cambios del sistema espejo:

1. Cálculo mensual automático de ingresos OGC.
2. Origen exclusivo de costos de estructura desde movimientos OGC.
3. Cálculo acumulado de saldo y runway en Work in Progress.
4. Nueva definición de rentabilidad OGC por obra.
5. Resumen acumulado del P&L mensual.

La lógica principal vive en `convex/desarrollos.ts` y las aclaraciones visibles al usuario en `src/pages/ProfitAndLoss/ProfitAndLossPage.tsx`.

## 1. Ingresos OGC

### Honorarios

- Para cada obra con `honorarios_porcentaje > 0`, los honorarios se calculan sobre cada pago real asociado a una transacción con estado `Pagado`.
- Fórmula por pago: `honorarios = monto del pago en MXN × honorarios_porcentaje / 100`.
- El honorario se reconoce en el mismo mes de la fecha de la transacción; no se prorratea linealmente.
- Los pagos de partidas de Honorarios no forman parte de la base y tampoco se suman de nuevo cuando existe un porcentaje configurado, evitando doble conteo.
- Las partidas configuradas en `excluded_partidas_honorarios` se excluyen de la base. También se propaga la exclusión a partidas con el mismo nombre para conservar el comportamiento del presupuesto.
- Si una obra no tiene porcentaje configurado, se mantiene la compatibilidad anterior: se toman los pagos explícitos de partidas identificadas como Honorarios.
- `DISP HONORARIOS` o `DISPERSIÓN HONORARIOS` no se confunde con el ingreso de Honorarios; continúa como costo de obra salvo que la partida esté excluida por configuración.

### Indirectos

Se reconocen como ingresos indirectos los pagos cuyas partidas, familias o subpartidas contienen alguno de estos conceptos:

- Indirectos / Indirecto.
- General Conditions / General Condition.
- Condiciones Generales / Condición General.
- Viáticos / Viático.

Cada importe se asigna al mes de la fecha del pago.

### Fechas y moneda

- Se aceptan fechas `YYYY-MM-DD`, `DD/MM/YYYY` y `DD-MM-YYYY`, validando que el día y mes existan.
- Los importes USD y EUR se convierten a MXN usando el tipo de cambio de la transacción cuando existe; en caso contrario se usan los tipos enviados a la consulta.

## 2. Costos de estructura OGC

- Los costos de estructura ya no se infieren de pagos de obra con etiquetas como nómina, transporte, renta o impuestos.
- Su única fuente son movimientos activos de `ogc_movimientos` clasificados como costo.
- Si no hay movimientos OGC capturados para estructura, el importe mostrado es cero.
- Cada movimiento se distribuye al mes de su fecha capturada.
- Los pagos de obra que antes podían reclasificarse como estructura permanecen en costos directos de la obra; no se eliminan.
- Un movimiento OGC vinculado a una obra afecta sus costos y rentabilidad. Un movimiento corporativo sin obra afecta los costos, margen y EBITDA consolidados.

## 3. Work in Progress: saldo y runway

### Fuentes

- Presupuesto aprobado y costo real: `meticas_presupuesto` de cada obra.
- Cobrado: registros de `ingresos` de la obra.
- Egresos para el ritmo de consumo: transacciones de la obra con estado `Pagado`.

### Corte acumulado

El cobrado y los egresos consideran todo el historial con fecha menor o igual al fin del mes de corte. Así se comparan valores acumulados equivalentes, aunque el P&L mensual siga limitado al año seleccionado.

### Fórmulas

- `saldo = cobrado acumulado - costo real`.
- `promedio mensual de egresos = total de egresos pagados / número de meses que tuvieron egresos`.
- `ritmo semanal = promedio mensual × 12 / 52`.
- `runway en semanas = saldo positivo / ritmo semanal`.
- Si el saldo no es positivo o no existen egresos pagados, el runway es cero.

Los egresos se convierten a MXN antes de calcular el promedio para evitar mezclar monedas.

### Totales

Los totales WIP solo incluyen obras no canceladas, consistente con la tabla de obras activas.

## 4. Project Profitability

### Ingresos OGC por obra

- `ingresos OGC = honorarios + indirectos / viáticos / general conditions`.
- Solo se consideran ingresos vinculados a la obra correspondiente.

### Costos OGC por obra

- `costos OGC = indirectos / viáticos / general conditions + costos administrativos OGC asignados a la obra`.
- El mismo importe de indirectos aparece como ingreso y costo para mostrar la varianza operativa solicitada.
- Los costos administrativos solo se incluyen cuando el movimiento OGC tiene vínculo explícito con la obra.
- Los costos directos de construcción quedan fuera de Project Profitability y permanecen en WIP.
- Los movimientos corporativos sin obra no afectan los totales ni el margen de Project Profitability; sí permanecen en el P&L corporativo consolidado.

### Margen

- `margen por obra = ingresos OGC - costos OGC`.
- La misma definición se usa en el acumulado, el mes actual y sus porcentajes.

## 5. Resumen acumulado anual

- Al final de P&L Mensual se muestran las tablas de `Costo estructura OGC` y `EBITDA OGC`.
- Los importes usan el año y mes de corte seleccionados; por ejemplo, un corte en junio representa enero-junio del año elegido.
- La tabla de estructura incluye el desglose por categoría, total y porcentaje sobre ingresos OGC.
- La tabla EBITDA incluye Honorarios, Indirectos, Ingresos OGC, Estructura + Indirectos, EBITDA y margen EBITDA.
- El resumen consume los mismos totales del P&L mensual, incluyendo movimientos corporativos sin obra.

## 6. Impacto en presentación

- La tabla mensual explica que Honorarios se calculan por porcentaje y que Indirectos, Viáticos y General Conditions siguen la fecha del pago.
- La sección WIP muestra las fórmulas de saldo y runway.
- La sección de estructura aclara que solo usa movimientos OGC cargados y fechados.
- Se retiró el mensaje de sustitución parcial de estructura legacy porque ya no existe mezcla entre pagos de obra y estructura OGC.
- Los encabezados de Project Profitability explican la composición de Ingresos OGC y Costos OGC.
- El resumen acumulado aparece inmediatamente debajo de la tabla mensual.

## 7. Validación realizada

- ESLint sobre los dos archivos modificados: sin errores.
- TypeScript y build de producción (`npm run build`): completados correctamente.
- Revisión de referencias obsoletas y consistencia del diff: sin referencias legacy pendientes.
