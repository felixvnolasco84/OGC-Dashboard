# P03 · Obra › Presupuesto › Ingresos

Implementación local verificada el 18 de noviembre de 2026.

## Resultado

- «Nuevo ingreso» es la acción principal visible para admin y finance y abre el formulario existente.
- «Acciones de ingresos» abre el menú reutilizable, con el grupo «Importación»: «Carga masiva» para admin/finance y «Historial de cargas» para quienes podían consultarlo.
- El menú termina su cierre antes de abrir el historial o la carga masiva. Escape cierra la superficie correspondiente y el historial devuelve el foco al disparador de acciones.
- El historial mantiene apertura diferida, reinicio de paginación y registros expandidos, y su botón predeterminado dentro de carga masiva.
- Se limpian los nuevos estados de menú/historial al cerrar Ingresos o cambiar de proyecto.
- Resumen, tabla, cálculos, acciones por ingreso, formulario y reglas de backend conservados.

## Archivos

- `src/components/modals/ingresos-modal.tsx`: barra y coordinación del menú/historial.
- `src/components/ingresos/IncomeImportHistory.tsx`: apertura controlada opcional y sesión de historial diferida; API anterior compatible.
- `scripts/test-income-import-history-ui.mjs`: selectores actualizados y regresiones de P03.
- `e2e/income-import-history/convex-stub.ts`: escenarios ficticios de roles y listas.
- `e2e/income-import-history/preview.tsx`: acceso de prueba al store para comprobar cierre y cambio de proyecto.

## Validación

- `npm run build`: aprobado, incluidos TypeScript y Vite. Registro completo en `build.log`. Vite advierte sobre paquetes mayores de 500 kB; no impide la compilación.
- `npm run test:income-import`: 43 pruebas aprobadas, 2 archivos.
- `npm run test:income-import-ui`: aprobado en 1440, 390 y 320 px con datos ficticios. Incluye roles admin, finance, viewer, user, desconocido y pendiente; teclado/foco, formulario, listas pobladas/vacías/cargando, navegación de carga, historial, paginación, reinicio al reabrir/cambiar proyecto y regresiones previas de respaldo/importación.
- ESLint de los dos componentes modificados: 0 errores. Advertencia previa de Fast Refresh por `sourceRowLabel`, y aviso de configuración de Tailwind del linter.
- `git diff --check` de los cinco archivos de implementación/prueba: sin errores de espacios.
- Aplicación real en Chrome, pestaña propia, proyecto Lote 77: lista, resumen, menú y accesos a formulario/carga/historial; Escape, foco, cierre y reapertura. Comprobación visual a 1440 × 1000, 1024 × 1000 y 390 × 844. Sin desbordamiento de documento ni de la barra. Se conserva el desplazamiento horizontal existente de la tabla en móvil.

Los escenarios de otros roles, listas vacías/cargando, historial poblado y cambio de proyecto se probaron en el entorno local con backend simulado. La sesión real tenía permiso de gestión y el historial del proyecto estaba vacío. No se crearon, modificaron ni eliminaron ingresos reales, no se subieron archivos reales y no se continuaron ni descartaron intentos reales. Las importaciones automatizadas son ficticias y tienen las transferencias interceptadas por la suite existente.

No se modificaron los archivos concurrentes de P01 ni los otros módulos. Se restituyeron solo las capturas rastreadas regeneradas por la suite; la evidencia nueva de P03 queda en esta carpeta.

## Capturas de la aplicación real

Estas imágenes corresponden al código implementado, no a las maquetas de la auditoría.

- `P03-real-escritorio-lista.jpg` y `P03-real-escritorio-menu.jpg`: 1440 × 1000.
- `P03-real-movil-lista.jpg` y `P03-real-movil-menu.jpg`: 390 × 844.
- `P03-real-1024-lista.jpg`: 1024 × 1000.
- `P03-real-escritorio-nuevo.jpg`, `P03-real-escritorio-carga-masiva.jpg` y `P03-real-escritorio-historial.jpg`: comprobación de accesos existentes durante la sesión, a 960 × 667.
