# Implementación responsive de OGC Dashboard

Fecha: 30 de septiembre–1 de octubre de 2026.

La implementación sigue la prioridad de operación de obra y usa resumen en tarjetas por debajo de 1024 px. Las tarjetas conservan las celdas, identificadores, eventos y valores de las tablas existentes. Los campos secundarios se muestran mediante «Ver detalle completo»; la tabla de escritorio sigue disponible desde 1024 px.

## Componentes compartidos

- Sidebar superpuesto por debajo de 1024 px, cierre al navegar y recuperación de la preferencia de escritorio guardada en la cookie existente.
- Espaciado de 16 px en móvil, 24 px desde 640 px y 48 px desde 1280 px en las páginas modificadas.
- Cabeceras que separan título y acciones; métricas con columnas según el ancho del contenedor y mínimo de 18 rem limitado al espacio disponible.
- Paneles laterales limitados al viewport, cuerpo desplazable, cierre independiente del desplazamiento y acciones de formulario alcanzables. Los formularios afectados pasan a una columna en móvil.
- Diálogos y confirmaciones con altura máxima según `100dvh`, desplazamiento interno y márgenes mínimos de 16 px, también en variantes amplias para tablet.
- Pestañas y tablas con desplazamiento local. Se retiró el `overflow-x-hidden` del layout principal; las comprobaciones miden también el desbordamiento del contenido.
- Controles de navegación, cabeceras y tarjetas con áreas táctiles de al menos 44 px en la presentación móvil.
- Importe completo con centavos en los resúmenes móviles de proyectos, presupuesto de ventas, indicadores financieros de Control y P&L. Se mantiene el formato compacto original de escritorio.

Componentes internos: `responsive-table.tsx`, `responsive-fields.tsx`, `responsive-aside.tsx`, `responsive-currency.tsx` y `responsive.css`. La adaptación de tablas es optativa mediante `mobileSummary`; las tablas que ya tenían otra presentación móvil no se sustituyen automáticamente.

## Entregas y cobertura

| Etapa | Páginas | Implementación y comprobación |
| --- | --- | --- |
| 1 | Navegación, paneles, diálogos y formularios | Suite aislada en 13 anchos. Crear proyecto comprobado en la sesión real a 320 × 568 px: panel dentro de la pantalla, sin los 800 px del diagnóstico original. |
| 2 | Presupuesto | Cabecera, ingresos, métricas y filtros separados. Tarjetas y expansión de partida/familia/subpartida comprobadas con registros reales a 320 y 390 px; tabla conservada a 1440 px. |
| 2 | Control | Corregidas las columnas implícitas provocadas por `col-span-4`, métricas, gráficas y desviaciones. Contenido comprobado a 320, 390, 768 y 1024 px. |
| 2 | Autorizaciones | Adaptadas las tres pestañas y su presentación compartida dentro de Control. Filas editables con etiquetas, resumen y detalle; IMSS/SIROC comprobado con datos. No se modificaron estados ni responsables durante la revisión. |
| 2 | Proveedores del proyecto | Tarjetas con contacto y resumen; campos bancarios y restantes disponibles al abrir el detalle. Comprobación con 18 proveedores. |
| 2 | Detalle de partida | Resumen y pagos adaptados. Validado con una subpartida existente y dos pagos con documentos. Se añadió entrada desde el menú de subpartida. |
| 3 | Proyectos | Tarjetas con estado, ubicación y métricas; nombre del proyecto como enlace accesible a presupuesto. Acciones secundarias conservadas. |
| 3 | Transacciones globales y del proyecto | Tarjetas comparten las consultas, selección, filtros, paginación y totales originales. Verificadas con listas pobladas y detalle reutilizable. |
| 3 | Documentos globales | Carpetas en panel superpuesto desde «Carpetas», selección conservada y cierre al elegir carpeta; ruta visible. Comprobado también a 320 px. Diálogo de mover con una columna en móvil. |
| 3 | Flujo de obra | Metadatos y nombres largos pueden partirse. Resumen semanal y partidas con sus importes al abrir. Validado con 95 semanas. |
| 3 | P&L | Selector de periodo, tarjetas por concepto, detalle de meses y matriz comparativa opcional. P&L, Work in progress y Project profitability comprobados con datos reales. |
| 4 | Proyectos y presupuesto de ventas | Tarjetas, enlace de acceso al proyecto, métricas y filtros adaptados; presupuesto comprobado a 320 px. |
| 4 | Control de ventas | Métricas y gráficas adaptadas; últimos movimientos también usan tarjetas. |
| 4 | Transacciones de ventas | Presentación móvil y detalles conservados. La lista global de 878 registros se divide en páginas de 50; la consulta y los totales siguen usando el conjunto original. Los filtros reinician la página y el cambio de ancho conserva la página seleccionada. |
| 4 | Documentos del proyecto de ventas | Cabecera, listado en tarjetas y estado vacío adaptados. La muestra revisada estaba vacía; falta cierre visual con documentos reales en esa vista. |
| 4 | Flujo de ventas | Aplicada la adaptación semanal de Flujo de obra. La muestra disponible estaba vacía; pendiente validar una lista poblada. |
| 4 | Gestión y usuarios de ventas | Lista/editor como vistas separadas en móvil, regreso explícito y selección conservada. Probadas selección y vuelta; no se guardaron cambios de permisos. |
| 4 | Administración y administraciones de flujo | Márgenes, métricas, formularios y previsualizaciones adaptados. Revisadas las vistas disponibles; carga y confirmación final requieren archivo y entorno de prueba. |
| 5 | Programa y Requisiciones | Suites existentes pasaron. Se preservó el código local de Requisiciones; sólo se actualizó la expectativa del sidebar en su prueba de 768 a 1024 px. |
| 5 | RFIs, usuarios, proveedores y documentos de ventas globales | Revisión móvil de las vistas disponibles. Conservados sus patrones existentes y aplicadas las correcciones compartidas de paneles. |
| 5 | Tareas, Bitácora y reportes | Conservados los layouts existentes. Las reglas de Bitácora y exportaciones pasaron; capturas durante carga/preparación no cuentan como cierre de un estado poblado. |
| 5 | Planos | Altura del visor según viewport, comentarios/anotaciones en panel inferior y controles táctiles mayores. `PlanCanvas` permite desplazamiento táctil en selección y conserva captura de gestos al dibujar. Probados imagen local, zoom, dibujo y panel con comentario en la suite aislada. Pendiente archivo PDF y visor de proyecto real. |
| 5 | Acceso, registro, invitación y upload heredado | Revisión de código; necesitan sesión/invitación y archivos de prueba para cerrar errores, teclado y resultados sin afectar cuentas o datos reales. |

### Ajustes encontrados durante la validación

1. El nombre `PROGRAMA_FLUJO_SEMANAL_TORREI.xlsx` todavía ensanchaba Flujo. Se corrigió el ajuste de línea en obra y ventas.
2. Una regla inicial de ancho móvil ampliaba el diálogo predeterminado más allá de su máximo de 512 px cerca de 640 px. La prueba lo detectó y se corrigió conservando el máximo original.
3. El detalle de partida leía todos los documentos del proyecto y excedía 4096 lecturas en Convex. Ahora solicita documentos por los identificadores únicos de las transacciones de sus pagos, mediante `documentos.getByTransaccion`, que ya existe y usa índice. Un fallo de documento no impide consultar los pagos. La suite verifica deduplicación y el estado de error.
4. La lista global de ventas montaba cientos de tarjetas simultáneamente. La paginación local reduce el trabajo de renderizado sin cambiar la consulta, el orden ni los cálculos existentes.

## Validación ejecutada

| Comprobación | Resultado |
| --- | --- |
| `npm run build -- --configLoader runner` | Correcto: TypeScript, bundle y PWA. Se usó el cargador runner por las restricciones del entorno al cargar la configuración con esbuild. |
| `npm run test:responsive-ui` | Correcto: 320, 390, 639, 640, 767, 768, 849, 850, 1023, 1024, 1279, 1280 y 1440 px. |
| Navegador aislado | Desbordamiento del documento y del main, identificadores y rol interactivo conservados, selección conservada al redimensionar, filtros y vacío, detalle por teclado sin activar la fila, navegación, panel largo, viewport de altura reducida, diálogos predeterminado y amplio, modo lector, visor local, documentos de partida y paginación de ventas. |
| `npm run test:requisiciones-ui` | Correcto: 320, 390, 768, 1024, 1440 y 1536 px; layouts, materiales, contexto, filtros y diálogos. |
| `npm run test:programa-ui` | Correcto: escritorio, móvil, teclado y lector. |
| `test:providers`, `test:partidas`, `test:reports`, `test:rfi`, `test:project-locations`, `test:bitacora-convex` | Correctos. |
| ESLint de componentes y fixture nuevos | Sin errores; advertencias de Fast Refresh por las funciones auxiliares y componentes de la fixture. |
| `git diff --check` | Sin errores de espacios. |

Las pruebas aisladas usan registros, plano y documentos ficticios y deshabilitan las mutaciones de negocio. El recorrido autenticado se limitó a consulta, navegación, expansión y apertura/cancelación de formularios. No hubo cargas, eliminaciones, pagos ni cambios de permisos.

## Evidencias

- Antes: `output/responsive-audit-2026-09-30/`.
- Después en la aplicación: `output/responsive-implementation-2026-09-30/`.
- Mediciones: `output/responsive-implementation-2026-09-30/measurements.json`. Incluye capturas intermedias y fallos detectados; las entradas `final` identifican revisiones posteriores. `cards` cuenta filas optadas a la adaptación, incluso cuando se muestran como tabla en escritorio.
- Componentes y datos de prueba: `output/responsive-ui/`.
- Regresión de Requisiciones: `test-results/requisiciones-responsive/`.

Comparaciones especialmente útiles: `60-agregar-proyecto-mobile.png` → `crear-proyecto-320-final.png`, `03-presupuesto-mobile.png` → `presupuesto-final-mobile.png`, `42-control-tablet.png` → `control-1024-final.png`, `08-documentos-mobile.png` → `documentos-320-final.png`.

## Pendientes para aceptación completa

La implementación no convierte una vista vacía o en carga en una página completamente validada. Antes de cerrar la cobertura de producción quedan:

- Documentos y Flujo del proyecto de ventas con registros de prueba; estados de error/confirmación de importaciones con archivos de prueba.
- Visor con PDF real, anotaciones existentes y zoom en dispositivo físico. La revisión final de la biblioteca en la sesión disponible encontró `planos:getFoldersByProject: Not authenticated` antes de renderizar; requiere revisar la autenticación de esa consulta por separado.
- Inicio de sesión, registro e invitación con cuentas e invitación de prueba; teclado móvil físico y pantallas de poca altura.
- Cuentas de prueba para los demás roles. La comprobación de lector aislada y las pruebas de reglas no sustituyen la revisión visual de todos los permisos en una sesión real.
- Ampliar las vistas de Tareas/Bitácora y estados con adjuntos, errores y listas largas donde sólo se pudo revisar carga o un estado limitado.

Incidencias independientes del responsive: `/dashboard` usa un identificador inválido; `/legal` y `/aviso-de-privacidad` no tienen contenido. Se conservan pendientes y no se consideran reparadas por estos cambios.

No se cambiaron contratos públicos de Convex, esquemas, rutas existentes, permisos, fórmulas financieras ni composición de exportaciones. Los archivos locales previos de Requisiciones y su trabajo en curso se conservaron.
