# Desglose de saldo de indirectos — consulta directa de Convex

Consulta final: 12 de noviembre de 2026, 1:15:33 p.m., America/Mexico_City.

Fuente: despliegue `animated-walrus-612`, configurado como desarrollo en `.env.local`. Se ejecutaron las consultas desplegadas en modo lectura con la cuenta administradora existente. No se desplegó código ni se modificaron datos.

## Alcance que reproduce la captura

- Ubicación: Los Cabos.
- Pestaña: Project profitability.
- Corte seleccionado: noviembre de 2026; incluye fechas válidas hasta el 30 de noviembre de 2026.
- Acumulación: todo el histórico hasta el corte.
- Moneda: MXN; parámetros USD 17 y EUR 18.5, con el tipo registrado de cada movimiento cuando aplica.

## Cálculo exacto, expresado a centavos

| Concepto | Importe MXN |
|---|---:|
| Indirectos cobrados | $16,470,869.22 |
| Menos costo histórico de indirectos | $6,488,807.04 |
| Menos costos reales de indirectos registrados en OGC | $0.00 |
| **Saldo de indirectos** | **$9,982,062.18** |

La interfaz muestra este último importe como **$10.0M** por el formato compacto de una cifra decimal. Los cálculos conservan los decimales de origen; aquí se presentan redondeados a centavos.

## Origen del costo histórico

Los cuatro importes se reconstruyeron desde los pagos originales y sus transacciones. Coinciden con la consulta desplegada, con diferencia menor a una millonésima de peso. Se verificaron IDs de pago únicos.

| Obra | Pagos incluidos | Costo histórico MXN |
|---|---:|---:|
| Sunrise | 129 | $1,720,708.60 |
| Larena - Torre I | 36 | $236,590.40 |
| Larena - Torre H | 16 | $34,533.20 |
| Crest - CDS | 263 | $4,496,974.84 |
| **Total** | **444** | **$6,488,807.04** |

Cobertura: 21 partidas consultadas; 444 pagos incluidos pertenecientes a 335 transacciones distintas. Todos los pagos incluidos tienen transacción Pagado, proyecto correspondiente y fecha válida dentro del corte.

| Obra | Partida | Familia | Pagos | Importe MXN |
|---|---|---|---:|---:|
| Sunrise | INDIRECTOS | CAMPAMENTO/HABITACION | 19 | $311,140.34 |
| Sunrise | INDIRECTOS | DESAYUNOS Y  COMIDAS | 79 | $758,497.58 |
| Sunrise | INDIRECTOS | VUELOS DE AVION | 3 | $118,830.20 |
| Sunrise | INDIRECTOS | FLETES NACIONALES | 1 | $32,944.94 |
| Sunrise | INDIRECTOS | OTROS | 20 | $79,492.87 |
| Sunrise | INDIRECTOS | FIANZA | 7 | $419,802.67 |
| Larena - Torre I | MÁRMOL | VIATICOS COLOCACION | 35 | $163,046.40 |
| Larena - Torre I | COCINA | COCINA PRINCIPAL (VIATICOS  Y  FLETE) | 1 | $73,544.00 |
| Larena - Torre H | MÁRMOL | VIATICOS COLOCACION | 16 | $34,533.20 |
| Crest - CDS | Mármol | Viaticos colocacion | 8 | $186,067.92 |
| Crest - CDS | Viaticos Personal | Habitación | 31 | $763,354.00 |
| Crest - CDS | Viaticos Personal | Desayunos y comidas | 112 | $2,299,175.06 |
| Crest - CDS | Viaticos Personal | Transporte de personal | 87 | $675,847.93 |
| Crest - CDS | Viaticos Personal | Vuelos de avion  | 6 | $403,441.55 |
| Crest - CDS | Viaticos Personal | Gastos | 19 | $169,088.38 |

## Cómo se forma el saldo por obra

| Obra | Indirectos cobrados | Costo histórico | Costos reales OGC de indirectos | Saldo |
|---|---:|---:|---:|---:|
| Sunrise | $1,720,708.60 | $1,720,708.60 | $0.00 | $0.00 |
| Larena - Torre I | $2,902,133.17 | $236,590.40 | $0.00 | $2,665,542.77 |
| Larena - Torre H | $2,723,435.46 | $34,533.20 | $0.00 | $2,688,902.26 |
| Larena - Torre G | $2,154,765.60 | $0.00 | $0.00 | $2,154,765.60 |
| Larena - Torre J | $831,375.59 | $0.00 | $0.00 | $831,375.59 |
| Larena - Urbanización 01 | $420,669.27 | $0.00 | $0.00 | $420,669.27 |
| Crest - CDS | $4,496,974.84 | $4,496,974.84 | $0.00 | $0.00 |
| Lote 77 | $971,070.46 | $0.00 | $0.00 | $971,070.46 |
| Programa Sunrise | $0.00 | $0.00 | $0.00 | $0.00 |
| Larena - Acceso | $249,736.23 | $0.00 | $0.00 | $249,736.23 |
| **Total** | **$16,470,869.22** | **$6,488,807.04** | **$0.00** | **$9,982,062.18** |

## Hallazgo sobre la clasificación actual

El costo histórico procede de pagos manuales de partidas o familias que coinciden con Indirectos, General Conditions o Viáticos, y que no fueron sustituidos por un concepto automático configurado. La implementación añade esos mismos pagos al ingreso de indirectos y al costo histórico; al calcular el saldo ambos componentes se cancelan.

En Sunrise y Crest todos los indirectos reportados provienen de ese componente manual y su saldo es cero. En Torre I y Torre H existen conceptos automáticos junto con viáticos manuales de otras partidas. En particular, Torre I incluye $163,046.40 de MÁRMOL / VIATICOS COLOCACION y $73,544.00 de COCINA / COCINA PRINCIPAL (VIATICOS Y FLETE), que suman $236,590.40 y aparecen a la vez en ingreso e histórico.

En esta lectura, los costos reales de indirectos del ledger OGC son cero. El saldo final coincide con los cargos automáticos que quedan al cancelar los pagos manuales. Esta verificación explica el comportamiento actual; no modifica la clasificación financiera.

El total de la fila COSTOS OGC es $12,234,848.10: suma $5,746,041.06 de estructura OGC y $6,488,807.04 de costo histórico. El saldo de indirectos descuenta solamente sus componentes de indirectos; los otros gastos de estructura participan en el EBITDA.

## Comparación con P&L Mensual

Para enero–noviembre de 2026, la consulta desplegada devolvió $7,127,061.95 − $1,840,282.07 − $0.00 = **$5,286,779.88**, que la pantalla abrevia a $5.3M.

## Verificación y evidencia

La consulta de Project profitability se ejecutó dos veces; coincidieron exactamente indirectos cobrados, costo histórico, costos reales y saldo. El desglose de pagos se contrastó con el primer resultado y se confirmó con el segundo.

Consultas desplegadas: `desarrollos:getProfitabilitySummary`, `desarrollos:getPnlSummary`, `desarrollos:getAll`, `partida:getByProject` y `pagos:getByPartidaId`. Se utilizó la configuración del proyecto para identificar partidas de origen sustituidas por conceptos automáticos y las partidas de honorarios excluidas del costo histórico.

Evidencia financiera y detalle de los 444 pagos: `.migration/saldo-indirectos-2026-11-12/evidence.json` (ignorado por Git). No contiene credenciales.
