# Simplificación de Programa de Obra

Fecha: 8 de septiembre de 2026
Rama de desarrollo: `codex/simplificar-programa-obra`
Archivo: `src/pages/Programa Obra/ProgramaObra.tsx`

## Problema observado

La vista inicial presentaba tres botones en el encabezado, cuatro indicadores, el buscador, un selector de estado, cuatro controles del calendario y cinco explicaciones de colores. Alertas tenía tres accesos: el botón superior y dos indicadores que abrían el mismo panel. En móvil también aparecían los controles del Gantt, aunque el calendario solo está disponible desde 850 px.

Esta combinación obligaba a distinguir muchas opciones antes de consultar el programa. La propuesta prioriza el avance, los retrasos y las alertas; las operaciones ocasionales quedan agrupadas con nombres explícitos.

## Cambios y justificación

| Cambio | Justificación | Acceso resultante |
| --- | --- | --- |
| Menú «Archivo» | Reduce los tres botones del encabezado a uno y agrupa operaciones sobre archivos. | Exportar PDF y Cargar Excel a un clic del menú. |
| Un único acceso a alertas | Elimina accesos que llevaban al mismo panel. | Indicador «Alertas pendientes», con flecha y cantidad; los hitos próximos aparecen como información complementaria cuando existen. |
| Tres indicadores en lugar de cuatro | Facilita distinguir avance, retrasos y pendientes. | Avance físico, Partidas retrasadas y Alertas pendientes. |
| Menú «Vista» | Reduce los cuatro controles del calendario a dos: Hoy y Vista. | Expandir familias, Contraer familias y Ampliar programa. |
| Salida visible del modo ampliado | Facilita volver a la navegación habitual sin abrir un menú. | «Salir de enfoque» en el encabezado mientras está activo. |
| Guía de colores desplegable | Conserva la ayuda sin mostrar permanentemente cinco explicaciones. | «Guía de colores del programa», operable por teclado. |
| Limpieza de filtros y estado del indicador de retrasos | Hace visible cómo regresar al programa completo. | «Limpiar filtros» cuando hay búsqueda o filtro; pulsar de nuevo Partidas retrasadas desactiva ese filtro. |
| Expansión deshabilitada durante el filtrado | Los filtros ya muestran automáticamente las familias coincidentes; evita controles que aparentaban no tener efecto. | El menú explica que es necesario limpiar los filtros para cambiar el detalle. |
| Controles adecuados a móvil | Evita ofrecer acciones para un calendario que no se muestra en ese tamaño. | Resumen, alertas, búsqueda, filtro y Archivo; se conserva el aviso sobre el Gantt en escritorio. |
| Estado inicial sin controles innecesarios | Evita indicadores en cero y herramientas sin datos cuando todavía no existe programa. | Una acción principal: Cargar Excel. |
| Ceros en color neutro | Evita señalar como problema la ausencia de retrasos o alertas. | Los colores de atención se reservan para cantidades mayores que cero. |

## Alcance conservado

No se modificaron consultas, mutaciones, cálculos de avance, ponderaciones, fechas, reglas de hitos ni contenido del PDF. Se conservan los editores de partidas y familias, comentarios, historial y la previsualización del Excel antes de confirmar su carga. El menú de Archivo respeta la restricción de carga para lectores y bloquea sus operaciones mientras se procesa un archivo o se exporta.

Se reutilizaron los componentes, colores, tipografía y estilo existentes. No se añadieron dependencias ni animaciones; únicamente permanecen las transiciones de los menús y el indicador de procesamiento ya disponibles.

## Validación

- Compilación de TypeScript y Vite.
- Pruebas existentes: `npm run test:programa`.
- ESLint del archivo modificado y revisión de espacios con `git diff --check`.
- Comparación visual local en escritorio (1440 × 900) y móvil (390 × 844), usando Programa Sunrise.
- Verificación de Archivo, expansión y contracción de familias, entrada y salida del modo ampliado, búsqueda sin resultados, limpieza de filtros, guía de colores y panel de alertas.
- Ejecución de la exportación desde Archivo y restauración de la vista después del proceso, sin errores de consola observados. No se auditó visualmente el PDF generado.

No se realizaron cargas ni cambios en datos reales para esta revisión. No se probó con una sesión de lector ni se midió la mejora con usuarios finales. La reducción de confusión es una hipótesis de usabilidad sustentada en la eliminación de duplicados y la agrupación de opciones; conviene confirmarla con Ro en la versión de desarrollo.

La compilación informa avisos sobre el tamaño de los paquetes y la antigüedad de Browserslist, sin impedir su finalización.

## Publicación

Los cambios están destinados a una rama de desarrollo independiente. No se integran en `main`. El estado y enlace del despliegue Preview de Vercel se comunicarán después de verificar la publicación de la rama.

## Mensaje propuesto para Ro

Hola buenas tardes Ro, simplifiqué la página de Programa de Obra para que sea más fácil consultar el avance y detectar los pendientes.

El problema original era que se mostraban muchas opciones al mismo tiempo y había varios accesos que abrían las mismas alertas. Ahora agrupé la carga de Excel y la exportación en «Archivo», y las opciones del calendario en «Vista». También dejé un solo acceso a alertas y la guía de colores se puede desplegar cuando se necesita.

Las funciones de edición y la previsualización del Excel se conservan. En móvil oculté los controles del calendario que no se podían utilizar en esa vista.

Quedo atento a tus comentarios. Saludos.
