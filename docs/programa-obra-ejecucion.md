# Programa de obra: ejecución por frente

La versión incorpora actividades estables por familia y frente, dependencias, requisitos, revisión técnica, excepciones para registros concretos y propuestas de fechas. La activación es individual por proyecto. La instalación del código no activa bloqueos ni migra obras automáticamente.

## Preparar un proyecto piloto

1. Publicar primero el esquema y las funciones de Convex, y después el frontend. La pantalla nueva consulta endpoints que requieren ese backend. Validar en el entorno de desarrollo antes de producción.
2. Entrar a **Programa de obra → Actividades por frente → Preparar actividades**, como administrador. Cada familia visible crea una actividad General con su avance actual. Repetir la preparación es seguro: conserva los IDs y no duplica actividades.
3. En **Configurar**, crear pisos, zonas o frentes de ejecución y designar quién puede planificar, aceptar cierres y autorizar excepciones. Ser responsable de una actividad no concede estas facultades.
4. Asignar responsables y frentes. Para separar trabajo con avance previo, dividir la actividad y distribuir expresamente participación y avance. La participación suma 100 % y su promedio conserva el avance original. Resolver o retirar relaciones y requisitos antes de dividir evita trasladarlos a un frente arbitrario.
5. Revisar las fechas con tiempo extra histórico. Completar fechas reales desconocidas solamente con información comprobada. Los registros históricos conservan su fecha de captura; la migración no la convierte en fecha de ejecución.
6. Crear relaciones entre actividades concretas, incluso de partidas distintas. Agregar requisitos con responsable, fecha compromiso y etapa. La recepción parcial de material y los cambios de estado de registros vinculados no resuelven un requisito automáticamente.
7. Revisar calendario, responsables y relaciones; activar las reglas con un motivo. Se guarda una referencia del programa aprobado, incluyendo calendario y ponderaciones.

## Operación

- **Esperar a que termine:** exige liberación de la predecesora para incrementar avance. **Empezar después de su inicio:** exige inicio real y espera. **Terminar después de su cierre:** permite avance parcial y restringe el 100 %. Las dos últimas están en Opciones avanzadas. No se admiten ciclos, relaciones duplicadas, autorreferencias ni cruces entre proyectos.
- Registrar el día del trabajo realizado. Las fechas civiles se validan en servidor; el día de operación usa America/Mexico_City. Por defecto se trabaja de lunes a sábado, con inhábiles explícitos. Las fechas de fin vencen al terminar el día.
- El 100 % físico libera por defecto. Si se requiere revisión, la actividad sigue pendiente hasta su aceptación con usuario, fecha, comentario y evidencia opcional.
- La excepción autoriza y aplica un único incremento y fecha de ejecución. El servidor vuelve a validar permisos, avance, bloqueos y versión. No elimina dependencias ni resuelve requisitos. Un 100 % autorizado con pendientes queda sujeto a revisión de liberación; no libera artificialmente trabajo posterior.
- Corregir un porcentaje exige motivo. Reabrir una predecesora conserva el avance posterior y genera incidencias en las sucesoras ya terminadas. Las pendientes muestran sus restricciones actuales.
- Reprogramar desde el detalle: calcular impacto, completar terminaciones previstas de trabajo en ejecución, revisar fechas anteriores y propuestas y aprobar con motivo. Una propuesta desactualizada no puede aplicarse. No se deduce duración restante del porcentaje ni se adelantan sucesoras automáticamente.
- El Gantt muestra relaciones de la selección. Abrir su detalle es una acción separada. En móvil se conserva la lista y los mismos motivos, responsables y acciones.

## Excel, ponderaciones y reportes

El Excel mantiene su formato. La primera vista revisa sus filas y conflictos; la segunda consulta al servidor y distingue altas, cambios, coincidencias inválidas y ausencias. Para renombrar se selecciona el registro existente. Las filas ausentes permanecen activas, con su orden e historial. Archivar exige resolver las relaciones y requisitos pendientes.

La revisión de importación guarda una huella del estado consultado. Aplicar vuelve a validar las filas y las fechas; cualquier cambio concurrente invalida esa revisión. En familias divididas se conservan las fechas de cada frente y se explica en la previsualización.

`src/lib/programa-obra-rules.ts` es la fuente de cálculo compartida: participación de frentes → ponderación de familias → ponderación de partidas. Con pesos completos y suma positiva utiliza promedio normalizado; si faltan pesos o todos son cero, usa promedio simple y señala avance provisional. El peso cero excluye del porcentaje, pero no del cierre obligatorio. La distribución prevista es una estimación lineal sobre días laborables.

Las consultas proyectan fechas vigentes sobre los consumidores existentes sin sobrescribir las filas importadas. La pantalla, la lista móvil y su PDF reciben los mismos resúmenes. Los reportes usan la misma función de agregación y calendario. La captura de avance sincroniza el porcentaje familiar para compatibilidad con consumidores anteriores.

## Estructura

- `programa_obra_config`: activación, calendario y versión de concurrencia.
- `programa_obra_fronts`, `programa_obra_activities`: catálogo y unidades de ejecución; nombres y orden no son identidad.
- `programa_obra_dependencies`, `programa_obra_requirements`: restricciones temporales y operativas.
- `programa_obra_permissions`, `programa_obra_exceptions`: autorización por proyecto y decisiones sobre registros concretos.
- `programa_obra_revisions`, `programa_obra_events`: referencia aprobada, propuestas aplicadas, importaciones y trazabilidad.

Las mutaciones antiguas delegan el avance en el dominio. Cuando hay varios frentes, exigen elegir una actividad. Las fechas de ejecución del programa preparado se editan desde su detalle y las del programa activo mediante propuestas. Las funciones están disponibles mediante `api.programa_obra`.

## Validación

```sh
npm run test:programa
npm run test:programa-ui
npm run test:reports
npm run typecheck:convex
npm run build
```

`test:programa` incluye reglas puras y pruebas de los handlers de Convex con autenticación y permisos reales sobre una base simulada transaccional. `test:programa-ui` ejecuta los componentes reales en Chrome con transporte aislado, sin conectarse a Convex: comprueba escritorio/móvil, ausencia de desbordamiento, explicación de bloqueos, solicitud, selección del Gantt, teclado y lectura. Las capturas se guardan en `output/programa-obra-execution/`. La configuración de pruebas no se importa en la aplicación de producción.

La aceptación del piloto con usuarios y el despliegue de Convex/frontend todavía deben realizarse. Estas pruebas locales no acreditan el despliegue ni migran una obra real. Antes de activar, comprobar con un residente que puede identificar trabajo listo, encontrar un responsable y registrar avance sin conocer siglas de planificación.

Quedan fuera de esta versión ruta crítica, nivelación de recursos, compromisos semanales, medición por cantidades y envíos de correo. El historial visible del detalle muestra hasta 200 eventos y 200 capturas del agregado familiar; todos los registros permanecen almacenados.
