# Auditoría de métricas de presupuesto — todos los proyectos

Consulta directa de Convex: 2/10/2026, 12:12:47–2/10/2026, 12:13:18, America/Mexico_City. Despliegue: `animated-walrus-612`, tipo `dev` (desarrollo), configurado en `.env.local`. No se consultó producción ni se modificó la base de datos.

Se leyeron completas las cinco tablas necesarias: 11 desarrollos, 11,581 partidas, 5,502 transacciones, 11,176 pagos, 11 meticas_presupuesto. Dos lecturas consecutivas coincidieron en todos los campos seleccionados y en sus IDs. Se consultó además `meticas_presupuesto:getByProyecto` para cada uno de los 11 proyectos.

El gasto esperado aquí es la suma de pagado de las partidas de nivel 1, sustituyendo la partida HONORARIOS por honorarios_monto del proyecto una sola vez, tal como lo muestra la tabla de presupuesto. Se recalcularon por separado los honorarios desde todas las transacciones y sus conceptos, con el modo y las exclusiones actuales del presupuesto. También se contrastó cada partida de nivel 1 contra sus pagos de transacciones Pagado.

Resultado: 5 proyectos con gasto_total desactualizado; 5 con al menos una métrica desactualizada; 0 con honorarios_monto desactualizado; 4 con diferencias entre pagado de partidas y sus conceptos. No hay proyectos sin métrica o con métricas duplicadas.

| Proyecto | Gasto guardado | Suma actual de partidas con honorarios | Diferencia frente a partidas | Campos distintos |
|---|---:|---:|---:|---|
| Sunrise | $35,043,233.60 | $35,043,642.66 | +$409.06 | gasto_total, por_gastar |
| Larena - Torre I | $83,419,867.77 | $83,419,867.77 | $0.00 | Coincide |
| Larena - Torre H | $81,899,567.97 | $81,773,050.26 | -$126,517.71 | gasto_total, por_gastar |
| Larena - Torre G | $60,794,420.41 | $60,794,420.41 | $0.00 | Coincide |
| Larena - Torre J | $23,479,059.53 | $23,542,852.47 | +$63,792.94 | gasto_total, por_gastar |
| Larena - Urbanización 01 | $38,384,853.16 | $38,384,853.16 | $0.00 | Coincide |
| Crest - CDS | $85,002,185.44 | $84,843,821.44 | -$158,364.00 | gasto_total, por_gastar |
| Lote 77 | $7,982,533.28 | $7,982,533.28 | $0.00 | Coincide |
| Programa Sunrise | $0.00 | $0.00 | $0.00 | Coincide |
| Larena - Acceso | $1,154,449.90 | $1,174,117.84 | +$19,667.94 | gasto_total, por_gastar |
| Ruiz - A3 | $19,843,439.57 | $19,843,439.57 | $0.00 | Coincide |

Un ajuste positivo significa que el gasto guardado es menor que la suma actual; un ajuste negativo significa que es mayor. No equivale a un movimiento bancario faltante ni identifica una transacción que causó la desactualización.

La consulta desplegada coincide con las métricas guardadas en todos los proyectos y mantiene las discrepancias encontradas (5 proyectos). La corrección que lee las partidas actuales existe en el repositorio, pero el comportamiento observado en este despliegue todavía usa el resumen guardado.

## Honorarios y consistencia de pagos

| Proyecto | Honorarios guardados | Honorarios recalculados | Pagado de partidas vs conceptos |
|---|---:|---:|---|
| Sunrise | $32,380.30 | $32,380.30 | ALBAÑILERÍAS: faltan $2,857.00 |
| Larena - Torre I | $11,077,548.58 | $11,077,548.58 | RECUBRIMIENTOS: faltan $22,092.00 |
| Larena - Torre H | $10,891,003.71 | $10,891,003.71 | MÁRMOL: faltan $67,874.86; RECUBRIMIENTOS: faltan $288,401.62 |
| Larena - Torre G | $8,172,381.99 | $8,172,381.99 | RECUBRIMIENTOS: faltan $817,930.48 |
| Larena - Torre J | $3,228,289.06 | $3,228,289.06 | Coincide |
| Larena - Urbanización 01 | $5,268,881.18 | $5,268,881.18 | Coincide |
| Crest - CDS | $7,349,574.80 | $7,349,574.80 | Coincide |
| Lote 77 | $855,271.42 | $855,271.42 | Coincide |
| Programa Sunrise | $0.00 | $0.00 | Coincide |
| Larena - Acceso | $144,189.91 | $144,189.91 | Coincide |
| Ruiz - A3 | $2,250,000.00 | $2,250,000.00 | Coincide |

## Diferencias adicionales en partidas

Estas diferencias son independientes del resumen guardado. Los importes positivos son pagos registrados que no están reflejados en el pagado de la partida raíz. No deben sumarse a los ajustes del resumen sin reconciliar primero ambos niveles.

| Proyecto | Partida | Pagos no reflejados | Omitidos por la lógica actual de jerarquía | Diferencia restante frente a esa lógica |
|---|---|---:|---:|---:|
| Sunrise | ALBAÑILERÍAS | $2,857.00 | $2,857.00 | $0.00 |
| Larena - Torre I | RECUBRIMIENTOS | $22,092.00 | $22,092.00 | $0.00 |
| Larena - Torre H | MÁRMOL | $67,874.86 | $67,874.86 | $0.00 |
| Larena - Torre H | RECUBRIMIENTOS | $288,401.62 | $0.00 | $288,401.62 |
| Larena - Torre G | RECUBRIMIENTOS | $817,930.48 | $0.00 | $817,930.48 |

En Sunrise (ALBAÑILERÍAS), Torre I (RECUBRIMIENTOS) y Torre H (MÁRMOL), la diferencia corresponde a pagos directos a una partida raíz o a una familia que también tiene subpartidas. La agregación actual de updatePagadoForHierarchy en convex/functions.ts omite esos pagos. analysis.json identifica cada concepto y su transacción. En RECUBRIMIENTOS de Torre H y Torre G, los importes pagado guardados también difieren de los pagos que la propia lógica actual sí debería incluir.

Se ejecutó la implementación actual de updatePagadoForHierarchy sobre una copia local de los datos para las cinco partidas afectadas. Los resultados confirmaron tanto los pagos omitidos por la jerarquía como los importes que un recálculo sí actualizaría. Esta ejecución no escribió en Convex.

Conceptos de las obras que no pudieron asociarse a una partida raíz: 0.

Las diferencias entre cabecera de transacción y suma de sus conceptos se conservan en analysis.json; no se repartieron ni corrigieron. Esta auditoría verifica consistencia y actualización del resumen con la lógica actual del presupuesto, sin certificar importes contables ni conversiones de moneda.

## Evidencia

Proyectos con alguna de las dos incidencias: 7 de 11. Los conjuntos se solapan en Sunrise y Torre H.

Scripts, lectura completa y resultados por proyecto: `.migration/presupuesto-audit-2026-10-02/` (ignorado por Git). `analysis.json` incluye cobertura, hashes de la lectura y de las funciones de cálculo, diferencias por campo, respuesta real de cada consulta y comprobaciones de pagos. No se guardaron credenciales.
