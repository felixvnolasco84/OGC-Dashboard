# P13 · Cabecera del detalle RFI

Implementación real del punto aprobado, verificada el 18 de noviembre de 2026. Estas capturas son nuevas y están separadas de las simulaciones de la auditoría.

## Cambios

- `RFIDetailPage.tsx`: Cambiar a abierta conserva `startReview("open", ...)`; Editar RFI pasa al menú secundario condicionado por `permissions.can_edit`, con teclado, nombre contextual y controles de 44 px. La edición se ejecuta al terminar de cerrar el menú, mediante callback embedded o navegación a la ruta de edición.
- `rfiActionReviewModel.ts`: etiqueta de apertura coherente para cabecera, título y confirmación; etiquetas del flujo compartidas con la revisión.
- `RfiActionReview.tsx`: reutiliza esas etiquetas sin cambiar el flujo de revisión.
- El estado del workflow permanece en la cabecera fuera de las pestañas. Las condiciones derivadas se muestran aparte, por ejemplo Abierta / Seguimiento: Vencida. Se conservan colores de borde e iconos, con texto neutral legible.
- Fixture propio en `e2e/rfi-header`, puerto 4207. Sin cambios en `RFIListPage.tsx`, fixtures de P12, rutas, backend o permisos.

## Comprobaciones

- `npm run build`: correcto (`tsc -b && vite build`). Log completo en [build.log](build.log). Vite advierte sobre paquetes mayores de 500 kB.
- `npm run test:rfi`: correcto.
- `npm run test:rfi-transitions`: 19 pruebas correctas.
- `git diff --check` sobre los tres archivos de producción: correcto.
- Chrome mediante computer-use: página completa, Sheet aislado y Sheet/editor reales de `RFIListPage`, todos con fixture local independiente.
- Confirmado por teclado: flecha abre el menú y selecciona Editar RFI; Escape cierra y devuelve foco al trigger; Enter ejecuta edición con el menú ya cerrado.
- Abrir menú, navegar al editor, abrir revisión o cancelar: ninguna llamada de transición.
- Revisión desactualizada: confirmación deshabilitada hasta Actualizar revisión. Tras actualizar, una única llamada `rfis:openRfi`, `id: rfi`, con `expected_review` exactamente igual al snapshot revisado.
- Sin asignados o sin fecha: revisión muestra la guarda y no permite confirmar.
- Busy: Escape no cierra revisión; confirmación, cancelación y edición deshabilitadas. Error: se conserva revisión y se enfoca la alerta. Cancelación devuelve foco al botón; tras apertura, el fallback es la cabecera si desaparece el botón.
- Permisos: no se monta menú vacío; revocar sólo edición conserva Cambiar a abierta si `can_open` sigue permitido. Borradores, abiertas y cerradas no muestran esa transición.
- Estado visible en General, Respuestas e Historial. Abierta / Vencida se distinguen. Se conservan acciones de respuesta, revisión, cierre, reapertura y confirmación de eliminación de borrador; no se confirmó ningún borrado.
- Responsive final del detalle embedded: 1440 × 1000, 1024 × 1000 y 390 × 844 CSS, sin desbordamiento de página o cabecera. Dimensiones y resultados en [validacion.json](validacion.json). La escala de pantalla de 1.1 se compensó al fijar el viewport. Las capturas iniciales «antes» usan los anchos representativos iniciales del navegador.
- Inspección de consulta en la aplicación autenticada: RFI-003 de Lote 77 muestra etiqueta, menú y estado persistente. Se abrió el detalle y se navegaron pestañas; se conserva su efecto existente de marcado de lectura. No se ejecutaron transiciones, edición, respuestas, cargas ni borrado reales.
- Sin errores de consola en el fixture al comprobar la integración. Se reutilizan las animaciones existentes de DropdownMenu/Dialog; no se añade movimiento.

## Evidencia

- [Aplicación real: menú](aplicacion-real-menu.jpg)
- [Escritorio: Sheet del listado real con datos simulados](integracion-listado-desktop-menu.jpg)
- [Editor embedded real abierto desde el menú](integracion-listado-editor.jpg)
- [Detalle embedded a 1440](embedded-desktop.jpg), [1024](embedded-intermedio.jpg) y [390](embedded-movil.jpg)
- [Menú móvil](embedded-movil-menu.jpg)
- [Página completa: menú escritorio](despues-desktop-menu.jpg) y [móvil](despues-movil-menu.jpg)
- [Estado en Historial](estado-historial-movil.jpg), [Abierta / Vencida](estado-abierta-vencida-movil.jpg)
- [Revisión móvil](revision-movil.jpg), [revisión desactualizada](revision-desactualizada-desktop.jpg), [busy](embedded-busy.jpg), [error](embedded-error.jpg)
- [Antes escritorio](antes-desktop.jpg) y [antes móvil](antes-movil.jpg)

Las pruebas de operaciones usan datos simulados; no sustituyen una validación de mutations contra producción. No se implementaron otros puntos de la auditoría. Los cambios concurrentes visibles en otros módulos se dejaron intactos.
