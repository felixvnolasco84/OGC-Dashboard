# Recategorización OGC — 1 de octubre de 2026

Se corrigieron 49 movimientos existentes en el despliegue configurado `animated-walrus-612`, usando `CE_230726.xlsx` como referencia. Cada corrección tiene auditoría con el registro anterior, el posterior, las filas que la respaldan y el SHA-256 del archivo.

| Clasificación anterior | Clasificación correcta | Registros | Importe MXN |
| --- | --- | ---: | ---: |
| Ingreso / HONORARIOS | Costo estructura / DISP HONORARIOS | 38 | $9,550,082.31 |
| Costo estructura / cargas sociales administrativas | Informativo / CARGA SOCIAL OBRA (SIROC-RECUPERABLE) | 5 | $4,103,566.31 |
| Costo estructura / OTROS | Informativo / FLUJO FISCAL (IVA + RETENCIONES) | 6 | $2,058,733.00 |

La comparación se hizo por fecha, importe a centavos, moneda y descripción normalizada. Los 269 registros importados desde este archivo coinciden con la referencia. Se conservaron los 822 registros de la base, sus importes, fechas, vínculos, estado y datos de conciliación. Los otros 773 registros quedaron intactos. Se verificaron las 49 auditorías y una nueva simulación devolvió cero correcciones pendientes.

## Conciliación del P&L

Consolidado de todas las ubicaciones, enero–octubre de 2026, USD/MXN 17 y EUR/MXN 18.5:

| Concepto | Antes | Después |
| --- | ---: | ---: |
| Honorarios | $21,595,310.46 | $21,595,310.46 |
| Indirectos | $5,933,980.26 | $5,933,980.26 |
| Ingresos OGC | $27,529,290.72 | $27,529,290.72 |
| DISP HONORARIOS | $0.00 | $9,550,082.31 |
| Costos de estructura | $11,908,340.37 | $15,296,123.37 |
| EBITDA | $9,686,970.09 | $6,299,187.09 |

Los honorarios del P&L siguen calculándose por porcentaje de los pagos elegibles de cada obra. El ledger y las consultas de cobrado excluyen las dispersiones y los informativos de ingresos. Los informativos permanecen visibles sin entrar en ingresos, costos ni EBITDA.

## Prevención y validación

- El lector de Excel ahora conserva las columnas originales de tipo y categoría, el número de fila y las filas repetidas. Ya no utiliza el servicio externo que reclasificaba estos datos.
- Las reglas compartidas se aplican al servidor, la importación, la captura manual, el ledger, el P&L y WIP. DISP HONORARIOS se clasifica como costo. Las dos categorías informativas mantienen su tipo.
- El desglose de estructura respeta la categoría explícita antes de buscar palabras en la descripción.
- Pasaron 35 pruebas de clasificación y P&L, las pruebas existentes de importación, TypeScript, ESLint y el build. La prueba opcional que requiere una captura histórica independiente quedó omitida.

## Diferencia existente entre Excel y carga

El archivo tiene 283 filas y 269 combinaciones distintas de fecha, importe, moneda y descripción. La importación anterior consolidó 14 filas repetidas, incluidas 11 de DISP HONORARIOS. Por eso el Excel contiene 49 filas de DISP por $9,658,328.96, mientras que los 38 registros existentes suman $9,550,082.31. Esta reparación recategoriza los registros existentes y conserva su cantidad. El lector nuevo conserva las filas repetidas para futuras cargas.

Las capturas completas, el manifiesto revisado y las auditorías de esta ejecución se conservaron en `.migration/ogc-classification-2026-10-01/`, excluido de Git.
