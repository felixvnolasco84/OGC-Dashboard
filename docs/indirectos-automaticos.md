# Indirectos automáticos

## Configuración por proyecto

Después de importar el presupuesto, Editar proyecto permite activar Honorarios, Indirectos, General Conditions y Viáticos seleccionando su partida de nivel 1.

**Porcentaje = monto original del concepto / presupuesto aprobado total del proyecto × 100.** Todas las partidas de nivel 1 integran el aprobado total. Las familias y subpartidas no se suman otra vez. No existen exclusiones para estos conceptos.

Guardar conserva una revisión Actual → Propuesto → Diferencia de Presupuesto y P&L. Cambiar el aprobado después del guardado actualiza las tasas y cargos automáticamente. No se requiere un botón de recalcular ni otra aprobación de la tasa. La edición de presupuesto conserva su revisión de impacto y revalida el cambio al guardar.

## Cargos y desglose

Los conceptos configurados usan todas las líneas de pagos con estado Pagado desde **2026-10-01**, incluyendo honorarios, viáticos y partidas antes excluidas. Cada cargo es base pagada × porcentaje vigente. Los cargos automáticos no vuelven a integrar la base como nuevos pagos.

Cada cargo se reparte según el monto original de las familias y subpartidas. Los porcentajes de los hijos suman el porcentaje del padre; los cargos de las hojas suman el total de la partida, con reparto determinista de centavos. Presupuesto muestra el desglose y Control usa los mismos totales. Pagado y por gastar de la jerarquía se actualizan con cambios de pagos y de presupuesto.

Los montos originales de los hijos determinan su participación dentro del padre. Si la rama tiene hijos pero todos sus montos originales son cero y el concepto es positivo, se solicita corregir esos importes antes de distribuirlo.

Los pagos manuales de las partidas activadas se sustituyen en los totales; sus documentos y registros permanecen consultables y sus importes registrados forman parte de la base común. Los conceptos sin activar conservan sus pagos manuales. Activar un concepto indirecto independiente reemplaza el porcentaje global anterior desde el corte.

## Costos reales y P&L

Registrar los gastos reales mediante captura manual o Excel en P&L → Cargar movimientos, con tipo **Costo estructura** y categoría **INDIRECTOS**. La obra es opcional: sin obra afecta el consolidado de OGC; con obra afecta también su rentabilidad.

Los cargos de Indirectos, General Conditions y Viáticos se agrupan como ingreso de indirectos; Honorarios se presenta por separado. Saldo de indirectos muestra ingreso menos costos reales y el componente de costo histórico, si el periodo lo incluye. Cada costo se cuenta una sola vez.

Presupuesto usa la moneda de la obra; P&L usa MXN y su conversión existente. Los cargos se redondean a centavos por pago y se distribuyen sin perder centavos. El cálculo no crea transferencias bancarias ni facturas.

## Compatibilidad y revisión

El corte se mantiene en el 1 de octubre de 2026. Los periodos anteriores conservan su tratamiento histórico. Las obras sin conceptos configurados mantienen sus porcentajes manuales y exclusiones anteriores, disponibles en Configuración anterior y periodos históricos. Una tasa configurada al 0% sigue activa y puede sustituir manuales sin generar cargo.

El filtro mensual de P&L solo cambia la revisión; guardar aplica a todo el proyecto. Cambios externos en datos financieros invalidan una revisión abierta y exigen actualizarla antes de guardar. Cancelar no escribe. La revisión completa mantiene los límites de 2,500 registros y 512 KiB de alcance canónico.

Backend y schema desplegados el 14 de octubre de 2026 en `dev:animated-walrus-612`. Los cambios de frontend se incluyen en `main`; su publicación depende del hosting configurado para esa rama. El despliegue no activa conceptos ni migra proyectos. Queda pendiente conciliar los resultados contra el aprobado vigente de los Excel reales; las tasas de referencia de la reunión no son valores prefijados.

## Pruebas

- test:project-fees: fórmula sobre aprobado completo, ausencia de exclusiones, autorrecalculo, cinco subpartidas, pagos insertados/editados/eliminados, corte, monedas, revisión y concurrencia.
- test:indirectos-ui: configuración sin exclusiones, porcentaje actualizado sin guardar otra vez, desglose de cinco hojas, revisión y guardado a 390 y 1440 px. Usa datos sintéticos sin conexión a Convex y genera capturas en output/indirectos-ui.
- Pruebas relacionadas de P&L, Presupuesto, jerarquía, edición de pagos, edición/eliminación de partidas y clasificación OGC; TypeScript, lint y build.

Validación final: 258 pruebas aprobadas, 2 omitidas; TypeScript, ESLint, build y pruebas visuales aprobados.

El plan complementado está en docs/plan-conceptos-porcentuales.md.
