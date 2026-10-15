# Indirectos automáticos

## Configuración por proyecto

Después de importar el presupuesto, Editar proyecto permite activar Honorarios, Indirectos, General Conditions y Viáticos seleccionando su partida de nivel 1.

**Porcentaje = monto original del concepto / (presupuesto aprobado total del proyecto − aprobado de las partidas excluidas) × 100.** Cada concepto selecciona sus propias exclusiones de nivel 1. Las familias y subpartidas están incluidas en los importes de sus padres y no se suman otra vez. Se muestra el aprobado total, el aprobado excluido y la base neta.

Las exclusiones restan importes aprobados del denominador. El numerador sigue siendo el original del concepto, incluso si su partida se excluye de la base. Se valida que cada exclusión pertenezca al mismo proyecto y sea de nivel 1; los duplicados solo cuentan una vez y la base neta debe ser mayor que cero.

Guardar conserva una revisión Actual → Propuesto → Diferencia de Presupuesto y P&L. Cambiar el aprobado después del guardado actualiza las tasas y cargos automáticamente. No se requiere un botón de recalcular ni otra aprobación de la tasa. La edición de presupuesto conserva su revisión de impacto y revalida el cambio al guardar.

Cambiar solo las exclusiones también requiere revisar y guardar el impacto. Cambiar el aprobado de una partida excluida conserva la base neta y la tasa; cambiar el aprobado de una incluida actualiza ambos. Una partida usada como exclusión debe retirarse de la configuración antes de eliminarla.

## Cargos y desglose

**Indirectos, Viáticos y General Conditions configurados usan todas las líneas de pagos con estado Pagado del acumulado completo del proyecto**, incluyendo las anteriores al 1 de octubre de 2026. Honorarios conserva su fecha de inicio y su tratamiento anterior. El porcentaje global anterior de Indirectos conserva su corte; este cambio corresponde al concepto seleccionado desde presupuesto.

Cada cargo es base pagada × porcentaje vigente. Se incluyen los importes registrados en honorarios, viáticos y partidas excluidas del presupuesto. Los cargos automáticos no vuelven a integrar la base como nuevos pagos. Las consultas por fechas y los meses de P&L solo incluyen los pagos del periodo solicitado, sin trasladar todo el acumulado a octubre.

Las exclusiones anteriores se aplican al presupuesto usado para obtener la tasa. Los pagos de esas partidas siguen generando cargos con la tasa resultante.

Cada cargo se reparte según el monto original de las familias y subpartidas. Los porcentajes de los hijos suman el porcentaje del padre; los cargos de las hojas suman el total de la partida, con reparto determinista de centavos. Presupuesto muestra el desglose y Control usa los mismos totales. Pagado y por gastar de la jerarquía se actualizan con cambios de pagos y de presupuesto.

Los montos originales de los hijos determinan su participación dentro del padre. Si la rama tiene hijos pero todos sus montos originales son cero y el concepto es positivo, se solicita corregir esos importes antes de distribuirlo.

Los pagos manuales de las partidas activadas se sustituyen en los totales dentro del alcance del concepto; sus documentos y registros permanecen consultables y sus importes registrados forman parte de la base común. Los conceptos sin activar conservan sus pagos manuales. Activar un concepto indirecto independiente reemplaza el porcentaje global anterior dentro de su alcance.

La columna **Avance** de Presupuesto muestra pagado visible / aprobado × 100 en cada partida, familia y subpartida; usa los mismos importes que se muestran en Pagado, incluidos los filtros. La tasa del concepto se consulta en su configuración. Los porcentajes visibles tienen dos decimales; el cálculo de cargos conserva la precisión completa de las tasas.

## Costos reales y P&L

Registrar los gastos reales mediante captura manual o Excel en P&L → Cargar movimientos, con tipo **Costo estructura** y categoría **INDIRECTOS**. La obra es opcional: sin obra afecta el consolidado de OGC; con obra afecta también su rentabilidad.

Los cargos de Indirectos, General Conditions y Viáticos se agrupan como ingreso de indirectos; Honorarios se presenta por separado. Saldo de indirectos muestra ingreso menos costos reales y el componente de costo histórico, si el periodo lo incluye. Cada costo se cuenta una sola vez.

Presupuesto usa la moneda de la obra; P&L usa MXN y su conversión existente. Los cargos se redondean a centavos por pago y se distribuyen sin perder centavos. El cálculo no crea transferencias bancarias ni facturas.

## Compatibilidad y revisión

El corte del 1 de octubre de 2026 se conserva para Honorarios y los esquemas anteriores de Indirectos. Indirectos, Viáticos y General Conditions configurados recalculan también el ejercido previo del proyecto. Las obras sin esos conceptos configurados mantienen sus porcentajes manuales y exclusiones anteriores, disponibles en Configuración anterior y periodos históricos. Una tasa configurada al 0% sigue activa y puede sustituir manuales sin generar cargo.

En Torre I se confirmó que Indirectos solo reconocía $103,401.40 desde octubre y generaba $3,898.80. El acumulado válido de pagos es $69,713,424.90; con la tasa vigente de 3.770545138454147% genera $2,628,576.33, con redondeo por pago. General Conditions tenía original $0 en el padre y $1,128,509.82 en su familia. Con autorización del usuario se corrigió el original del padre a $1,128,509.82 mediante edición revisada de presupuesto, conservando el aprobado. Se verificaron la tasa de 1.3499159979628834% y el cargo acumulado de $941,073.23. Los montos en cero continúan siendo válidos y no se sustituyen automáticamente por aprobados ni por sumas de hijos; el editor explica que producen cargo cero.

El filtro mensual de P&L solo cambia la revisión; guardar aplica a todo el proyecto. Cambios externos en datos financieros invalidan una revisión abierta y exigen actualizarla antes de guardar. Cancelar no escribe.

La revisión completa admite hasta 8,000 registros, 3,500 transacciones y 8 MiB de datos fuente. El comprobante usa SHA-256 de todos los datos financieros canónicos, por lo que no transmite los registros ni rechaza proyectos cuyo alcance supere 512 KiB. El guardado revalida y reutiliza una sola lectura del historial para actualizar configuración, jerarquía y métricas en la misma transacción; evita las relecturas completas por cada partida actualizada. Si falla la revisión, el modal muestra la causa y el botón Reintentar cálculo junto a Guardar Cambios.

El diagnóstico autorizado de solo lectura del 15 de octubre confirmó el bloqueo en Larena - Torre I: 811 partidas, 645 transacciones y 1,716 conceptos de pago, 3,172 registros antes de contar movimientos OGC. La vista previa desplegada de Honorarios devuelve el error de capacidad del límite anterior de 2,500 registros. El diagnóstico no guardó configuraciones ni desplegó código.

Backend y schema desplegados el 14 de octubre de 2026 en `dev:animated-walrus-612`. Los cambios de frontend se incluyen en `main`; su publicación depende del hosting configurado para esa rama. El despliegue no activa conceptos ni migra proyectos. Queda pendiente conciliar los resultados contra el aprobado vigente de los Excel reales; las tasas de referencia de la reunión no son valores prefijados.

Para esta corrección se reconstruyeron los totales derivados del proyecto afectado y se verificó que una segunda reconstrucción no produjera cambios. Los registros fuente de pagos y el total de Honorarios se conservaron.

## Pruebas

- test:project-fees: fórmula sobre aprobado menos exclusiones independientes por concepto, acumulado histórico de Viáticos y General Conditions sobre $6.5 millones, fechas filtradas, Honorarios sin cambios, manuales históricos sustituidos una vez, selecciones inválidas o duplicadas, autorrecálculo, cinco subpartidas, corte, monedas, revisión y concurrencia.
- test:indirectos-ui: avance de pagado sobre aprobado, tasas y porcentajes con dos decimales, búsqueda y selección de exclusiones, base neta visible, rechazo de base cero, revisión y persistencia de cambios solo en exclusiones, porcentaje actualizado sin guardar otra vez, desglose de cinco hojas, revisión y guardado a 390 y 1440 px. Usa datos sintéticos sin conexión a Convex y genera capturas en output/indirectos-ui.
- Pruebas relacionadas de P&L, Presupuesto, jerarquía, edición de pagos, edición/eliminación de partidas y clasificación OGC; TypeScript, lint y build.

Validación de la corrección de guardado del 15 de octubre de 2026: 279 pruebas aprobadas, 1 omitida; TypeScript de frontend y Convex, ESLint, build y pruebas del modal a 390 y 1440 px aprobados. Incluye proyectos de más de 2,500 registros, alcances superiores a 512 KiB, 1,600 transacciones sin relecturas al guardar, límites de capacidad y rechazo de cambios concurrentes aun cuando sus importes se compensen. Esta corrección está validada localmente; no se ha desplegado.

La corrección del timeout de `desarrollos:previewFeeImpact` evita repartir cada pago entre las hojas cuando solo se necesitan totales. La jerarquía se sigue validando completa, incluso sin pagos. Para consultas y guardados con desglose, prepara familias, hijos, pesos y orden una sola vez por concepto; conserva el redondeo y el reparto de centavos de cada pago. Los cargos idénticos en centavos reutilizan su reparto multiplicando por el número de pagos, sin repartir el importe acumulado. Las búsquedas de partidas de origen y conceptos activos también se reutilizan.

La regresión incluye una revisión y guardado de 3,000 pagos con 80 familias y 800 hojas, comparación de totales con y sin desglose, sustituciones manuales, fechas, monedas y jerarquías inválidas. Una comparación local contra la versión anterior con 100 pagos y 883 partidas redujo el cálculo de conceptos de aproximadamente 2,900 ms a 8 ms con desglose y 4 ms solo con totales; los importes y las asignaciones del desglose fueron idénticos. Con 3,000 pagos, el cálculo corregido tardó aproximadamente 11 ms tanto con desglose como solo con totales. Estos tiempos corresponden al cálculo en memoria, no a una medición del despliegue de Convex. Validación final: 285 pruebas aprobadas, 1 omitida; TypeScript de frontend y Convex, ESLint de los archivos modificados y build aprobados. No se ejecutó un despliegue para esta corrección.

El plan complementado está en docs/plan-conceptos-porcentuales.md.

### Verificación de Torre I del 15 de octubre de 2026

Se publicó la versión 4 del cálculo en `dev:animated-walrus-612`, junto con las optimizaciones del mismo cálculo descritas arriba. La consulta desplegada confirmó Indirectos por $2,628,576.33 y General Conditions por $941,073.23, ambos sobre $69,713,424.90 de pagos válidos. La revisión financiera devuelve `ready` con 656 transacciones y 1,752 conceptos de pago; se conserva una transacción con fecha inválida fuera de los cargos automáticos. Honorarios permanece en $11,155,347.39. La simulación posterior de reconstrucción devolvió cero partidas pendientes y métricas coincidentes, por lo que no se ejecutó una reconstrucción adicional.

Validación de esta corrección: 286 pruebas aprobadas y una omitida, TypeScript de frontend y Convex, ESLint, build y modal a 390 y 1440 px. El texto y aviso de original cero del editor están preparados en el frontend local; su publicación sigue el despliegue del hosting.
