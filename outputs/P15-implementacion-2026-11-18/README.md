# P15 · Visor de planos · Implementación

Se reúnen las acciones del archivo en «…», conservando título, estado documental, metadatos, menciones, herramientas de dibujo/selección, zoom, paginación y vuelta a biblioteca.

## Comportamiento

- Botón de 44 × 44 px con nombre accesible `Acciones del archivo: [título del plano]`.
- Grupo «Archivo»: «Descargar plano» y, si `canManagePlan` ya lo permitía, «Editar datos».
- «Eliminar plano» se muestra sólo con el permiso existente, separado al final; abre la confirmación existente. No se cambió `handleDelete`.
- La descarga conserva URL original, `download`, nombre de archivo, `target="_blank"` y `rel="noreferrer"`. Sin URL se muestra deshabilitada y sin enlace a `#`.
- El menú se cierra antes de abrir edición/confirmación. Al cancelar, pulsar Escape o terminar el guardado, el foco vuelve a «…».
- La edición reutiliza el formulario existente, precargado desde el detalle actual, con validación y estado ocupado originales.
- Abrir el menú no marca menciones ni ejecuta escrituras. El acceso independiente sigue llamándose «Menciones»: el componente consulta por proyecto, por lo que no se adoptó la etiqueta «Menciones del plano» de la maqueta.

## Archivos propios de P15

- `src/pages/Planos/PlanViewerActions.tsx`: composición del menú usando los componentes existentes, sin nuevos defaults ni CSS global.
- `src/pages/Planos/PlanosPage.tsx`: importación/integración en la rama del visor, eliminación del import Download y retorno de foco exclusivamente desde las acciones de archivo. No cambia permisos ni handlers de negocio. El diff compartido contiene además cambios de P14 ajenos a esta tarea.
- `e2e/plan-viewer/`: fixture independiente que renderiza PlanosPage real con consultas/mutaciones sustituidas en memoria, rutas propias y un archivo SVG ficticio.
- `scripts/test-plan-viewer-ui.mjs`: validación reproducible de comportamiento.

## Comprobaciones

- `npm run build`: correcto (`tsc -b` y Vite). Advertencia de tamaño de bundles existente.
- `npx eslint src/pages/Planos/PlanViewerActions.tsx src/pages/Planos/PlanosPage.tsx`: correcto.
- `node scripts/test-plan-viewer-ui.mjs`: correcto; detalle en [resultado.json](resultado.json).
- `git diff --check`: correcto. Se respetaron cambios concurrentes y no se hizo stage ni commit.
- Escritorio 1440 × 1000, móvil 390 × 844 y ancho 1024: menú dentro del viewport, sin desbordamiento horizontal, controles de 44 px y navegación por teclado/foco.
- Administrador, autor, usuario sin gestión y lector: sólo aparecen opciones permitidas; el lector conserva acceso al menú y a la descarga, a través de la protección de lectura.
- URL disponible/no disponible; descarga de archivo ficticio; edición precargada, validación, cancelación y guardado ocupado simulado en memoria; confirmación de borrado sin aplicarlo; cambio de plano y carga del detalle.
- Herramientas del visor comprobadas sin dibujar; menciones mantienen alcance por proyecto y sólo se marcan al abrir su propio centro.
- Biblioteca P14: regreso, abrir/cancelar carga y reabrir visor, conservando foco.
- Contraste del texto nuevo «Eliminar plano» verificado con los colores renderizados (mínimo 4.5:1), usando el token `danger` existente. Animación: sólo las transiciones existentes de Radix; no se añadió movimiento.

## Capturas nuevas

Todas las capturas finales muestran la UI real con datos ficticios; las PNG se toman al finalizar las animaciones.

| Estado | Escritorio | Móvil |
| --- | --- | --- |
| Visor | [1440](capturas/visor-1440.png) | [390](capturas/visor-390.png) |
| Archivo | [1440](capturas/archivo-1440.png) | [390](capturas/archivo-390.png) |
| Editar | [1440](capturas/editar-1440.png) | [390](capturas/editar-390.png) |
| Confirmar sin borrar | [1440](capturas/confirmacion-1440.png) | [390](capturas/confirmacion-390.png) |

También se incluyen capturas a 1024, las combinaciones de permisos/URL y una referencia del visor previo (`antes-*.jpg`).

## Límite de la revisión conectada

La app se inició en un puerto propio, 5215, para evitar interferir con otros chats. En la sesión disponible, Convex devolvió `Not authenticated` en `planos:getFoldersByProject` antes de mostrar la biblioteca. No se cambió autenticación ni se intentó guardar, eliminar, subir, anotar o comentar sobre datos reales. La comprobación funcional completa se realizó con el fixture aislado y sin conexión al backend.

Para repetir: ejecutar `node scripts/test-plan-viewer-ui.mjs` (inicia y cierra su servidor en el puerto 4215 y Chrome aislado). Para inspección manual: `npm run dev -- --config e2e/plan-viewer/vite.config.ts` y abrir `/e2e/plan-viewer/preview.html`.
