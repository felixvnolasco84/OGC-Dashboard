# Conceptos porcentuales: ajustes de configuración y desglose

## Reglas vigentes

- Cada proyecto configura Honorarios, Indirectos, General Conditions y Viáticos seleccionando su partida de origen.
- Porcentaje = monto original del concepto / presupuesto aprobado total del proyecto × 100. El total aprobado suma únicamente partidas de nivel 1, incluyendo todos los conceptos; no suma nuevamente familias y subpartidas.
- Las exclusiones no intervienen en la nueva configuración ni en los cargos. Las exclusiones guardadas de versiones anteriores se ignoran para estos conceptos y se conserva la configuración histórica anterior.
- Al cambiar el aprobado, sus rollups o el monto original del concepto, se recalculan automáticamente la tasa, los cargos, los importes pagados/por gastar de la jerarquía y las métricas. Las consultas también derivan las tasas con el presupuesto vigente.
- El guardado de configuración conserva la revisión Actual → Propuesto → Diferencia y el control de concurrencia. No requiere una aprobación posterior para recalcular las tasas ante cambios de presupuesto.
- Los cargos se aplican a todas las líneas de pagos Pagado desde el 1 de octubre de 2026, incluso las partidas que antes se excluían. Los cargos generados no son pagos nuevos y no se añaden otra vez a la base; ya no hay dependencias entre conceptos.
- Los pagos manuales de los conceptos activados se sustituyen en sus totales, sin borrar sus registros. Sus importes registrados sí integran la base común de pagos. Los conceptos no configurados conservan su tratamiento anterior.
- Configurar un concepto indirecto independiente reemplaza el porcentaje global de indirectos desde el corte. Honorarios configurado reemplaza su configuración anterior desde el mismo corte. Periodos anteriores y proyectos sin configurar mantienen sus reglas.

## Familias y subpartidas

- El cargo de cada concepto se distribuye entre sus hijos según la proporción de sus montos originales; cada familia vuelve a distribuir su parte entre sus subpartidas.
- El porcentaje de cada hijo es el porcentaje del padre multiplicado por su participación en el monto original de sus hermanos. Cuando los originales de hijos y padre coinciden, equivale a original del hijo / aprobado total del proyecto × 100.
- Los centavos residuales se asignan de forma determinista para que el padre sea exactamente la suma de sus hijos. Solo las filas terminales reciben cargos directos; los padres se calculan mediante rollup.
- Una rama con un cargo positivo necesita montos originales válidos en su desglose. Un desglose completo en cero requiere corregir el presupuesto antes de distribuir el cargo.
- Presupuesto y Control comparten el mismo cálculo. La jerarquía guarda los cargos y el pagado/por gastar de cada nivel; la consulta por fechas entrega las asignaciones a las hojas y los porcentajes por fila.

## P&L

- Honorarios se presenta por separado. Indirectos agrupa Indirectos, General Conditions y Viáticos.
- Los gastos reales se registran como Costo estructura / INDIRECTOS en movimientos OGC. Sin obra afectan el consolidado; con obra afectan también su rentabilidad.
- Saldo de indirectos = ingresos de indirectos − costos reales − componente de costo histórico, si el periodo incluye historia anterior al corte.
- No se crean cobros bancarios ni facturas automáticamente.

## Validación y publicación

Pruebas de base aprobada completa, exclusiones ignoradas, autorrecalculo por cambios en raíz y hoja, cinco subpartidas, centavos, revisión/guardado, pagos insertados/editados/eliminados, monedas y corte histórico. Las pruebas de UI usan datos sintéticos y generan capturas en output/indirectos-ui.

Backend y schema desplegados el 14 de octubre de 2026 en `dev:animated-walrus-612`. Los cambios de frontend se incluyen en `main`; su publicación depende del hosting configurado para esa rama. La validación final pasó 258 pruebas (2 omitidas), TypeScript, ESLint, build y pruebas visuales a 390 y 1440 px.

No se activaron conceptos ni se migraron proyectos como parte del despliegue. Queda pendiente conciliar los importes con los presupuestos aprobados reales; los porcentajes de referencia de la reunión pueden cambiar con esta nueva fórmula.
