# Análisis de honorarios con datos de Convex

Consulta: 1 de octubre de 2026, 13:43–13:49, America/Mexico_City.

Despliegue consultado: `animated-walrus-612`, configurado como **desarrollo** en `.env.local`. No se consultó producción ni se modificó la base de datos.

## Método y cobertura

Se leyeron todas las páginas de siete tablas, sin limitar el análisis a una muestra: 11 desarrollos, 11,575 partidas, 5,502 transacciones, 11,176 pagos, 822 movimientos OGC, 11 métricas de presupuesto y 0 ubicaciones configuradas. Se guardaron únicamente campos necesarios para la auditoría, sin credenciales.

Se extrajeron del código actual las funciones `summarizeProjectPayments`, `summarizeOgcMovements` y `getOgcFormulaTotals`, y se ejecutaron localmente contra estos registros mediante un adaptador de consultas de lectura. Este recálculo verifica el comportamiento del código del repositorio sobre datos reales; no es una captura de la pantalla ni una comprobación del código desplegado. Los importes consolidados suponen acceso a todas las obras de cada ubicación. Se respetaron estados de movimientos, partidas excluidas, modos de honorarios, fechas y conversión de moneda del código actual.

Se verificaron IDs únicos, lectura completa de todas las tablas y coincidencia entre suma mensual y honorarios acumulados de cada obra. Una segunda lectura de movimientos OGC confirmó que sus campos de cálculo no habían cambiado durante la auditoría.

Para enero–octubre de 2026, usando los tipos predeterminados de la página (USD 17 y EUR 18.5):

| Alcance | Honorarios recalculados, MXN |
|---|---:|
| Todas las obras, incluyendo corporativo | $185,567,104.70 |
| Los Cabos, incluyendo corporativo | $184,067,104.70 |
| Solo movimientos corporativos sin obra | $10,038,708.00 |

Son resultados de la lógica actual, no importes certificados como honorarios correctos. Los movimientos corporativos se incluyen en cada filtro de ubicación según la implementación actual.

## 1. Ingresos de construcción y otras naturalezas reconocidos íntegramente como honorarios

**Hallazgo confirmado de clasificación; prioridad alta.** En `convex/desarrollos.ts:310–320`, cualquier movimiento activo de tipo `ingreso` cuya categoría no coincida con indirectos se incorpora completo a honorarios. No se exige categoría HONORARIOS ni se comprueba su naturaleza en la descripción.

En 2026 existen **275 ingresos activos OTROS, por $149,837,726.90 MXN**, incluidos íntegramente en honorarios. En todo el historial hay 548, por $319,797,267.81. Esto es el importe expuesto a clasificación incorrecta; no implica que todos deban eliminarse, pues algunos podrían corresponder a servicios profesionales válidos.

Ejemplos activos de 2026:

| Obra | Registro OGC | Fecha | Importe MXN | Descripción |
|---|---|---|---:|---|
| Sunrise | `r57amgp889d1f5x96awdsd4mmd8aeqjr` | 03/06/2026 | $640,811.29 | ESTIMACIÓN 03 MXN SERVICIOS CONSTRUCCIÓN LOTE 04 |
| Lote 77 | `r5728fkmzddkkp4wb8m19bbn718e020s` | 07/08/2026 | $3,855,944.12 | ESTIMACION JULIO Y TERCER ANTICIPO LOTE 77 |
| Larena - Acceso | `r573a77n4krhryrrhts1dv59zs8fejdq` | 21/08/2026 | $1,846,346.67 | TRANSFERENCIA OGC DEVELOPMENTS SA DE CV SERVICIOS CONSTRUCCIÓN ETAPA 01 |

El problema también aparece en movimientos ya clasificados como HONORARIOS: dos registros corporativos descritos como aportaciones de flujo se incorporan como ingresos por honorarios:

| Registro | Fecha | Importe MXN | Descripción relevante |
|---|---|---:|---|
| `r574v0gqc19g8r904c7ermg2bn8b5zaq` | 26/01/2026 | $3,960,180.00 | APORTACIÓN FLUJO OGC … VENTA DPT G PH-01 |
| `r575e7bcnb6fhpsfwadj7aytys8b517c` | 26/01/2026 | $3,433,730.36 | APORTACIÓN FLUJO OGC … PAGO A CUENTA |

Estas dos aportaciones suman **$7,393,910.36**. Sus descripciones indican una naturaleza distinta de honorarios, pendiente de validar con el documento contable. También hay ingresos HONORARIOS con descripciones de compras, transporte y mantenimiento; el cálculo acepta la clasificación almacenada sin otra validación.

La suma entre honorarios automáticos y OGC realmente ocurre. Por ejemplo, Sunrise aporta $14,487.19 calculados por porcentaje y $8,109,030.70 de OGC al corte; Larena - Torre I aporta $3,912,128.04 y $37,565,562.45 respectivamente. Esos componentes son independientes dentro del código. No se ha demostrado que ambos representen las mismas operaciones: la coexistencia por sí sola no prueba doble conteo.

## 2. Dos pares de movimientos indistinguibles se reconocen dos veces

**Candidatos reales a duplicación; requieren conciliación.** Todos están activos, no conciliados, sin referencia de factura y comparten su `duplicate_key` dentro de cada par. Se originaron en la misma importación `w974pmpg4jw30cb0nxpmdmf0w18fex51`, archivo `INGRESOS_LARENA_OGARQO.xlsx`.

| Obra | Fecha | Filas del Excel | Importe de cada registro | Aporte del par a honorarios | Exceso si existe una sola operación |
|---|---|---|---:|---:|---:|
| Larena - Torre I | 26/06/2026 | 390 y 391 | $21,254.00 | $42,508.00 | $21,254.00 |
| Larena - Urbanización 01 | 01/02/2026 | 517 y 518 | $2,147,835.78 | $4,295,671.56 | $2,147,835.78 |

IDs de Torre I: `r5764b8pm58zxpqy54kck7p04d8feq1a` y `r577vx45jmmtpr744nb2es6g8h8fe4xz`.

IDs de Urbanización: `r57fynzm76zgaeba99sa2pvbm18fe0t3` y `r57e1ease48yp7am93ze6d22e98fedxa`.

**Impacto potencial total: $2,169,089.78 MXN.** No se pueden declarar duplicados contables definitivos solo con estos campos. El importador admite filas idénticas diferentes del mismo Excel y existen tests que preservan ese comportamiento. Es necesario revisar las referencias de las operaciones originales antes de anular alguna.

Los tres movimientos anulados de Lote 77 se excluyen correctamente; sus coincidencias con registros activos no producen duplicación actual.

## 3. Dos transacciones pagadas tienen fecha NaN/NaN/NaN

**Omisión confirmada; prioridad media.** `parseReportDate` devuelve null y el filtro del periodo descarta las transacciones en cualquier año y mes. Sus conceptos son elegibles para honorarios automáticos y no están excluidos.

| Obra | Transacción | Concepto | Base MXN | Porcentaje | Honorarios que no se asignan a ningún periodo |
|---|---|---|---:|---:|---:|
| Larena - Torre I | `k974kh7n5scryvsk5qd1h8y8398ajfrg` | ALBAÑILERÍAS | $9,699.92 | 16% | $1,551.99 |
| Larena - Torre J | `k97ae49d171f1h0be6pgz8c63n8akga9` | MUROS_3NPH | $420.00 | 16% | $67.20 |

**Total omitido: $1,619.19 MXN.** La fecha válida debe recuperarse del documento original; no se puede asignar este monto al año 2026 por inferencia.

## 4. El total de cuatro transacciones no coincide con la suma de sus conceptos

**Inconsistencia de datos confirmada.** El P&L calcula la base a partir de `pagos.monto`, mientras que el cálculo general de honorarios automático utiliza `transacciones.monto_total` menos exclusiones. No son fuentes equivalentes en estos registros.

| Obra | Transacción | Fecha | Total de cabecera | Suma de conceptos | Diferencia de honorarios si la cabecera es correcta |
|---|---|---|---:|---:|---:|
| Sunrise | `k975jh6k34bf7j3p0xgt4eq7xh7w5r2s` | 31/08/2025 | $70,180.16 | $62,380.16 | $78.00 al 1% |
| Sunrise | `k976szy439rg3p869cfkgc28n97w4nxk` | 31/08/2025 | $50,400.00 | $32,200.00 | $182.00 al 1% |
| Larena - Torre G | `k9758kamhd52x64e5jq25xb7697z7mj6` | 05/01/2026 | $71,553.44 | $59,953.44 | $1,856.00 al 16% |
| Larena - Torre I | `k978yqs3zwwcnh7s5c4n99bmsd7yepcn` | 30/11/2025 | $13,949.00 | $25,699.00 | Sin aporte directo al P&L: todos los conceptos están excluidos |

En Torre G, la contribución calculada por los conceptos es **$9,592.55**; sobre la cabecera sería **$11,448.55**. No se puede concluir qué importe es correcto sin revisar los documentos originales. El desajuste tampoco debe corregirse repartiendo automáticamente diferencias entre partidas, porque podría alterar las exclusiones.

## Casos del análisis anterior contrastados con la base

- **Devoluciones:** no hay pagos negativos en las 11,176 filas leídas. El error de `Math.abs` sigue siendo reproducible con datos simulados, pero no tiene una ocurrencia negativa actual demostrada.
- **Conceptos sin partida:** no se encontraron en los 9,560 pagos pertenecientes a transacciones de las 11 obras actuales. Sí existen referencias incompletas en registros huérfanos históricos; no se puede atribuirles honorarios sin recuperar su obra y configuración.
- **Colisiones de exclusiones:** no se encontraron pagos de las obras actuales excluidos únicamente por coincidir en nombre con una raíz ajena.
- **Por pagar:** todas las 5,502 transacciones consultadas tienen estado Pagado. La inclusión de pendientes en modo transacciones no produce un caso actual.
- **Modo por transacciones:** Ruiz - A3 tiene ese modo; seis conceptos de HONORARIOS por $250,000 cada uno aportan $1,500,000 al corte de octubre. No tiene ingresos OGC vinculados, de modo que aquí no se demuestra doble conteo entre ambas fuentes.
- **Moneda:** las cuatro transacciones USD de Sunrise tienen tipo de cambio 1.0, pero todos sus conceptos están excluidos de honorarios. Por tanto, la anomalía no altera el cálculo actual de honorarios de esa obra. Los restantes registros USD corresponden a proyectos ausentes del catálogo actual.

## Evidencia y límites

Evidencia local y scripts reproducibles: `.migration/honorarios-audit-2026-10-01/` (directorio ignorado por Git). `snapshot.json` contiene la lectura completa con campos seleccionados; `ogc-provenance.json` añade archivo/fila de origen; `analysis.json` incluye resultados por obra, mes y periodo. No se guardaron credenciales en esos archivos.

No se modificaron tablas, estados de conciliación, configuraciones de obras ni código de la aplicación. La clasificación contable definitiva y la existencia de dos operaciones bancarias separadas requieren documentación adicional. Los importes de clasificación y duplicación se solapan y no deben sumarse como una pérdida total.
