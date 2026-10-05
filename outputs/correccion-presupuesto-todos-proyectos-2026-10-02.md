# Corrección y verificación de presupuesto — todos los proyectos

Verificado directamente en Convex el 2/10/2026, 14:32:26, America/Mexico_City. Despliegue de desarrollo: `animated-walrus-612`.

Se desplegaron las correcciones y se ejecutó un recálculo de los 11 proyectos. La agregación ahora incluye pagos directos a partidas raíz, familias y subpartidas; conserva devoluciones, cuenta solo pagos de transacciones Pagado y mantiene los honorarios completos una sola vez. Los cambios de presupuesto ya no sobrescriben importes pagados a los padres. El botón Sincronizar datos usa la misma agregación.

Resultado: 11 partidas corregidas. Se verificaron las 11,581 partidas de los 11 proyectos en todos los niveles, las cuatro métricas de cada proyecto y las respuestas de la consulta desplegada. Los descuadres identificados en las siete obras del informe anterior quedaron corregidos. La verificación adicional detectó una raíz duplicada en Ruiz - A3, pendiente de confirmar para unificar su presupuesto.

| Proyecto | Gasto antes | Gasto después | Ajuste neto | Partidas corregidas |
|---|---:|---:|---:|---:|
| Sunrise | $35,043,233.60 | $35,046,499.66 | +$3,266.06 | 3 |
| Larena - Torre I | $84,322,354.13 | $84,344,446.13 | +$22,092.00 | 2 |
| Larena - Torre H | $81,899,567.97 | $82,129,326.74 | +$229,758.77 | 4 |
| Larena - Torre G | $64,548,276.57 | $66,192,245.55 | +$1,643,968.98 | 2 |
| Larena - Torre J | $23,479,059.53 | $23,542,852.47 | +$63,792.94 | 0 |
| Larena - Urbanización 01 | $38,384,853.16 | $38,384,853.16 | $0.00 | 0 |
| Crest - CDS | $85,002,185.44 | $84,843,821.44 | -$158,364.00 | 0 |
| Lote 77 | $7,982,533.28 | $7,982,533.28 | $0.00 | 0 |
| Programa Sunrise | $0.00 | $0.00 | $0.00 | 0 |
| Larena - Acceso | $1,154,449.90 | $1,174,117.84 | +$19,667.94 | 0 |
| Ruiz - A3 | $19,843,439.57 | $19,843,439.57 | $0.00 | 0 |

Se releyeron todas las páginas de desarrollos, partidas, transacciones, pagos y métricas dos veces al finalizar; los datos seleccionados coincidieron entre las dos lecturas. La comprobación independiente recalculó los importes desde los conceptos para cada nivel, comparó el resultado con las partidas, las métricas guardadas y la consulta real de Convex.

Se confirmó contra el respaldo previo que los presupuestos originales y aprobados, los importes y referencias de las transacciones y sus conceptos, los porcentajes, las exclusiones y la configuración de proyectos no cambiaron. La reparación únicamente actualizó campos derivados.

Pruebas: 49 pasaron y una prueba existente se omitió. TypeScript de Convex, compilación de la aplicación y lint de los archivos nuevos pasaron.

## Discrepancias en importes de origen

Persisten cuatro diferencias entre las cabeceras de transacciones y sus conceptos. Se conservaron los importes originales porque escoger uno requiere confirmar el comprobante; no son diferencias pendientes del recálculo de partidas. Se solicitó al usuario el importe correcto en cada caso.

| Proyecto | Transacción | Fecha | Cabecera | Conceptos |
|---|---|---|---:|---:|
| Sunrise | `k975jh6k34bf7j3p0xgt4eq7xh7w5r2s` | 31/08/2025 | $70,180.16 | $62,380.16 |
| Sunrise | `k976szy439rg3p869cfkgc28n97w4nxk` | 31/08/2025 | $50,400.00 | $32,200.00 |
| Larena - Torre I | `k978yqs3zwwcnh7s5c4n99bmsd7yepcn` | 30/11/2025 | $13,949.00 | $25,699.00 |
| Larena - Torre G | `k9758kamhd52x64e5jq25xb7697z7mj6` | 05/01/2026 | $71,553.44 | $59,953.44 |

## Partida duplicada pendiente de confirmar

Ruiz - A3: existen 2 partidas raíz llamadas **Canceleria y cristal**, con IDs `j9705g9gtybmm2x4t64hpj4d1s8enk0s` y `j971m0h7esz7spkc34am831gxn8enbgw`. Cada una registra presupuesto aprobado de $1,616,569.91 y pagado de $773,857.07. La suma de raíces cuenta ambas, mientras la tabla las agrupa por nombre. Se solicitó confirmar si deben unificarse o si representan presupuestos distintos; no se eliminó ni se alteró ningún presupuesto.

## Evidencia

Respaldo, plan probado localmente, vista previa validada en el servidor, resultados de la ejecución y lectura posterior: `.migration/presupuesto-repair-2026-10-02/` (ignorado por Git). `verified.json` registra los resultados de la comprobación independiente. No se guardaron credenciales.
