# P12 · RFIs · Estados compactos y Continuar visible

Implementación del 18 de noviembre de 2026, limitada al registro de RFIs y su creación rápida.

## Comportamiento final

- Un selector **Estado** con Todas, Abiertas, Vencidas, Borradores y Cerradas. Cada opción conserva su contador global.
- **Mi responsabilidad** es un botón con estado pulsado accesible. Se combina por intersección con Estado y búsqueda. Para ver todas las RFIs propias se usa Estado = Todas; al desactivarlo se vuelve a la categoría completa.
- Los totales del registro permanecen independientes de la búsqueda. **Resultados** identifica la cantidad que coincide con los filtros actuales.
- **Nueva RFI** y el acceso contextual **Agregar RFI** abren el mismo formulario rápido, exclusivamente cuando `formOptions.can_create` lo permite.
- La creación rápida conserva asunto y pregunta obligatorios, solicitante, responsables, fecha, contexto de adjuntos y estado de borrador. Sus campos tienen etiquetas persistentes y sus acciones muestran **Cancelar** y **Continuar**.
- Antes de continuar aparece: «Al continuar se creará un borrador y se abrirá el editor para completar la RFI.» Se conserva `submit_for_review: false` y la apertura del editor existente al resolver la creación.
- Mientras se crea se muestra **Creando...**, los campos y las dos acciones quedan bloqueados, Enter no duplica la llamada y Escape no simula una cancelación de la operación en curso.
- Enter desde asunto lleva a pregunta. Enter desde pregunta crea el borrador con la validación existente. Cancelar/Escape limpia los campos y devuelve el foco a Nueva RFI. Un error conserva los datos para reintentar.
- Cambiar proyecto restablece filtros, búsqueda, creación y panel abierto. La pérdida del permiso de creación limpia el formulario; una respuesta tardía no abre un editor ni muestra éxito de un contexto anterior.

No se modificaron rutas, backend, permisos, transiciones de detalle, formulario completo, sidebar ni componentes UI globales.

## Archivos de P12

- `src/pages/RFIs/RFIListPage.tsx`: implementación real.
- `e2e/rfi/convex-stub.ts`: casos optativos `?list`, seis registros con estados y responsabilidades diferentes, captura de argumentos, permisos y retrasos simulados. Sin `?list` se mantiene el fixture de detalle existente.
- `e2e/rfi/list-preview.html` y `list-preview.tsx`: página local de validación con el listado y sus paneles reales, bajo StrictMode.
- `e2e/rfi/vite.config.ts`: incluye la nueva entrada en la optimización del fixture.
- `scripts/test-rfi-list-ui.mjs`: validación reproducible con Chrome headless y servidor local exclusivo en el puerto 4216.

## Verificación

- `npm run build`: aprobado, incluido TypeScript y build Vite/PWA. Registro completo en [build.log](build.log). Vite conserva el aviso de chunks mayores de 500 kB.
- `npm run test:rfi`: aprobado.
- `npm run test:rfi-transitions`: 19 pruebas aprobadas.
- `node node_modules/eslint/bin/eslint.js src/pages/RFIs/RFIListPage.tsx`: aprobado.
- `git diff --check` de los archivos rastreados de P12: aprobado.
- `node scripts/test-rfi-list-ui.mjs`: ocho grupos aprobados y ningún error de página. Resultado y argumentos de creación en [verificacion-ui.json](verificacion-ui.json).

Los checks de interfaz cubren 1440 × 1000, 1024 × 1000 y 390 × 844: selector por ratón y teclado; responsabilidad sola/combinada; abiertas que incluyen pendientes de revisión; vencidas derivadas; borradores/cerradas; búsqueda por código, asunto, pregunta, ubicación, partida, familia, subpartida y nombres resueltos de manager/asignados; contadores globales; vacío/sin resultados/carga/sin acceso/proyecto ausente; permisos finance/viewer; etiquetas, foco, validación, responsables y fecha; cancelación; error y reintento; una sola llamada de creación; apertura del editor real; cambios de proyecto y de permiso, incluso durante una operación.

También se revisó manualmente la app autenticada en una pestaña propia de Chrome: filtros y creación rápida vacía en escritorio y móvil, alcance de las dos acciones por teclado y cancelación. Se restauró el tamaño del navegador. **No se crearon borradores ni se ejecutaron mutations sobre datos reales.**

## Capturas de la implementación

Todas estas imágenes nuevas proceden del fixture local con componentes reales y datos simulados; son distintas de las propuestas estáticas de la auditoría.

| Vista | Escritorio | Intermedia | Móvil |
| --- | --- | --- | --- |
| Registro y filtros | [1440](registro-1440.png) | [1024](registro-1024.png) | [390](registro-390.png) |
| Creación rápida: campos y acciones | [1440](creacion-rapida-1440.png) | [1024](creacion-rapida-1024.png) | [390](creacion-rapida-390.png) |
| Vencidas y Mi responsabilidad | [1440](vencidas-mias-1440.png) | [1024](vencidas-mias-1024.png) | [390](vencidas-mias-390.png) |
| Sin resultados | [1440](sin-resultados-1440.png) | [1024](sin-resultados-1024.png) | [390](sin-resultados-390.png) |

Otros estados: [creando](creando-1440.png), [editor tras continuar](editor-tras-continuar-1440.png), [error recuperable](error-reintentable-1440.png), [registro vacío](registro-vacio-1440.png), [carga](cargando-1440.png) y [sin acceso](sin-acceso-1440.png).

## Límites observados

La tabla original conserva columnas con anchos mínimos que pueden desbordar el área central a 1440 px cuando el sidebar está abierto. Ese comportamiento ya existía y permanece fuera de este cambio acotado: los filtros y el nuevo formulario rápido sí se ajustan al área disponible. La tabla y sus rutas/aperturas de detalle se conservaron.

Las mutations se comprobaron exclusivamente con mocks; las pruebas de reglas y transiciones sí se ejecutaron localmente. Los demás cambios concurrentes del árbol de trabajo se respetaron y no forman parte de P12.
