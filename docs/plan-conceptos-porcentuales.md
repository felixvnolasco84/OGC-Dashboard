# Conceptos porcentuales: ajustes de configuración y desglose

## Reglas vigentes

- Cada proyecto configura Honorarios, Indirectos, General Conditions y Viáticos seleccionando su partida de origen.
- Porcentaje = monto original del concepto / (presupuesto aprobado total del proyecto − aprobado de las partidas excluidas del concepto) × 100. El total y las exclusiones suman únicamente partidas de nivel 1; no suman nuevamente familias y subpartidas. El numerador conserva el monto original, aunque la propia partida del concepto se excluya del denominador.
- Cada concepto conserva su selección de exclusiones. La configuración permite buscarlas por nombre y muestra aprobado total, aprobado excluido, base neta y porcentaje. Las exclusiones se validan como partidas de nivel 1 del mismo proyecto, se deduplican y no pueden dejar una base neta menor o igual a cero. Las exclusiones históricas compartidas conservan su configuración anterior.
- Las exclusiones se restan de la base presupuestal del porcentaje; los cargos siguen aplicándose a todos los pagos Pagado, incluso los de partidas excluidas. No se resta de la base un importe original ni un pago real.
- Al cambiar el aprobado, sus rollups o el monto original del concepto, se recalculan automáticamente la tasa, los cargos, los importes pagados/por gastar de la jerarquía y las métricas. Cambiar el aprobado de una partida excluida cambia por igual el total y la exclusión, conservando la base neta y la tasa. Las consultas también derivan las tasas con el presupuesto vigente.
- El guardado de configuración conserva la revisión Actual → Propuesto → Diferencia y el control de concurrencia. No requiere una aprobación posterior para recalcular las tasas ante cambios de presupuesto.
- Cambiar solo las exclusiones de un concepto genera una nueva revisión financiera y se persiste al guardar. Eliminar una partida sin dependencias retira sus referencias de las exclusiones del proyecto dentro de la misma transacción, con revisión de los totales antes y después. Las partidas que siguen siendo origen de un concepto automático requieren cambiar esa configuración primero.
- Las revisiones de configuración, pagos y presupuesto hechas antes de publicar esta fórmula se invalidan y deben actualizarse antes de guardar.
- Honorarios, Indirectos, Viáticos y General Conditions configurados aplican sus tasas vigentes a todas las líneas de pagos válidos Pagado del historial completo del proyecto, sin fecha de inicio. El porcentaje general de Indirectos tampoco tiene corte. Se ignoran fechas de inicio antiguas y no se crean en nuevas configuraciones. Honorarios configurado no suma el porcentaje anterior a los cargos históricos. Los cargos generados no son pagos nuevos y no se añaden otra vez a la base; no hay dependencias entre conceptos.
- Los pagos manuales de los conceptos activados se sustituyen en sus totales, sin borrar sus registros. Sus importes registrados sí integran la base común de pagos. Los conceptos no configurados conservan su tratamiento anterior.
- Configurar un concepto indirecto independiente reemplaza el porcentaje global de indirectos dentro de su alcance. Honorarios configurado reemplaza su porcentaje anterior para todo el historial válido. Los proyectos sin configurar mantienen sus modos y tasas generales.
- Los porcentajes visibles tienen dos decimales; las tasas internas conservan su precisión completa. Avance en Presupuesto significa pagado visible / aprobado × 100 para cada nivel, usando los importes visibles de la consulta y sus filtros. Las tasas se muestran en configuración y revisión de impacto.

## Familias y subpartidas

- El cargo de cada concepto se distribuye entre sus hijos según la proporción de sus montos originales; cada familia vuelve a distribuir su parte entre sus subpartidas.
- El porcentaje de cada hijo es el porcentaje del padre multiplicado por su participación en el monto original de sus hermanos. Cuando los originales de hijos y padre coinciden, equivale a original del hijo / base aprobada después de exclusiones del concepto × 100.
- Los centavos residuales se asignan de forma determinista para que el padre sea exactamente la suma de sus hijos. Solo las filas terminales reciben cargos directos; los padres se calculan mediante rollup.
- Una rama con un cargo positivo necesita montos originales válidos en su desglose. Un desglose completo en cero requiere corregir el presupuesto antes de distribuir el cargo.
- Presupuesto y Control comparten el mismo cálculo. La jerarquía guarda los cargos y el pagado/por gastar de cada nivel; la consulta por fechas entrega las asignaciones a las hojas y los porcentajes por fila.

## P&L

- Honorarios se presenta por separado. Indirectos agrupa Indirectos, General Conditions y Viáticos.
- Los gastos reales se registran como Costo estructura / INDIRECTOS en movimientos OGC. Sin obra afectan el consolidado; con obra afectan también su rentabilidad.
- Saldo de indirectos = ingresos de indirectos − costos reales − componente de costo histórico, si el periodo incluye historia anterior al corte.
- No se crean cobros bancarios ni facturas automáticamente.

## Validación y publicación

Pruebas de base aprobada menos exclusiones, acumulado histórico de los cuatro conceptos, Honorarios con tasa vigente sin mezclar porcentajes anteriores, periodos filtrados, sustitución de manuales históricos una vez, selecciones independientes, duplicados y exclusiones inválidas, guardado de cambios solo en exclusiones, autorrecálculo, cinco subpartidas, centavos, revisión/guardado y monedas. Las pruebas de UI verifican avance y dos decimales con datos sintéticos y generan capturas en output/indirectos-ui.

Backend y schema desplegados el 14 de octubre de 2026 en `dev:animated-walrus-612`. Los cambios de frontend se incluyen en `main`; su publicación depende del hosting configurado para esa rama. La corrección de acumulado y avance pasó 269 pruebas (2 omitidas), TypeScript, ESLint, build y pruebas visuales a 390 y 1440 px.

No se activaron conceptos ni se migraron proyectos como parte del despliegue. Queda pendiente conciliar los importes con los presupuestos aprobados reales; los porcentajes de referencia de la reunión pueden cambiar con esta nueva fórmula.

La corrección del acumulado incluye la reconstrucción de los totales derivados del proyecto afectado. Se verificó que no quedaran diferencias pendientes en una segunda simulación y que se conservaran los registros fuente de pagos y el total de Honorarios.

El 15 de octubre de 2026 se publicó la versión 5 sin fechas de inicio para los cuatro conceptos ni el porcentaje general de Indirectos. Con autorización se revisaron las 11 obras y se actualizaron los derivados de Torre I y Lote 77, retirando seis fechas antiguas. Honorarios quedó en $10,916,442.77 y $1,011,745.06, respectivamente. Las huellas de presupuestos y pagos fuente permanecieron iguales; la segunda reconstrucción no encontró cambios pendientes y ambas revisiones desplegadas devolvieron `ready`. Validación: 301 pruebas aprobadas y una omitida, TypeScript, ESLint, build y UI a 390 y 1440 px. El detalle de cargos y comprobaciones está en `docs/indirectos-automaticos.md`.

## Ejemplo de la fórmula corregida

Honorarios originales de $30,000, presupuesto aprobado total de $255,600 y partidas excluidas con aprobado de $55,600: base neta de $200,000 y porcentaje de 15%. Con $100,000 pagados elegibles por fecha y estado, el cargo es $15,000. Si una partida incluida aumenta el aprobado en $200,000, la base neta pasa a $400,000 y la tasa a 7.5%, sin volver a guardar la configuración.
