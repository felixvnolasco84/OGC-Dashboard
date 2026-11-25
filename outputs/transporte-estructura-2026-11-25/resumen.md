# Costos de estructura de Transporte eliminados de P&L

Fecha: 25 de noviembre de 2026. Base configurada: `dev:animated-walrus-612`.

Se anularon los 70 movimientos activos de costo de estructura de categoría TRANSPORTE, por **$2,143,942.99 MXN**. Se revisó todo el historial; los 70 corresponden a 2026.

| Concepto | Antes | Después |
| --- | ---: | ---: |
| Transporte | $2,143,942.99 | $0.00 |
| Total estructura OGC | $5,246,237.41 | $3,102,294.42 |
| EBITDA | $23,578,354.01 | $25,722,297.00 |

Periodo verificado en P&L: enero–noviembre de 2026. También se concilió la rentabilidad acumulada hasta noviembre.

Comprobación: cero costos activos de Transporte; 786 movimientos restantes idénticos por SHA-256; importes de las demás categorías e ingresos conservados; 70 anulaciones con auditoría individual verificada.

La anulación conserva los datos fuente y la trazabilidad. Respaldo previo, posterior, bitácora de operaciones y auditoría completa en `.migration/transporte-estructura-2026-11-25/` (directorio local ignorado por Git). Se utilizó la función desplegada `ogc_movimientos:voidMovement`.

No fue necesario modificar ni desplegar código de la aplicación.
