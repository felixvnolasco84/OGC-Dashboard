# Carga y compatibilidad — 23 de octubre de 2026

Se dividieron las pantallas y los modales en módulos que se preparan de uno en
uno en segundo plano, después del arranque autenticado y durante tiempo libre
del navegador. Abrir una pantalla o modal solicita inmediatamente su módulo.
Los modales se montan al primer uso y conservan su estado y efectos de cierre.
La exportación PDF se importa al exportar. Los estilos globales originales se
mantienen en el arranque, independientemente de la pantalla abierta.

P&L prepara el ledger después de recibir el resumen visible, o al abrirlo antes.
Las menciones preparan el listado en segundo plano y mantienen su contador
reactivo desde el inicio. Se conservan rutas, permisos, filtros, orden, fórmulas,
paginación existente y suscripciones reactivas. No hay migraciones.

Los cálculos reutilizan las partidas ya leídas. Las lecturas independientes se
agrupan con concurrencia acotada, conservando su orden. Las gráficas leen cada
transacción compartida una sola vez. Los pagos históricos continúan leyéndose
por transacción, incluidos los que carecen de `proyecto_id` o clasificación.

## Tamaños del build

| Recurso | Antes | Después |
| --- | ---: | ---: |
| JavaScript inicial | 3.49 MB | 795 KB |
| JavaScript inicial, gzip | 932 KB | 240 KB |
| 16 fuentes, sin eliminar caracteres | 6.60 MB | 2.22 MB |
| Precarga PWA | 5.37 MiB | 3.20 MiB |

El conjunto precargado incluye el arranque y la clausura de dependencias estáticas
de Bitácora offline, calculada a partir del bundle final. PDF, visor de planos y
otras pantallas se almacenan al usarlas. Autenticación y API siguen usando la
red; la actualización de la PWA conserva la confirmación existente.

Las fuentes WOFF2 conservan mapas de caracteres, orden de glifos y tablas
tipográficas originales. Solo cambian los metadatos propios del contenedor.
`scripts/compress-fonts.py` regenera y verifica los archivos con FontTools 4.67.0
y Brotli 1.2.1. Los originales permanecen en `src/fonts`.

## Validación local

- Build y tipos del frontend y Convex.
- 208 pruebas financieras y offline aprobadas; una prueba de auditoría real
  requiere un snapshot externo y permanece omitida.
- P&L en 390 y 1440 px: el ledger pendiente no bloquea el resumen; navegación,
  filtros y reportes mantienen su comportamiento.
- Modales: sin consultas iniciales estando cerrados, apertura anticipada,
  cierre/reapertura y contador de menciones reactivo.
- PDF: selección completa/parcial, avisos, filtros, cancelación, fallo de captura,
  scroll, móvil y lector.
- PWA: recarga offline, captura con archivo y persistencia de la cola, galería y
  detalle. La sincronización se cubre con las pruebas de repositorio y transporte
  simulado; no se escriben registros en producción.
- Capturas de Bitácora original/optimizada: igualdad de píxeles en 390 y 1440 px.

Se compararon cinco cargas frías y cinco calientes de cada build en Chrome local,
usando la misma Bitácora sintética y bloqueando servicios externos. Se bloquearon
service workers para aislar el coste de cargar y renderizar JavaScript:

| Mediana hasta mostrar la vista | Antes | Después |
| --- | ---: | ---: |
| Caché vacía | 203 ms | 171 ms |
| Caché disponible | 141 ms | 115 ms |

Son medidas locales sin autenticación remota. La latencia de consultas con datos
reales y la validación simultánea entre usuarios requieren una sesión autenticada;
estos resultados no predicen los segundos de carga en producción.

## Repetir las comprobaciones

Usar `npm run build`, `npm run typecheck:convex`, `npm run test:pnl`,
`npm run test:project-fees`, `npm run test:payment-edits`,
`npm run test:bitacora-offline`, `npm run test:pnl-ui`,
`npm run test:performance-ui` y `npm run test:programa-export-ui`.

La prueba sintética de PWA es:
`npx playwright test e2e/bitacora/offline-layout.spec.ts --config=playwright.bitacora.config.ts --project=chromium`.

Para `npm run test:loading-performance`, guardar previamente un build original en
`node_modules/.cache/performance-baseline` y el actualizado en `dist`. Las muestras
y capturas se guardan en `node_modules/.cache/loading-performance`.
