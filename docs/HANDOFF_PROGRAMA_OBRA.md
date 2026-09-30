# Handoff — Programa de obra por frente

Fecha: 30 de septiembre de 2026 · America/Mexico_City.

## Contexto y estado al exportar

Workspace: `C:\Users\felix\Documents\OGC-Dashboard`. Entorno Windows, PowerShell, React/Vite/TypeScript y Convex.

El usuario pidió robustecer el Programa de Obra, implementó como alcance un plan completo de dependencias y liberación por frente y después solicitó usar el componente compartido `src/components/ui/select.tsx` en lugar de `<select>` nativos. Ambos trabajos están implementados. La última solicitud es exportar este handoff para continuar en una conversación nueva; no especifica una siguiente modificación.

Al exportar, `git status --short` estaba limpio, la rama era `main` y HEAD era `19679cd` (`Add execution-aware program imports and schedule dates`). Los archivos de implementación ya están versionados. La creación de este handoff añade un archivo nuevo. No se ejecutaron commits desde el asistente en esta conversación. Volver a comprobar el estado actual antes de trabajar: otras acciones del usuario pueden haber cambiado el repositorio.

Durante el trabajo asistido no se desplegó Convex/frontend ni se migraron o activaron reglas en obras reales. El estado remoto actual no se ha comprobado: no asumir que sigue sin publicarse, ni afirmar que está desplegado por estar versionado.

Página de referencia del proyecto: [Programa de Obra — Torre I](https://ogc-dashboard.vercel.app/proyecto/jh7a280xbfnvcamjtg9sweeyjd7w7eez/programa). Las verificaciones finales de la funcionalidad nueva se hicieron localmente con datos simulados.

## Objetivo y decisiones aprobadas

El programa debe explicar qué trabajo está listo, qué lo bloquea y quién puede resolverlo, manteniendo una interfaz sencilla.

- La unidad ejecutable es una actividad vinculada a una familia presupuestal y a un frente del proyecto. Las familias y partidas son resúmenes. Una actividad sin desglose comienza en el frente General. Los pisos/frentes no utilizan el catálogo de ciudades.
- Las dependencias son entre actividades concretas, incluso de partidas distintas. FS: **Esperar a que termine**, predeterminada; SS: **Empezar después de su inicio**; FF: **Terminar después de su cierre**. Las dos últimas aparecen en Opciones avanzadas. Las esperas son no negativas y pueden ser laborables o naturales. Se rechazan autorreferencias, duplicados, ciclos y cruces entre proyectos.
- El 100 % representa terminación física. Libera automáticamente salvo revisión técnica requerida o incidencia de liberación. La aceptación registra usuario, momento, comentario y evidencia opcional. Pagos, anticipos y finiquitos no prueban ejecución.
- Los requisitos incluyen descripción, categoría, responsable, fecha compromiso, etapa de bloqueo, carácter bloqueante/informativo y evidencia opcional. Pueden vincular requisiciones, RFIs, planos o documentos del proyecto. Resolverlos exige confirmación explícita; una recepción parcial o coincidencia de nombre no los resuelve.
- Las excepciones autorizan un avance y fecha de ejecución concretos. Se vuelven a comprobar permisos, estado, bloqueos y versión antes de aplicarlo. No eliminan relaciones ni resuelven requisitos. Un 100 % autorizado con pendientes conserva una incidencia y no libera sucesoras artificialmente.
- Reducir avance o reabrir exige motivo. Reabrir una predecesora conserva el avance posterior; las sucesoras terminadas generan incidencias y las pendientes muestran las restricciones actuales.
- El administrador designa por proyecto quién puede planificar, aceptar cierres y autorizar excepciones. Ser responsable no concede esas facultades. Los lectores pueden consultar, filtrar y navegar, pero no escribir.
- Fechas civiles normalizadas, día de operación America/Mexico_City, calendario inicial lunes a sábado e inhábiles configurables. El vencimiento es al finalizar el día. Se separan programa aprobado, vigente y ejecución real. No se infieren fechas reales de la captura histórica.
- Reprogramar requiere previsualizar impacto y aprobar con motivo/versionado. Conserva duración de actividades sin empezar y fechas reales/actividades físicamente terminadas. El trabajo en ejecución requiere terminación prevista explícita. No se deduce del porcentaje ni se adelantan sucesoras automáticamente. Si falta información o aceptación, se informa el impedimento.
- Ponderación compartida: frentes → familias → partidas. Pesos completos y suma positiva: promedio normalizado. Pesos incompletos o todos cero: promedio simple y avance provisional. El peso cero no exime el cierre obligatorio. Dividir por frentes conserva la contribución y el avance original mediante distribución explícita.
- Excel conserva su formato y permite revisar altas, cambios, ambigüedades y ausencias. Los renombres se asignan al ID existente. Las actividades ausentes conservan orden, avance e historial; no se archivan automáticamente.

Fuera de alcance de esta versión: ruta crítica, nivelación de recursos, compromisos semanales, medición por cantidades y envíos de correo.

## Implementación y archivos

| Archivo | Función |
|---|---|
| [ProgramaObra.tsx](/C:/Users/felix/Documents/OGC-Dashboard/src/pages/Programa%20Obra/ProgramaObra.tsx) | Integra Actividades por frente, resúmenes compartidos, captura desde actividad concreta y segunda revisión del Excel. Conserva controles existentes y lista móvil. Refresca la consulta al cambiar el día de operación. |
| [ProgramaObraExecution.tsx](/C:/Users/felix/Documents/OGC-Dashboard/src/pages/Programa%20Obra/ProgramaObraExecution.tsx) | Lista/filtros, Gantt de relaciones seleccionadas, detalle, avances, dependencias, requisitos, revisión, excepciones, frentes, permisos, división, reprogramación e historial. |
| [ProgramaObraImportReview.tsx](/C:/Users/felix/Documents/OGC-Dashboard/src/pages/Programa%20Obra/ProgramaObraImportReview.tsx) | Revisión de coincidencias por ID, ausencias retenidas e impacto de fechas antes de aplicar. |
| [programa-obra-rules.ts](/C:/Users/felix/Documents/OGC-Dashboard/src/lib/programa-obra-rules.ts) | Dominio puro: calendario, fechas, grafo, bloqueos, liberación, estados, agregación, proyección de fechas y propuestas. |
| [programaObraExecution.ts](/C:/Users/felix/Documents/OGC-Dashboard/convex/programaObraExecution.ts) | Consultas/mutaciones, permisos y validaciones del servidor, migración por proyecto, sincronización del agregado familiar, eventos y revisiones. |
| [programaObraImport.ts](/C:/Users/felix/Documents/OGC-Dashboard/convex/programaObraImport.ts) | Validación/previsualización del Excel y huella para comprobar concurrencia. |
| [programa_obra.ts](/C:/Users/felix/Documents/OGC-Dashboard/convex/programa_obra.ts) | Expone los endpoints nuevos mediante `api.programa_obra`; adapta rutas antiguas para delegar avance y evitar edición arbitraria de agregados o fechas. Conserva actividades omitidas en importación. |
| [schema.ts](/C:/Users/felix/Documents/OGC-Dashboard/convex/schema.ts) | Nuevas tablas y campos opcionales para compatibilidad con datos existentes. |
| [reportSnapshot.ts](/C:/Users/felix/Documents/OGC-Dashboard/convex/reportSnapshot.ts) | Utiliza la misma agregación y calendario que el programa; distingue avance provisional. |
| [programa-obra-status.ts](/C:/Users/felix/Documents/OGC-Dashboard/src/pages/Programa%20Obra/programa-obra-status.ts) | Retrasos con fechas civiles y vencimiento al terminar el día en México. |
| [ProgramaObraMobileList.tsx](/C:/Users/felix/Documents/OGC-Dashboard/src/pages/Programa%20Obra/ProgramaObraMobileList.tsx) | Lista móvil existente, con navegación a la actividad concreta y estados de liberación. |
| [Guía de operación y piloto](/C:/Users/felix/Documents/OGC-Dashboard/docs/programa-obra-ejecucion.md) | Preparación, activación, reglas, estructura y validaciones. Leerla antes de migrar o publicar. |

También se adaptaron tipos, Gantt y consumidores del PDF. Al inicio ya había cambios locales de interfaz móvil y exportación; se respetaron, por lo que no todos los cambios frente a una revisión antigua pertenecen únicamente a esta implementación.

Tablas nuevas: `programa_obra_config`, `programa_obra_fronts`, `programa_obra_permissions`, `programa_obra_activities`, `programa_obra_dependencies`, `programa_obra_requirements`, `programa_obra_exceptions`, `programa_obra_events` y `programa_obra_revisions`.

Los nombres y el orden visual no son identidad. Las consultas proyectan fechas vigentes para consumidores antiguos sin sobrescribir las filas importadas. El avance por actividad sincroniza el porcentaje familiar. La ruta antigua exige fecha de ejecución cuando hay migración y actividad concreta cuando existen varios frentes.

## Último ajuste: Select compartido

Todos los `<select>`/`<option>` nativos del código añadido se sustituyeron por `Select`, `SelectTrigger`, `SelectValue`, `SelectContent` y `SelectItem` de [select.tsx](/C:/Users/felix/Documents/OGC-Dashboard/src/components/ui/select.tsx). No se modificó el componente compartido.

- El helper `Choice` en `ProgramaObraExecution.tsx` utiliza `__empty__` para representar la opción vacía y la convierte de vuelta a `""` en `onValueChange`. Permite limpiar responsable, predecesora, vínculo y frente sin usar un `SelectItem` con valor vacío.
- La revisión del Excel utiliza `__auto__` para **Detectar por nombre** y elimina el ID explícito al seleccionarlo.
- Se mantuvieron `aria-label`, permisos de lector, estado disabled y altura de interacción móvil.
- Se adaptaron las pruebas para abrir el combobox y seleccionar opciones de Radix. Se verificó selección y restablecimiento de coincidencias del Excel.
- La búsqueda posterior no encontró `<select>` ni `<option>` nativos en `src/pages/Programa Obra`.

## Validaciones realizadas y su alcance

Antes del ajuste de Select pasaron:

- `npm run test:programa`: pruebas existentes de hitos/PDF, reglas puras nuevas y **19 pruebas de integración** de handlers Convex con autenticación/permisos reales sobre una base simulada transaccional.
- `npm run test:reports`.
- `npm run typecheck:convex` y TypeScript del frontend.
- `npm run build`.
- ESLint de los archivos modificados y `git diff --check`.
- Prueba visual/interactiva local a 1440 y 390 píxeles: filtros, bloqueos, solicitud de excepción, Gantt, móvil, teclado, restauración de foco y lector.

Después del ajuste de Select pasaron:

- `npx tsc -p tsconfig.app.json --noEmit`.
- ESLint de `ProgramaObraExecution.tsx` y `ProgramaObraImportReview.tsx`.
- `npm run test:programa-ui`, incluyendo la revisión de importación y retorno a Detectar por nombre.
- `git diff --check` sin errores; únicamente avisos de normalización LF/CRLF.

No se volvió a ejecutar el build completo después del ajuste de Select en esta conversación. Ejecutarlo antes de publicar. No afirmar que las pruebas corresponden a un HEAD posterior sin volver a comprobarlo.

La integración cubre dependencias/liberación por piso, captura tardía, aceptación técnica, permisos, excepciones aprobadas/rechazadas/desactualizadas y de 100 %, reapertura sin pérdida, fuentes de requisitos, migración idempotente, división conservando avance, propuestas/versiones, importación/renombres/omisiones, protección de rutas antiguas, igualdad de reportes y conservación de la referencia aprobada.

Archivos de pruebas:

- `scripts/test-programa-obra-rules.mjs`, `scripts/test-programa-execution-rules.mjs`.
- `convex/programaObraExecution.test.mjs`.
- `scripts/test-programa-ui.mjs`, `e2e/programa/preview.html`, `preview.tsx` y `convex-stub.ts`.

El harness de UI usa componentes reales, un servidor Vite local en el puerto 4186 y Chrome headless con transporte Convex simulado. No se importa en la aplicación de producción ni accede a la sesión real. Se comprueba la importación mediante `?import=1` y lectura mediante `?viewer=1`.

En este Windows, esbuild falló bajo aislamiento por acceso a directorios superiores. Build y UI se validaron mediante ejecución local con escalación aprobada automáticamente. No hubo rechazo de aprobación. Vitest funciona con `--configLoader runner`, ya incluido en `test:programa`. No modificar configuración global de Git; si aparece propiedad insegura, utilizar `git -c safe.directory=C:/Users/felix/Documents/OGC-Dashboard ...`.

## Capturas y comunicación

Capturas de la prueba local, disponibles en disco:

- [Lista escritorio](/C:/Users/felix/Documents/OGC-Dashboard/output/programa-obra-execution/list-1440.png).
- [Detalle escritorio](/C:/Users/felix/Documents/OGC-Dashboard/output/programa-obra-execution/detail-1440.png).
- [Lista móvil](/C:/Users/felix/Documents/OGC-Dashboard/output/programa-obra-execution/list-390.png).
- [Detalle móvil](/C:/Users/felix/Documents/OGC-Dashboard/output/programa-obra-execution/detail-390.png).

Son datos simulados, no evidencia de despliegue. El usuario también pidió y recibió un texto para Ro resumiendo las mejoras, con indicación de que estaban implementadas/probadas localmente y pendientes de publicación/piloto. No se envió ningún correo o mensaje externo.

Se sugirieron estas capturas desde la página del proyecto cuando la funcionalidad esté disponible: lista filtrada por piso; detalle bloqueado con responsable y Ver pendiente; 100 % pendiente de revisión con acciones de aceptación; impacto de reprogramación antes de aplicar; revisión de Excel con coincidencias y ausencias retenidas.

## Pendientes para continuar

1. Leer este handoff y la guía, comprobar rama/HEAD/diff e identificar la siguiente solicitud del usuario. El trabajo solicitado hasta ahora está completado; no comenzar otra implementación por inferencia.
2. Si se pide publicar, comprobar el entorno y despliegue actuales. Publicar esquema y funciones de Convex antes que el frontend: las consultas nuevas necesitan ese backend. Ejecutar las validaciones apropiadas para los cambios y el destino.
3. Validar un proyecto piloto con datos reales y usuarios. Esto no se hizo en esta conversación. Preparar actividades, revisar responsables, frentes, relaciones, calendario y fechas históricas y después activar las reglas de ese proyecto.
4. Verificar en el piloto igualdad de porcentajes pantalla/móvil/PDF/reportes, permisos reales, importaciones y comportamiento completo de aceptación/excepciones/reprogramación. Las pruebas locales no sustituyen esta aceptación.
5. Capturar imágenes reales para la comunicación después de comprobar disponibilidad. No reutilizar imágenes simuladas como si fueran de la obra real.

El historial visible del detalle está limitado a 200 eventos y 200 capturas del agregado familiar; todos los registros quedan almacenados. Las etapas posteriores fuera de alcance no están pendientes obligatorios de esta versión.

## Prompt sugerido para una conversación nueva

> Lee `C:\Users\felix\Documents\OGC-Dashboard\docs\HANDOFF_PROGRAMA_OBRA.md` y `docs\programa-obra-ejecucion.md`. Revisa el estado actual del repositorio antes de cambiar archivos y conserva el trabajo existente. El Programa de Obra por frente está implementado, incluida la sustitución de selects nativos por el componente compartido. Comprueba qué está publicado antes de asumir el estado del despliegue. A continuación, continúa con la tarea que te indique.
