# Programa de Obra: revisión de ponderaciones

Implementación local del 13 de octubre de 2026. Las comprobaciones de navegador utilizan la página y los componentes reales con datos ficticios aislados; no se modificó ningún proyecto real ni se realizó un despliegue.

## Problema resuelto

El Sheet tenía Guardar y Cancelar, pero no explicaba cómo el nuevo peso modificaba el avance de la partida o del proyecto. Los controles inline con guardado al perder foco estaban ocultos: se comprobó en navegador que no eran visibles y se retiró esa ruta residual.

Ahora se puede comparar el peso vigente, la participación efectiva y los avances real/planeado antes de guardar. La interfaz distingue un promedio ponderado de un cálculo provisional y explica si esa provisionalidad viene de niveles inferiores.

## Comportamiento

- Partida: compara su participación y el avance general del proyecto.
- Familia: compara su participación dentro de la partida y los avances de la partida y del proyecto.
- Se consideran todos los elementos pertinentes, aunque haya filtros activos o filas contraídas. Se utiliza `summarizeProgram` y el calendario original, sin redondear entradas ni usar fechas proyectadas del listado.
- Los pesos admiten decimales entre 0 y 100. La suma no necesita ser 100. Un peso cero no se confunde con un peso ausente; si falta algún peso válido o la suma es cero, el grupo utiliza promedio simple.
- Revisar, Cancelar, cerrar y Escape no persisten cambios. Enter en el campo no guarda. Los valores sin cambios no generan escrituras, versiones ni eventos.
- Durante el envío se bloquean edición y cierre. Se evita doble envío y el servidor no registra otra operación si el peso solicitado ya está vigente.
- Los errores conservan el borrador y requieren una nueva revisión antes de reintentar. Si se pierde una respuesta después de guardar, la revisión actualizada muestra el peso vigente y evita una segunda escritura.
- Los permisos de la interfaz coinciden con el servidor: escritura y acceso al proyecto; con configuración se exige `plan`, y sin configuración acceso administrativo. Se rechazan destinos inexistentes, archivados, familias de nivel distinto de 2 y relaciones inválidas.
- El peso vigente cambia; el progreso físico capturado, la liberación y la línea base aprobada se conservan.

## Protección de la revisión

`programa_obra.previewWeightChange` es una consulta de solo lectura. Calcula el estado anterior/propuesto y entrega una huella SHA-256 de los datos completos, vinculada al proyecto. El token de guardado también se vincula al destino y al peso propuesto.

Las mutaciones `updateSchedulePeso` y `updateDetallePeso` exigen `review_token`, recalculan la revisión y comprueban su vigencia dentro de la transacción antes de escribir. La huella incluye pesos, avances, pertenencia, estado archivado, fechas, calendario, liberación y fecha de corte de Ciudad de México. Funciona sin configuración/versionado. Un conflicto conserva el borrador y obliga a revisar los datos actualizados.

No se añade esquema ni se crea configuración o historial aprobado al previsualizar.

## Validación

| Comprobación | Resultado |
|---|---|
| `npm run test:programa` | Reglas de hitos y ejecución, más 51 pruebas de handlers/helper: pasan. |
| `npm run test:programa-weight-ui` | Escritorio 1440 px, móvil 390/320 px, teclado, foco, filtros, cancelación, permisos, errores, conflictos, doble envío, respuesta perdida y transiciones provisionales: pasan. |
| `npm run test:programa-ui` | Regresión de captura, actividades/frentes, Gantt y lector: pasa. |
| `npm run test:programa-export-ui` | Regresión PDF, selección, filtros, cancelación, errores, scroll, móvil y lector: pasa. |
| Tipos de aplicación y Convex | Pasan. |
| ESLint de los nuevos archivos de producción | Pasa. |
| `npm run build` | Pasa; Vite conserva advertencia sobre tamaño de chunks. |
| Reglas de reportes | Las mismas aserciones del script pasan al empaquetarlo con esbuild. El comando habitual falla por un import sin extensión de `ingresoRules` en `permissions.ts`, ajeno a este cambio. No se modificó esa configuración. |

El harness de exportación se adaptó al nuevo import de estado de conexión de comentarios y su selector identifica específicamente hitos, dado que los comentarios ahora también son botones. Esos cambios del flujo de comentarios pertenecen a otra conversación.

Los registros de las comprobaciones y `ui-results.json` están en `output/programa-weight-impact/`.

## Alcance pendiente separado

Control y WIP mantienen sus fórmulas previas, que difieren con pesos ausentes, selección de detalles y elementos archivados. Esta entrega no promete igualdad de esos KPIs con Programa. Los reportes basados en `summarizeProgram` comparten las reglas de cálculo de la revisión, con su propia fecha de corte.

Quedan fuera edición de shares de frentes, importación Excel, ponderación de distribución financiera, pagos, partidas de presupuesto, honorarios y RFIs.

## Entregables

- Texto independiente para compartir: `output/programa-weight-impact/MENSAJE-PARA-RO.txt`.
- Capturas reales del navegador: carpeta `output/programa-weight-impact/` y archivo `Capturas-ponderaciones-programa.zip`.
- Las imágenes `baseline-*` documentan el flujo anterior. Las demás muestran la implementación con datos ficticios.
