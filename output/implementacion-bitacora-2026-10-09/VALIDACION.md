# Implementación del punto 08 — Preparación de Bitácora

9 de octubre de 2026. Cambios implementados en el checkout local. Esta entrega parte del diagnóstico del hallazgo 24 y se limita a la preparación, recuperación, disponibilidad local y presentación de estados de Bitácora.

## Comportamiento implementado

- Cabecera persistente y etapas conectadas al trabajo real: lectura local, validación de sesión, bootstrap, almacenamiento, pull, descargas solicitadas, envío de pendientes y actualización final. La espera por otro ciclo se muestra como actividad en curso.
- Una promesa activa coordina la preparación completa dentro de cada proveedor. Los disparadores de entrada, botón, visibilidad, reconexión y temporizador comparten el intento. El lock de sincronización existente se conserva; ocupado devuelve un resultado explícito, y sin Locks existe exclusión en memoria por usuario/proyecto.
- El temporizador de pendientes no repite intentos ante causas confirmadas de sesión, permisos o almacenamiento. Fallos genéricos anteriores al envío tienen también una espera creciente, hasta 60 segundos, además del backoff de cada operación; las acciones manuales y eventos de recuperación conservan el reintento existente.
- Lectura de las tablas del proyecto en una transacción coherente. Sólo se muestra información con perfil vigente, identidad exacta, permiso de proyecto, proyecto cacheado y snapshot preparado. Una primera descarga de reportes interrumpida no se anuncia como preparación completa; un snapshot previo válido continúa disponible durante actualización o fallo.
- Cambio de usuario/proyecto remonta el ámbito y descarta respuestas tardías antes de persistir resultados posteriores. El arranque de respaldo con navegador online solicita exclusivamente la cuenta autenticada por Clerk; no elige la cuenta recordada como sustituto. El arranque realmente offline mantiene la política de cuenta recordada, sin fallback a otra cuenta cuando ésta no es válida, y rechaza selección ambigua.
- Vencimiento del perfil controlado incluso con la pantalla quieta. La denegación confirmada retira el permiso cacheado de ese proyecto. Los diagnósticos de almacenamiento se pueden mostrar en memoria aunque IndexedDB falle; no requieren escribir un error en la propia base para renderizarlo.
- Conexión, datos actualizados, pendientes elegibles, operaciones pausadas, errores y conflictos se presentan por separado. Las operaciones pausadas y el backoff no se reabren por un reintento genérico. Se elimina el badge de éxito repetido en las filas compactas; permanece en el detalle.
- La disponibilidad de archivos cuenta originales guardados, no miniaturas. Descargas fallidas se conservan por archivo y se pueden volver a solicitar. Un original inexistente genera explicación en vez de una espera indefinida de conexión. El fallo de un archivo no invalida una sincronización correcta de reportes.
- Estado con `aria-live="polite"`, ocupación y nombres de acción. Spinners de preparación decorativos con movimiento condicionado. Cabecera estable y retorno de foco al control que inició el reintento cuando el navegador lo deja en el cuerpo; no se roba el foco de otro control. Fecha visible en móvil.
- Medidas locales de Performance para etapas, lectura y entrada hasta primer contenido utilizable. No se añadió telemetría ni se afirma reducción de latencia. El umbral de 15 segundos sólo activa ayuda de espera; no declara un error ni estima duración.

## Verificación

| Comprobación | Resultado |
|---|---|
| `test:bitacora-offline` | 31 pruebas, 2 archivos, aprobadas. IndexedDB y cliente simulados. |
| `tsc -b --pretty false` | Aprobado. |
| ESLint en todos los archivos cambiados y preview | Sin errores; dos avisos Fast Refresh en la entrada del preview y aviso informativo de detección de Tailwind del plugin. |
| Vite producción | Compilación y generación de service worker aprobadas. Aviso de chunks mayores de 500 kB. |
| Primer ingreso con respuesta retenida | Etapa de bootstrap, acción desactivada y ayuda de espera. Cinco disparadores comparten un bootstrap. Liberar respuesta permite llegar a datos preparados. |
| Retorno con snapshot vigente | Reportes y fecha disponibles mientras bootstrap permanece pendiente. |
| Fallo inicial y reintento | Diagnóstico recuperable; reintento por Enter termina en datos listos. Tab alcanza la acción; el foco vuelve a «Actualizar ahora» al terminar. |
| Cambio de proyecto durante bootstrap | El nuevo proyecto se prepara; liberar respuesta del anterior conserva el ámbito nuevo. Prueba unitaria verifica que una respuesta tardía no escribe filas. |
| Offline con estados mixtos | 1 pendiente, 2 pausados, 1 error, 1 conflicto y 1 de 4 originales disponibles; cero mutaciones remotas. |
| Sesión sin token, preparación vencida y DB cerrada | Cada caso muestra su explicación específica; sesión dirige al inicio de sesión existente, perfil vencido oculta reportes y DB cerrada no deja una pantalla vacía. |
| Backend desconectado y reconexión simulada | Datos locales visibles y mensaje de servidor separado de internet. Reconectar inicia un bootstrap y termina en «Cambios sincronizados», con cero mutaciones remotas. |
| Perfil viewer y módulo vacío | Preparación válida con cero reportes; no aparece «Agregar reporte» ni invitación a crearlo. |
| Móvil | Fecha y contadores visibles. En 320 y 390 px, documento y descendientes del contenido no desbordan horizontalmente. Captura de cabecera a 390 px incluida. |

Las pruebas automatizadas cubren identidad/TTL/scope, selección de perfil, edición/eliminación desde otro proyecto, lectura coherente, causas/mensajes, deduplicación, paginación interrumpida, snapshot vacío/previo, respuesta tardía, lock ocupado, ausencia de Locks, backoff/pausados y descarga de originales con errores recuperables.

## Entorno de capturas

`e2e/bitacora/preview` renderiza el proveedor y la página reales con IndexedDB sintético en un origen local exclusivo, `http://127.0.0.1:4186` o `http://localhost:4186`. Son orígenes distintos; la captura móvil final usa localhost para aislarse de las pruebas anteriores. El cliente no accede a Convex y bloquea mutaciones remotas. La barra superior identifica explícitamente los datos simulados. No se modificaron reportes, archivos ni colas de obra.

Para reproducir: `npm run preview:bitacora-states`. El selector permite controlar los estados. La entrada reinicia únicamente la base de ese origen de prueba al cargar la página; debe mantenerse en ese origen separado y con una sola pestaña de preview por origen para evitar que otros escenarios actúen sobre el mismo fixture.

## Límites de la validación

No se ejecutó la suite operativa E2E que crea reportes y puede sincronizar colas reales. Falta una pasada de integración con Clerk/Convex en un tenant de prueba, la transición de recarga de la aplicación offline completa, pruebas reales de múltiples pestañas y lector de pantalla. La revisión de DOM/teclado no certifica accesibilidad completa.

La exclusión en memoria sin `navigator.locks` cubre el mismo proceso. La sesión/bootstrap previos al lock no se excluyen entre pestañas; se mantiene el alcance propuesto de coordinación local y protección existente del ciclo de sincronización. Los guardas descartan resultados posteriores al cambio de ámbito; no cancelan una petición remota ya enviada.

No se desplegó ni se creó un commit. El resumen para Ro es un borrador guardado localmente, no un correo enviado.

## Capturas

Preparación por etapas y ayuda de espera:

![Preparación](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/01-preparacion.jpg)

Datos preparados:

![Lista sincronizada](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/02-sincronizado.jpg)

Datos locales disponibles durante actualización:

![Actualización](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/03-actualizando.jpg)

Fallo recuperable:

![Reintento](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/04-error-reintento.jpg)

Estados mixtos y disponibilidad por original:

![Uso sin conexión](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/05-sin-conexion-conflictos.jpg)

Cabecera móvil:

![Móvil](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/06-movil.jpg)

Almacenamiento no disponible:

![Almacenamiento](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/07-almacenamiento.jpg)

Preparación vencida:

![Vencimiento](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/08-preparacion-vencida.jpg)

Sesión sin validar:

![Sesión](C:/Users/felix/Documents/OGC-Dashboard/output/implementacion-bitacora-2026-10-09/09-sesion.jpg)
