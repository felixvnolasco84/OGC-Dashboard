# P17 · Documentos · Implementación

Implementado el 18 de noviembre de 2026 sobre el árbol compartido. Esta carpeta contiene evidencia de código real renderizado; es independiente de las maquetas de auditoría.

## Resultado

- Un disparador «…» de 44 × 44 px por carpeta o archivo, en lista y cuadrícula.
- Nombre accesible por registro: «Acciones de la carpeta …» / «Acciones del archivo …».
- Grupo Organizar con Renombrar y Mover; separador y Eliminar con la variante destructiva existente.
- Seleccionar una acción cierra el menú antes de montar el diálogo. Se conserva el prellenado y vuelve el foco al disparador al cancelar o terminar.
- Eliminar sólo abre la confirmación; las mutaciones siguen en sus handlers actuales.
- El nombre conserva la apertura y sigue disponible el menú contextual por clic derecho, con etiquetas coherentes.
- Tarjetas de carpetas sin botones anidados. Los eventos de las acciones no abren la carpeta.
- Apertura de archivos con `noopener,noreferrer`.
- Ajustes responsive locales: tabla en ancho completo bajo `lg` y pie de Mover en dos filas en móvil. La disposición de este pie se activa únicamente desde DocumentosPage mediante una prop opcional.
- La confirmación conserva el texto de su registro durante la animación de cierre.

## Archivos de producción

- `src/pages/Documentos/DocumentosPage.tsx`: acciones por registro, integración con diálogos, cuadrícula y disposición móvil.
- `src/components/documents/DocumentFolderNavigation.tsx`: props opcionales `onCloseAutoFocus` y `footerClassName` para el diálogo existente; sus valores predeterminados no cambian.

P16, cabecera, filtros, paginación, carga, sidebar, permisos de ruta y backend quedaron fuera del cambio. No se añadieron dependencias ni se editaron componentes UI globales. Se respetaron los cambios concurrentes de otros chats.

## Comprobaciones

- `npm run build`: correcto, incluidas TypeScript y compilación Vite/PWA. Se mantienen los avisos de chunks mayores de 500 kB.
- `npm run test:project-documents`: 12 tests correctos.
- `npx eslint src/pages/Documentos/DocumentosPage.tsx src/components/documents/DocumentFolderNavigation.tsx`: 0 errores; 6 advertencias en dependencias de hooks preexistentes.
- `git diff --check` sobre los dos archivos de producción: correcto.
- 34 comprobaciones de interfaz registradas en [comprobaciones.json](comprobaciones.json), realizadas en Chrome mediante computer-use. No son un nuevo runner de pruebas automatizadas.
- Lista y cuadrícula revisadas con viewport DOM de 1440 × 1000 y 390 × 844; revisión adicional a 1024. Se comprobó el ancho efectivo en DOM, los nombres de disparador, cantidad por fila/tarjeta, ausencia de botones anidados y desbordamiento horizontal.
- Renombrar: prellenado de carpeta y documento de ventas, reinicio entre registros, ids y mutaciones distintas correctas.
- Mover: raíz, documento anidado y subcarpeta; destino inicial, confirmación deshabilitada en el mismo destino, exclusión de carpeta y descendientes, cancelación y callbacks con `folder_id` o `parent_folder_id` según tipo.
- Eliminar: confirmación específica de archivo, carpeta vacía y carpeta con contenido; sin mutación al seleccionar el menú o cancelar. Se ejecutó únicamente una llamada simulada de eliminación de carpeta no vacía para comprobar su id.
- Teclado: ArrowDown, End, Enter y Escape; retorno de foco tras cancelar los tres tipos de diálogo.
- Clic derecho conserva Renombrar y cierra el contexto al abrir el diálogo; doble clic en el menú de una tarjeta no navega.
- Apertura por nombre y navegación dentro de carpetas; archivo ficticio abrió su URL de prueba en otra pestaña. No se inspeccionó esa pestaña, porque el navegador bloquea el protocolo `about:` para automatización.
- Estados vacío y carga revisados en el ancho intermedio, sin acciones huérfanas.
- Integración autenticada en `http://localhost:5173/documentos`: doce filas reales con un único menú accesible cada una; sólo se abrió el menú.

## Datos seguros y límites

Las operaciones de edición y movimiento se ejecutaron sólo en el fixture aislado de `e2e/document-row-actions`. El alias de `convex/react` devuelve datos ficticios y registra llamadas sin conectarse a Convex ni modificar registros. [mutaciones-simuladas.json](mutaciones-simuladas.json) conserva los argumentos observados.

No se renombraron, movieron, crearon ni eliminaron registros reales. La validación autenticada usa la sesión admin existente; no se amplían permisos ni se simulan roles en producción. La restricción de carpeta vacía y las reglas de movimiento siguen siendo responsabilidad del backend existente.

Los nombres y dimensiones de las capturas distinguen los casos de 1440/390 de las capturas de ancho intermedio y de integración. Las capturas de escritorio y móvil del menú muestran la implementación real con datos ficticios; la captura `integracion-menu-real.jpg` muestra la página autenticada.

## Capturas

- [Menú de lista · 1440](capturas/lista-menu-1440.jpg)
- [Menú de lista · 390](capturas/lista-menu-390.jpg)
- [Cuadrícula · escritorio](capturas/cuadricula-escritorio.jpg)
- [Menú de cuadrícula · 390](capturas/cuadricula-menu-390.jpg)
- [Renombrar · 390](capturas/renombrar-390.jpg)
- [Mover carpeta · 1440](capturas/mover-carpeta-1440.jpg)
- [Mover · 390](capturas/mover-390.jpg)
- [Eliminar carpeta · 1440](capturas/eliminar-carpeta-1440.jpg)
- [Lista · ancho intermedio](capturas/lista-intermedio.jpg)
- [Vacío · ancho intermedio](capturas/vacio-intermedio.jpg)
- [Carga · ancho intermedio](capturas/carga-intermedio.jpg)
- [Integración autenticada](capturas/integracion-menu-real.jpg)
