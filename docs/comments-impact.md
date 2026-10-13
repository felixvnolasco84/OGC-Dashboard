# Comentarios de Bitácora y Programa

Implementación local del 13 de octubre de 2026. No se desplegó ni se modificaron datos de producción.

## Problema resuelto

La eliminación de comentarios ocurría inmediatamente al pulsar la papelera. No había una revisión que identificara el comentario y su destino. Las ediciones ya tenían guardar/cancelar, pero no mostraban claramente el contenido que se sustituiría ni protegían el borrador al cerrar o cambiar de fotografía. En Programa, los errores solo se enviaban a la consola. Además, la UI de Bitácora mostraba acciones para comentarios de otros autores que el servidor rechazaba.

## Comportamiento entregado

- Publicar conserva un solo paso: el formulario muestra el destino y, en Programa, las fechas y su relación con el Gantt y futuras exportaciones.
- Editar muestra el texto original y la propuesta; las fechas originales aparecen junto al texto en Programa. Guardar sin cambios no llama mutaciones.
- Eliminar abre una confirmación con autor, fecha, texto completo y fotografía o partida/familia. Cancelar/Escape no escribe. El foco inicia en Cancelar y vuelve al control de origen o al resultado si el comentario desapareció.
- Cerrar, cancelar o sustituir una edición con cambios requiere descartarlos explícitamente. El aviso permite seguir editando. La protección se aplica al cierre de panel/galería, Escape, clic exterior, miniaturas y botones de navegación. Las flechas no navegan fotos mientras se escribe o está abierto el panel de comentarios.
- La foto seleccionada se mantiene por identidad, incluso si la lista se reordena. Cambiar de foto desmonta la conversación solo después de resolver el borrador.
- Una operación en curso conserva borrador y destino; bloquea cambios y envíos repetidos. Cerrar no cancela una solicitud ya enviada.
- Los fallos muestran feedback visible y conservan texto/fechas. Una pérdida de conexión mantiene abierto el editor y deshabilita escrituras. Los borradores son memoria de la sesión, no una cola offline; el navegador advierte antes de recargar/salir cuando hay cambios.
- Los marcadores de comentarios del Gantt son botones operables con teclado, con foco visible, nombre accesible, estado expandido y área de interacción mínima de 44 px de ancho.

## Permisos y validación

Bitácora conserva alta para admin/user/finance/contratista; editar/eliminar corresponde al autor o al rol admin, con acceso al proyecto y exclusión de viewer. No se amplía este permiso por correos de superadministrador. Publicar y gestionar un comentario se calculan por separado: el permiso de alta no sustituye la regla de autoría de registros existentes.

Programa conserva escritura compartida para los roles aceptados por `assertCanWrite`, excluyendo viewer y almacenista; no se impone autoría. Su panel aplica permisos explícitos, incluso cuando se renderiza en un portal. El menú permite consultar comentarios a viewer y bloquea su acceso a Editar programa.

Cliente y backend validan texto después de trim, obligatorio y de hasta 5.000 caracteres. Programa exige fechas reales con formato estricto y orden inicio <= fin; admite intervalos de un día y fechas fuera del periodo del elemento con aviso de posible ampliación de la escala temporal. El backend normaliza fechas a DD/MM/YYYY. No se imponen fechas relativas a hoy.

Las mutaciones verifican el destino nuevamente: fotografías activas de Bitácora con reporte activo y proyecto coincidente; partida/familia activa del mismo proyecto, y padre activo de la familia. La edición/eliminación exige el ID de destino revisado además del ID de comentario. Las lecturas de comentarios no exponen contenido si se pierde acceso o el destino deja de estar disponible.

## Concurrencia y persistencia

Se añadió `revision` opcional a ambas tablas de comentarios. Los registros antiguos se consideran versión 1; no requieren reescritura masiva. Editar y eliminar exigen la revisión que se mostró al usuario. Una edición real incrementa la revisión. El backend rechaza solicitudes antiguas que omiten este control.

Si la consulta reactiva detecta un cambio, el editor conserva la propuesta y muestra la versión nueva. El usuario debe revisarla explícitamente antes de guardar. Una confirmación de borrado obsoleta debe cancelarse y abrirse de nuevo. Una eliminación remota cierra la confirmación pendiente; el borrador de una edición eliminada permanece disponible para copiar o descartar.

`comment_operation_receipts` registra actor, proyecto, identificador de operación, hash SHA-256 de la solicitud, ID de resultado y fecha. Solicitud y recibo se escriben en la misma mutación. Los reintentos reutilizan la clave y recuperan el resultado, incluyendo después de borrar físicamente un comentario. Reutilizar una clave con otra solicitud se rechaza. Se vuelve a comprobar acceso/rol antes de consultar el recibo.

Los recibos no almacenan texto ni fechas de comentarios y no permiten restauración. Se conservan sin caducidad automática para mantener la garantía de reintento durante esta versión; consumen almacenamiento proporcional al número de operaciones. Un futuro borrado/purgado de proyectos debe contemplar esta tabla antes de establecer una política de eliminación de recibos. No se añadió historial, soft delete ni Deshacer.

El uso de Web Crypto en el runtime se comprobó contra la [documentación oficial de Convex](https://docs.convex.dev/functions/runtimes).

## Alcance y efectos

Los cambios afectan `photo_comments` y `programa_obra_comentarios`. El campo Retos / Incidencias del reporte, descripciones de fotografías y cola IndexedDB de reportes/adjuntos conservan sus contratos. Algunas rutas heredadas crean un comentario inicial a partir de una descripción; siguen siendo registros separados y no se sincronizan entre sí.

Programa mantiene su escala temporal derivada de fechas de comentarios. La consulta reactiva actualiza texto y fechas en el Gantt y elimina el marcador cuando se borra su comentario. Los futuros PDF con avisos siguen recogiendo los comentarios del árbol completo del programa, aunque el desglose visual tenga selección. No se cambió esa selección ni archivos PDF ya generados. Las mutaciones de comentarios no actualizan avances, fechas de ejecución, pesos, presupuesto ni pagos.

## Archivos principales

- `src/components/comments/CommentThread.tsx`: editor compartido, comparación, estados, confirmaciones, foco y borradores.
- `src/components/Bitacora/BitacoraGalleryModal.tsx`: contexto de foto y navegación por identidad.
- `src/pages/Programa Obra/ProgramaObraComentarios.tsx`: integración de partida/familia, fechas, conexión y permisos.
- `src/pages/Programa Obra/ProgramaObra.tsx`: acceso de consulta y montaje del panel por destino.
- `src/pages/Programa Obra/ProgramaObraGanttItem.tsx`: accesibilidad del marcador de comentario.
- `src/components/ui/alert-dialog.tsx`: opción de z-index para el overlay de confirmaciones anidadas; los usos existentes conservan sus valores por defecto.
- `convex/bitacora.ts`, `convex/programa_obra.ts`, `convex/commentRules.ts`, `convex/commentOperations.ts`, `convex/schema.ts`: contratos de persistencia.
- `convex/comments.test.mjs`, `vitest.comments.config.ts`, `e2e/comments/*`, `scripts/test-comments-ui.mjs`: verificaciones aisladas.

Se preservaron las modificaciones de otros temas, incluidas las de ponderaciones que se incorporaron concurrentemente en archivos compartidos. No se crearon commits ni worktrees.

## Verificación

- `npm run test:comments`: 25 pruebas aprobadas. Incluye handlers reales, argumentos API y esquema con convex-test; permisos, revisiones antiguas, tombstones, padres archivados, destinos cruzados, texto/fechas, idempotencia, no-op e invariantes de reportes/presupuesto/ejecución.
- `npm run test:comments-ui`: 21 grupos aprobados con Chrome, componentes reales y transporte simulado. Escritorio 1440 px y móvil 390/320 px; 30 capturas PNG.
- 48 pruebas del repositorio offline de Bitácora y 50 de ejecución de Programa aprobadas.
- Reglas de Programa y regresión PDF aprobadas, incluyendo selección, avisos, cancelación, fallo, restauración de scroll, móvil y viewer.
- Las aserciones existentes de reglas Bitácora y reportes se ejecutaron dentro de `test:comments`. Sus comandos originales con Node strip-types fallan por imports sin extensión ya existentes en `permissions.ts`; el runner de Vitest las resuelve y valida sin cambiar esos módulos.
- TypeScript frontend/backend sin errores. ESLint focalizado sin errores ni advertencias de código; queda el aviso global existente de configuración Tailwind de shadcn. `git diff --check` sin errores.

Estas pruebas no escriben en servicios reales. Las capturas muestran los componentes de la aplicación con datos simulados; la fotografía de prueba es ilustrativa. La comprobación de lector de pantalla cubre semántica y anuncios programáticos, no una sesión manual con NVDA/VoiceOver.

## Entrega y activación

El texto para compartir y las capturas están en `output/comments-impact`. Para activar en un entorno publicado se debe desplegar el esquema/backend junto con el frontend y solicitar recarga de clientes antiguos, que no incluyen revisión/operación en sus solicitudes. Este trabajo no realizó el despliegue.
