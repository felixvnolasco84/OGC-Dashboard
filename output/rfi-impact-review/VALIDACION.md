# Revisión de acciones de RFI

Implementación local verificada el 12 de octubre de 2026. Las capturas usan las páginas reales de RFI con un adaptador de Convex en memoria; no contienen datos de producción. No se desplegó ni se modificaron RFIs reales.

## Comportamiento implementado

- Abrir, cerrar y marcar una respuesta oficial muestran una revisión con identidad, estado y consecuencias. Cerrar incluye el texto completo de las respuestas oficiales; marcar incluye la respuesta seleccionada y sus adjuntos.
- Enviar a revisión y reabrir muestran el efecto junto a su botón. La creación y la edición de borradores incluyen responsable, archivos y cambios propuestos. El resumen compacto permanece visible en el pie del formulario.
- Un cambio concurrente invalida la revisión. Actualizarla requiere una acción explícita; el servidor compara la información revisada antes de escribir y vuelve a comprobar permisos y estado.
- Las acciones pendientes bloquean nuevos envíos y el cierre accidental del diálogo o panel. Cancelar devuelve el foco; los errores permanecen visibles y reciben foco.
- Si falla una carga después de guardar/enviar, se muestra el resultado parcial. El reintento completa sólo los archivos pendientes sobre la misma RFI y evita volver a crear o enviar.

Se conservan las reglas actuales: puede haber varias respuestas oficiales, marcar no cierra, cerrar requiere al menos una oficial, y reabrir conserva las respuestas, los asignados y la fecha límite.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | Correcto; aviso de Vite por tamaño de algunos paquetes |
| `npm run typecheck:convex` | Correcto |
| `npm run test:rfi` | Correcto |
| `npm run test:rfi-transitions` | 19 pruebas correctas sobre los handlers reales, con datos en memoria |
| TypeScript de aplicación después de los ajustes finales | Correcto |
| ESLint de los componentes y helpers modificados de RFI | Correcto |
| `git diff --check` sobre cambios de RFI y configuración | Correcto |

Las pruebas del servidor cubren transiciones e historial, permisos revocados, precondiciones, concurrencia de pregunta/respuestas/adjuntos/estado, lecturas que no invalidan la revisión, envío desde edición y deduplicación de adjuntos. No se ejecutaron contra un backend desplegado.

La comprobación interactiva verificó cancelación sin operación, retorno de foco, Escape en el panel lateral, bloqueo mientras se aplica, revisión desactualizada, fallo de acción, nueva creación y envío, reapertura con plazo vencido, respuesta oficial larga en móvil y recuperación de cargas. El envío de prueba registró una sola creación. El reintento de adjuntos registró un único `updateDraft` y completó después la carga y el registro del archivo. La vista móvil de 390 × 844 no presentó desbordamiento horizontal tras corregir el campo oculto de archivos.

## Capturas

### Cerrar con respuestas oficiales
![Confirmación de cierre](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/01-cerrar-desktop.png)

### Revisión invalidada por concurrencia
![Cambio concurrente](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/02-cambio-concurrente.png)

### Abrir desde el panel lateral
![Confirmación de apertura](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/03-abrir-panel.png)

### Envío completado con adjunto pendiente
![Recuperación de adjuntos](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/04-adjuntos-pendientes.png)

### Respuesta oficial en móvil
![Respuesta larga en móvil](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/05-oficial-mobile.png)

### Resumen de envío visible en móvil
![Formulario móvil](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/06-envio-mobile.png)

### Error al aplicar
![Error visible en el diálogo](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/07-error-accion.png)

### Creación enviada a revisión
![Resultado del envío](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/08-nueva-enviada.png)

### Reapertura conserva el plazo vencido
![Resumen de reapertura](/C:/Users/felix/Documents/OGC-Dashboard/output/rfi-impact-review/09-reabrir-resumen.png)

## Reproducir la vista local

Ejecutar `npx vite --config e2e/rfi/vite.config.ts` y abrir `http://127.0.0.1:4196/e2e/rfi/preview.html`. La vista tiene controles de prueba y variantes `?embedded&state=pending_manager_review`, `?new`, `?edit&state=draft&fail=upload`, `?fail=action`, `?no-official` y `?state=closed`.

La API de las cinco transiciones requiere ahora `expected_review`; el frontend lo obtiene de `getDetail`. Al desplegar posteriormente, coordinar el frontend y Convex para que usen este contrato juntos.
