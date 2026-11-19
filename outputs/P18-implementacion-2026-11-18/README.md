# P18 · Proveedores · Cabecera implementada

Fecha: 18 de noviembre de 2026.

«Nuevo proveedor» permanece visible como acción principal. El botón «…», con nombre accesible «Herramientas del catálogo de proveedores», agrupa Importación → Actualizar desde Excel y Mantenimiento → Sincronizar transacciones. El menú conserva un margen mínimo de 16 px en móvil.

Seleccionar una herramienta cierra primero el menú y después abre el diálogo original, montado fuera del menú. Al cancelar, cerrar con Escape o usar el cierre del diálogo, el foco vuelve a «…». Las guardas del diálogo siguen controlando el cierre durante procesos ocupados. Abrir el menú no prepara vistas previas ni llama mutaciones. El análisis de sincronización sólo empieza al abrir su diálogo, como antes; aplicar cambios sigue requiriendo su botón explícito.

## Archivos propios

- `src/pages/ProveedoresTable/ProveedoresTablePage.tsx`: único archivo de producción modificado por P18.
- `e2e/provider-header/`: página y diálogos reales con Convex sustituido por un fixture aislado; estilos propios sólo para el marco de validación.
- `scripts/test-provider-header-ui.mjs`: validación de comportamiento, capturas y registro de llamadas.

No se modificaron diálogos compartidos, componentes UI globales, ruta, permisos, backend, filtros, ordenamiento, paginación ni acciones por proveedor. La ruta `/proveedores` sigue protegida por `requiredRole="admin"`; `hasProviderManagementAccess` conserva su regla de admin.

## Comprobaciones

- `npm run build`: correcto (TypeScript y Vite). Vite conserva su aviso de bundles superiores a 500 kB.
- `npm run test:providers`: correcto, reglas de proveedores e importación de transacciones.
- `npx --no-install vitest run --config vitest.config.ts --configLoader runner convex/proveedoresPermissions.test.mjs`: 32 pruebas correctas.
- `npx --no-install eslint src/pages/ProveedoresTable/ProveedoresTablePage.tsx`: correcto.
- `node scripts/test-provider-header-ui.mjs`: correcto a 1440 × 1000, 1024 × 1000 y 390 × 844. Resultado en [resultados-ui.json](resultados-ui.json).
- `git diff --check` del archivo de producción de P18: correcto.

La prueba visual comprueba: acciones en una línea, menú agrupado y dentro del viewport, navegación con flechas/Enter/Escape, foco dentro del diálogo y retorno a «…», alcance global y por proyecto en ambas herramientas, vista previa con coincidencias y conflicto sin aplicar, bloqueo de cancelación durante análisis, archivo ficticio vacío al reabrir Excel, alta vacía después de una edición cancelada, acciones contextuales, filtros de estado/proyecto, ordenamiento, búsqueda y relevancia, lista vacía/cargando, tamaño de página 25 y carga de más resultados con Mostrando.

El fixture deniega solicitudes fuera de 127.0.0.1 y todas las mutaciones. Registró **cero mutaciones y cero errores de consola**. Se inspeccionaron además la cabecera real autenticada, los grupos del menú y el alta vacía con cancelación en `http://localhost:5173/proveedores`.

## Evidencia nueva

| Vista | Escritorio | Intermedio | Móvil |
| --- | --- | --- | --- |
| Cabecera | [1440](cabecera-1440.png) | [1024](cabecera-1024.png) | [390](cabecera-390.png) |
| Menú | [1440](menu-1440.png) | [1024](menu-1024.png) | [390](menu-390.png) |
| Alta vacía | [1440](nuevo-proveedor-1440.png) | [1024](nuevo-proveedor-1024.png) | [390](nuevo-proveedor-390.png) |
| Excel global | [1440](excel-global-1440.png) | [1024](excel-global-1024.png) | [390](excel-global-390.png) |
| Excel por proyecto | [1440](excel-proyecto-1440.png) | [1024](excel-proyecto-1024.png) | [390](excel-proyecto-390.png) |
| Sincronización por proyecto | [1440](sincronizar-proyecto-1440.png) | [1024](sincronizar-proyecto-1024.png) | [390](sincronizar-proyecto-390.png) |

También se guardaron [análisis ocupado](sincronizar-analizando-bloqueado.png), [lista vacía](lista-vacia-1440.png) y [salida de compilación](build.log).

## Límites

No se crearon, editaron, archivaron, reactivaron ni fusionaron proveedores reales. No se subió un Excel real ni se confirmó una sincronización. La aplicación de cambios contra servicios reales queda fuera de esta validación de presentación; la prueba usa datos simulados y los diálogos originales. No se cambiaron animaciones: se conservaron las transiciones existentes de menú y diálogo.

Los cambios concurrentes de Documentos, Planos y RFIs pertenecen a otros chats y no forman parte de P18. No se realizaron commits ni staging global.
