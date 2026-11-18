# P10 · Requisiciones · Cabecera

Implementación del 18 de noviembre de 2026 en el árbol de trabajo compartido.

## Resultado

- «Nueva requisición» queda visible como acción principal para admin, user y contratista.
- El disparador «Acciones de requisiciones» abre el grupo «Seguimiento»: Historial para todos los roles que ya acceden a la página y Notificaciones sólo para admin/finance.
- El indicador contiguo suma el mapa existente de avisos sin leer del destinatario actual en el proyecto. No aparece durante carga ni con cero avisos. Su descripción accesible expresa que son notificaciones sin leer.
- El menú cierra antes de abrir cualquiera de los dos accesos. Historial conserva el modo global y el proyecto actual; Notificaciones sólo abre el diálogo existente. Ambos devuelven el foco al disparador al cerrar.
- El estado nuevo del menú y cualquier apertura pendiente se restablecen al cambiar de proyecto, usuario o rol.
- Controles de 44 px, colores y tipografía existentes; sin animaciones nuevas. Se conservan las transiciones de los componentes compartidos.

## Archivos de P10

- `src/pages/ProyectoRequisiciones/ProyectoRequisicionesPage.tsx`: cabecera, indicador, cierre del menú y retorno de foco de Notificaciones.
- `src/components/modals/RequisicionHistoryModal.tsx`: soporte opcional de foco para la apertura global desde la cabecera, Escape, ciclo de Tab y nombre accesible del cierre. Se conserva su overlay manual y sus consultas.
- `scripts/test-requisiciones-ui.mjs`: selectores actualizados para los accesos que ahora son menuitems.
- `scripts/test-requisiciones-header-ui.mjs`: comprobaciones de interacción, permisos y ausencia de escrituras en fixtures.
- `e2e/requisiciones/header-preview.html`, `header-preview.tsx` y `header-convex-stub.ts`: entorno seguro para esos casos.

Las demás modificaciones del árbol pertenecen a otros trabajos. No se modificaron el backend, la protección de ruta, los controles de sólo lectura del layout, los formularios, los filtros, las tarjetas ni el sidebar.

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| `npm run build` (`tsc -b && vite build`) | Pasó. Advertencia de tamaño de chunks. |
| `npm run test:requisiciones-ui` | Pasó a 320, 390, 768, 1024, 1440 y 1536 px. |
| `node scripts/test-requisiciones-header-ui.mjs` | Pasó a 390, 1024 y 1440 px, con cinco roles. |
| `npm run test:requisicion-notifications` | Pasó. |
| `git diff --check` de los archivos modificados por P10 | Pasó. |

La primera ejecución de build coincidió con errores transitorios en `RFIListPage.tsx`, que estaba siendo editado en otro trabajo. La segunda ejecución pasó sin editar ese archivo desde P10.

Los checks de cabecera comprueban flechas, Enter, Escape, Tab/Shift+Tab en el historial manual, reapertura, retorno de foco de Historial y Notificaciones, historial global con `requisicionId: null`, proyecto correcto, ausencia de bloqueo de puntero residual, totales, pestañas, filtros, avisos cero/positivos/uno/cargando y cierre al cambiar de rol o proyecto. El registro de mutations/actions se mantiene vacío al abrir y cerrar estos accesos. Resultado estructurado: [fixtures/results.json](fixtures/results.json).

| Rol simulado | Crear | Historial | Notificaciones |
| --- | --- | --- | --- |
| admin | Sí | Sí | Sí |
| finance | No | Sí | Sí |
| user | Sí | Sí | No |
| contratista | Sí | Sí | No |
| almacenista | No | Sí | No |

Se comprobó también que almacenista conserva la pestaña Pagadas. Los fixtures no sustituyen los permisos del backend; estas reglas no se cambiaron.

## Evidencia real

En la sesión autenticada disponible de Lote 77 se abrieron y cerraron el formulario real de creación, el historial global y el diálogo de Notificaciones. No se guardaron requisiciones, enviaron comunicaciones ni cambiaron configuraciones o estados. Total observado: 115; monto total: $4,135,252.44; indicador: 25 avisos sin leer, conservado después de las aperturas.

Anchos CSS comprobados en el DOM: 390 × 844, 1024 × 1000 y 1440 × 1000. Sin desbordamiento horizontal de la página. La barra de pestañas conserva su desplazamiento horizontal existente. El navegador tenía escala 1.5; se ajustó el viewport de captura para obtener esos anchos CSS y se restableció al terminar. Los archivos con `css960` o `css260` documentan las primeras observaciones a esos anchos efectivos.

- [Cabecera de escritorio](despues-cabecera-1440.jpg)
- [Menú de escritorio](despues-menu-1440.jpg)
- [Cabecera intermedia](despues-cabecera-1024.jpg)
- [Cabecera móvil](despues-cabecera-390.jpg)
- [Menú móvil](despues-menu-390.jpg)
- [Historial real móvil](historial-real-390.jpg)
- [Notificaciones reales móvil](notificaciones-real-390.jpg)
- [Formulario real móvil](nueva-requisicion-real-390.jpg)

Limitación: la sesión real disponible permitió validar admin. Finance, user, contratista, almacenista y los cambios de estado de carga/rol/proyecto se comprobaron con fixtures locales. El formulario usa su store real en el fixture y una vista simulada; su apertura y cancelación se comprobaron además en la app real. Las pruebas aíslan Convex y sirven el logo desde disco; no realizan transporte externo.
