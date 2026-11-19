# P16 · Cabecera y vista de Documentos

Implementación y revisión del 19 de noviembre de 2026. Alcance: Documentos global y Documentos de obra.

## Cambios

- Un menú principal “Agregar” contiene “Subir documentos” y “Nueva carpeta”. Reutiliza Button y DropdownMenu existentes, sin dependencias ni cambios de estilo global.
- Selector compacto con texto visible “Lista” y “Cuadrícula”, estado seleccionado y `aria-pressed`, usando el `viewMode` existente.
- El menú se cierra y libera su ámbito de foco antes de abrir un diálogo. Los diálogos continúan montados fuera del menú; al cerrarlos se devuelve el foco al botón persistente “Agregar”. El botón queda deshabilitado mientras su diálogo está abierto.
- En móvil, obra conserva “Agregar” y el total en una fila.
- Los manejadores de cada página se reutilizan: se limpian `draftName` y `folderDialogParentId` al abrir Nueva carpeta. Obra conserva `handleUploadClick` y `onOpen(projectId, { folderId: currentFolderId })`. Global conserva su contrato `useUploadDocumentsModal.onOpen()` y la asociación existente de carga a proyecto/transacción.

Archivos de producto:

- `src/components/documents/DocumentHeaderControls.tsx`
- `src/pages/Documentos/DocumentosPage.tsx` — sólo cabecera, selector e imports de P16.
- `src/pages/ProyectoDocumentos/ProyectoDocumentosPage.tsx` — sólo cabecera, selector e imports de P16.

Se preservaron las ediciones concurrentes del pie del formulario de Documentos (P23). P16 no modificó los menús por registro, tablas, navegación, permisos, backend ni modales de carga.

## Verificación

- `npm run build -- --outDir outputs/P16-implementacion-2026-11-19/build`: pasó `tsc -b`, Vite y generación PWA. El outDir es exclusivo para evitar interferir con compilaciones concurrentes. Registro: [build.log](build.log). Vite conserva el aviso de tamaño de algunos chunks.
- `npm run test:project-documents`: 12 pruebas aprobadas.
- ESLint del nuevo componente: pasó.
- `git diff --check` de las páginas: pasó; sólo advertencia de normalización LF/CRLF de Git.
- 20 comprobaciones de interfaz con resultados aprobados en [ui-results.json](ui-results.json).
- Consola del fixture al concluir: sin errores capturados.

Se usaron páginas, modales y guardas reales en `e2e/document-header`, con Convex y Clerk simulados. Viewports CSS comprobados en DOM: 1440×1000 y 390×844; el ajuste del navegador compensó su escala de 110 %. No se observó desbordamiento horizontal en las cabeceras comprobadas. Se restauró el viewport al terminar y se cerró únicamente el servidor de P16.

Comportamientos comprobados: apertura por teclado y ratón; cierre del menú antes del diálogo; nombre vacío deshabilitado; borrador limpio al reabrir; cancelación y foco; raíz y carpeta anidada; Lista/Cuadrícula; filtros de proyecto/tipo conservados al cambiar vista; panel Sheet de carpetas móvil; total, carga y vacío; lector sin acceso, biblioteca protegida para admin y alcance de proyecto denegado.

Las llamadas simuladas de Nueva carpeta conservaron `parent_folder_id: "folder-parent"` en ambos contextos; obra agregó `proyecto: "obra"` y global no agregó ningún proyecto ajeno. La carga de obra conservó `proyectoId: "obra"` en raíz y añadió `folderId: "folder-parent"` al estar dentro de esa carpeta. Abrir menús y cancelar no ejecutó mutaciones.

## Capturas principales

| Contexto | Escritorio | Móvil |
| --- | --- | --- |
| Global, lista | [Lista](global-lista-escritorio.jpg) | [Lista](global-lista-movil.jpg) |
| Global, Agregar | [Menú](global-agregar-escritorio.jpg) | [Menú](global-agregar-movil.jpg) |
| Global, cuadrícula | [Cuadrícula](global-cuadricula-escritorio.jpg) | [Cuadrícula](global-cuadricula-movil.jpg) |
| Obra, lista | [Lista](obra-lista-escritorio.jpg) | [Lista](obra-lista-movil.jpg) |
| Obra, cuadrícula anidada | [Cuadrícula](obra-cuadricula-anidada-escritorio.jpg) | [Cuadrícula](obra-cuadricula-anidada-movil.jpg) |
| Obra, carga | [Carpeta anidada](obra-carga-anidada-escritorio.jpg) | [Raíz](obra-carga-raiz-movil.jpg) |

Otros estados: [Nueva carpeta global](global-carpeta-anidada-movil.jpg), [Nueva carpeta de obra](obra-carpeta-anidada-escritorio.jpg), [panel móvil](global-panel-carpetas-movil.jpg), [lector bloqueado](obra-lector-bloqueado-movil.jpg), [carga global](global-cargando-movil.jpg), [carga de obra](obra-cargando-movil.jpg), [vacío global](global-vacio-lista-movil.jpg), [vacío de obra](obra-vacio-cuadricula-movil.jpg).

## Límites

La app conectada en `localhost:5173` no estaba disponible. La validación visual corresponde a los componentes reales con datos ficticios, no a una sesión autenticada del backend ni al simulador de la auditoría. No se crearon carpetas reales ni se seleccionaron o subieron archivos. El estado de transferencia activa se conservó en los modales existentes y no se inició una carga para forzarlo. Las dos llamadas de creación usadas en la revisión fueron stubs que sólo registraron argumentos.

Se mantuvieron los tokens, tipografía y componentes existentes; no se añadieron animaciones. Los menús y diálogos conservan las transiciones del sistema.
