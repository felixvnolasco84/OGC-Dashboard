# OGC Dashboard — análisis de producto y UX/UI

**Fecha:** 5 de octubre de 2026. **Objetivo:** mejorar el aprovechamiento de las funcionalidades actuales, con cambios de claridad, organización, interacción, accesibilidad y confiabilidad.

## Dictamen

El producto ya reúne buena parte de los recursos necesarios para administrar una obra: presupuesto, programa, bitácora, requisiciones, transacciones, archivos, tareas y reportes. La oportunidad principal consiste en hacer que esa información sea más confiable, fácil de interpretar y accesible durante el trabajo diario.

Hay tres problemas de mayor impacto: dos consultas dejaron pantallas completas en blanco; el gasto porcentual se presenta como avance de obra; y algunos flujos pueden comunicar un resultado incompleto como exitoso o cambiar varios estados mediante una sola acción. Después de resolverlos, conviene reducir la distancia entre entrar a una pantalla y encontrar el registro o pendiente relevante.

**Las 26 recomendaciones siguientes reutilizan capacidades existentes.** Algunas requieren corregir componentes o consultas; no implican crear nuevos módulos, entidades de negocio, tableros, integraciones ni automatizaciones. No se modificó el código del producto durante el análisis.

## Método y alcance

Se recorrió la aplicación local en navegador, conectada al backend configurado, con la sesión administrativa disponible. Se inspeccionaron pantallas de escritorio de aproximadamente 1280 × 720 y vistas móviles de 390 × 844. Sunrise fue el proyecto principal de muestra. Se contrastaron capturas, estructura accesible del DOM, errores de consola y código de rutas, permisos, componentes y consultas.

Se navegaron vistas, pestañas y filtros y se abrió un formulario vacío. No se crearon solicitudes, pagos, usuarios, reportes ni archivos; tampoco se enviaron notificaciones o consultas al asistente. El formulario se cerró sin guardar y se restableció el tamaño del navegador.

**Nivel de evidencia:**

- **Observado:** comportamiento o contenido visto en esta ejecución y documentado en captura/DOM.
- **Código:** comportamiento que se desprende de la implementación, sin ejecutar la operación o sin entrar con ese perfil.
- **Hipótesis:** propuesta cuyo beneficio debe validarse con usuarios. No representa un problema medido de conversión o productividad.

La revisión es amplia dentro de esta muestra, pero no equivale a probar todos los permisos, proyectos y combinaciones de datos. Control y P&L tienen un bloqueo identificado; sus visualizaciones internas no pudieron auditarse. RFIs y Planos estaban vacíos: se revisó su entrada y orientación inicial, no su operación con registros. Las rutas comerciales, administración, importaciones, generación de PDF y flujos de escritura requieren validación adicional en un entorno de prueba.

## Qué conviene conservar

1. **La conexión entre los módulos de obra.** Partidas, familias y proyecto ofrecen un marco compartido. La mejora debe mantener esa trazabilidad.
2. **Programa en móvil.** Ya cambia el Gantt por una lista con fechas, avance físico y estados escritos; es un patrón reutilizable para otras vistas densas.
3. **Los controles existentes de filtrado.** Requisiciones tiene pestañas, búsqueda y filtros; Tareas tiene estado, prioridad, responsable y proyecto. Su problema principal es la presentación y el estado inicial.
4. **La orientación inicial de Planos.** El estado sin datos explica la siguiente acción de forma concreta. Puede ser referencia para búsquedas vacías y módulos operativos.
5. **Bitácora agrupada y con estado de sincronización.** Hace visible la condición del registro, aunque puede reducir la repetición de información normal.
6. **Reportes con configuración, programación e historial.** Ofrece continuidad operativa; conviene simplificar cómo se presentan sus opciones.
7. **Componentes compartidos y capacidades de expansión.** Tablas adaptables, selectores de columnas y detalles desplegables permiten mejorar densidad sin eliminar información.

## Enfoque de producto: trabajos que debe facilitar

| Trabajo del usuario | Recorrido con las funciones actuales | Fricción principal | Resultado deseable |
|---|---|---|---|
| Entender el estado de una obra | Proyectos → Presupuesto → Programa → Reportes | El mismo término «avance» describe gasto y ejecución física; los periodos no son uniformes | Identificar qué se ha gastado, cuánto se ha ejecutado y a qué fecha corresponden |
| Resolver una compra o entrega | Requisiciones → detalle → proveedor/soportes → estados → transacciones | Pestaña vacía poco explicativa, tarjetas largas y consecuencias de cambios de estado poco evidentes | Encontrar la solicitud y reconocer qué falta sin interpretar el pipeline por ensayo |
| Dar seguimiento en obra | Programa → Bitácora → RFIs/Planos | Nombres de catálogo, densidad variable y navegación por rol | Mantener el contexto de la obra y ubicar la evidencia o incidencia |
| Resolver pendientes | Tareas → filtros → tarea → estado | Mucho espacio antes del primer registro y tareas completadas mezcladas con trabajo activo | Encontrar primero lo que requiere intervención |
| Consultar evidencia y preparar un reporte | Documentos → carpeta/búsqueda → Reportes | Conteos ambiguos, árbol expandido y vocabulario técnico en configuración | Recuperar el archivo y entender qué se incluirá en el reporte |

Estas prioridades parten de la estructura del producto y de las pantallas observadas. La frecuencia real de cada recorrido debe confirmarse con representantes de administración, residencia de obra, compras/finanzas y almacén.

## Prioridad y esfuerzo

**P0:** bloqueo de uso. **P1:** comprensión, continuidad o integridad del flujo. **P2:** fricción recurrente. **P3:** pulido y aprovechamiento secundario.

**S:** cambio localizado. **M:** varios componentes o reglas y verificación. **L:** consulta/flujo transversal con validación de datos. Son tamaños relativos, no estimaciones de calendario. El esfuerzo final depende de revisar dependencias y casos existentes.

| ID | Oportunidad | Prioridad | Esfuerzo | Evidencia |
|---|---|---|---|---|
| 01 | Evitar que errores de consultas dejen la aplicación en blanco | P0 | L | Observado + código |
| 02 | Separar avance físico de presupuesto ejercido | P1 | S | Observado + código |
| 03 | Explicitar periodo y alcance de los indicadores | P1 | M | Observado + código |
| 04 | Hacer explícitas las consecuencias de cambiar estados | P1 | M | Código; controles observados |
| 05 | Comunicar correctamente guardados con adjuntos fallidos | P1 | M | Código |
| 06 | Alinear inicio, permisos, menú y descripción de cada rol | P1 | M | Código |
| 07 | Conservar contexto al navegar y cambiar de proyecto | P1 | M | Observado + código |
| 08 | Priorizar el trabajo activo en Tareas | P1 | M | Observado; solución por validar |
| 09 | Compactar resumen y filtros antes de los registros | P2 | M | Observado |
| 10 | Adaptar las columnas al área realmente disponible | P2 | M | Observado + código |
| 11 | Diferenciar «sin pendientes», «sin datos» y «sin coincidencias» | P2 | S | Observado |
| 12 | Reducir longitud de tarjetas de requisición | P2 | M | Observado |
| 13 | Explicar requisitos y secuencia del formulario | P2 | S | Observado + código |
| 14 | Diferenciar importes desconocidos de cero capturado | P2 | M | Observado + código |
| 15 | Nombrar correctamente los conteos documentales | P2 | S | Observado + código |
| 16 | Reducir expansión inicial y scroll del árbol de carpetas | P2 | M | Observado + código |
| 17 | Simplificar lenguaje y orden de configuración de reportes | P2 | S | Observado + código |
| 18 | Definir población y unidad de indicadores operativos | P2 | M | Observado |
| 19 | Mejorar calidad del catálogo con edición y revisión existentes | P2 | M | Observado; duplicados por confirmar |
| 20 | Distinguir avisos de tareas, menciones y envío de notificaciones | P2 | S | Observado |
| 21 | Nombrar controles y elementos editables de forma accesible | P2 | M | DOM + código |
| 22 | Dar legibilidad y señales de interacción al contenido operativo | P2 | M | Observado + código |
| 23 | Permitir consulta en perfiles de lectura sin bloqueo general | P1 | M | Código |
| 24 | Clarificar preparación y sincronización de Bitácora | P2 | S | Observado; duración no medida |
| 25 | Aprovechar el contexto existente del asistente | P3 | S | Observado + código |
| 26 | Unificar nombres y jerarquía visual entre módulos | P3 | M | Observado |

## Hallazgos y acciones recomendadas

### 01. Recuperar Control y P&L, y contener los errores de cada vista

**Evidencia:** pasos 3 y 15. Control y P&L quedaron completamente blancos, incluyendo navegación. La consola registró `transacciones:getFamiliaChartData` a las 20:57:15 UTC y `desarrollos:getPnlSummary` a las 21:00:53 UTC con «Your request timed out performing too many system operations». Las líneas repetidas corresponden al mismo episodio por vista, no a múltiples pruebas independientes.

**Impacto:** impide consultar el módulo y puede hacer parecer que toda la plataforma falló. **Acción:** optimizar las consultas actuales y limitar el fallo al bloque/vista afectada, conservando navegación, explicación y recuperación. `getFamiliaChartData` recorre partidas, consulta pagos por partida y obtiene transacciones por pago; esto es un patrón costoso a revisar. P&L agrega cálculos por proyecto. El timeout está confirmado; la contribución exacta de cada lectura requiere perfilado.

**Aceptación:** con la misma muestra, las vistas cargan; al simular un error en pruebas se conserva el menú y se muestra una recuperación clara. Referencias: `convex/transacciones.ts:2531`, `convex/desarrollos.ts:727`, `src/pages/Control/ControlPage.tsx` y `src/pages/ProfitAndLoss/ProfitAndLossPage.tsx`. Logs en `errores-observados.json`.

### 02. Llamar «Presupuesto ejercido» al porcentaje de gasto

**Evidencia:** pasos 1, 2, 7 y 19. Proyectos muestra «Avance obra» de 47% para Sunrise; `getAllWithMetrics` calcula gasto/presupuesto aprobado. Programa sí muestra avance físico de 33.5%. Son variables distintas, no una diferencia de redondeo.

**Acción:** renombrar el indicador financiero y explicar su denominador. En Presupuesto, eliminar el segundo «Avance 47%» en «Por ejercer» o sustituirlo por el porcentaje restante, calculado sobre la misma base. Mantener porcentajes superiores a 100% y describirlos como sobrepresupuesto; no ocultarlos limitando la barra.

**Aceptación:** una persona puede distinguir gasto y ejecución física sin abrir otro módulo. Referencias: `convex/desarrollos.ts:41`, `src/pages/ProyectosTable/ProyectosTablePage.tsx:208`, `src/pages/Presupuesto/PresupuestoPage.tsx:559`.

### 03. Hacer visible qué cambia al seleccionar un periodo

**Evidencia:** pasos 2 y 13. «Hoy (total)» mezcla fecha y acumulado. El código de Presupuesto cambia el importe de gasto a pagos del periodo, mientras otros indicadores y la insignia porcentual mantienen totales. Reportes presenta importes e indicadores con alcances diferentes.

**Acción:** usar «Acumulado al [fecha]» y «Pagado en [periodo]», e identificar los indicadores acumulados que acompañan una vista filtrada. Explicar «Gasto», «Pagado» y «Por ejercer» con la definición aplicada por cada consulta; no unificarlos por nombre si representan conceptos distintos.

**Aceptación:** al cambiar el periodo, cada tarjeta indica su alcance y ningún porcentaje parece corresponder a un importe de otra base. Revisar `PresupuestoPage.tsx:105,559,791` y las etiquetas del resumen de Reportes.

### 04. Mostrar todas las consecuencias de una transición de requisición

**Evidencia:** pasos 5 y 21, más código. Los puntos del recorrido Aprobada/Pagada/Recibida son controles. `handlePipelineStageChange` puede aprobar antes de avanzar y, al retroceder, cambiar pago o reiniciar entrega de «Completo» a «Pendiente».

**Impacto:** el usuario puede interpretar que selecciona una etapa visual cuando modifica varios campos. **Acción:** aprovechar la confirmación y el historial existentes para enumerar los cambios concretos, sobre todo retrocesos. Sustituir «Pipeline actualizado» por un mensaje comprensible. Revisar el resultado parcial si una secuencia de mutaciones falla; el indicador de actualización existente debe impedir repetir la acción en curso.

**Aceptación:** la confirmación nombra pago y entrega afectados y el resultado refleja los campos efectivamente guardados. No se ejecutaron cambios de estado en esta auditoría. Referencia: `ProyectoRequisicionesPage.tsx:516`.

### 05. Comunicar un guardado parcial sin cerrar como éxito completo

**Evidencia de código:** `RequisicionModal.tsx:475–548`. El flujo guarda la requisición, sube documentos, captura el error de subida y después muestra un éxito y cierra el formulario. El usuario puede ver mensajes contradictorios y perder el contexto de los archivos pendientes.

**Acción:** distinguir «Solicitud guardada; faltan adjuntos» de éxito completo. Mantener la posibilidad de reintentar los pendientes desde la carga/edición actual, sin volver a crear la solicitud. Registrar qué archivos se adjuntaron y cuáles no en el resultado de la operación. Revisar los modales de pagos e ingresos que también contemplan guardado con documento fallido.

**Aceptación:** una prueba con fallo en un archivo genera un único resultado inequívoco, mantiene el registro guardado y permite recuperar la carga sin duplicarlo. No se provocaron fallos ni se subieron archivos reales.

### 06. Alinear el recorrido de cada rol con sus permisos actuales

**Evidencia de código:** el inicio y `/proyectos` requieren administrador; la excepción del inicio solo incluye almacenista. «Volver al Inicio» desde acceso denegado apunta a `/proyectos`, que otros perfiles tampoco pueden abrir. El menú del contratista omite Programa, aunque la ruta admite ese rol. Existen también diferencias entre el alcance descrito y los enlaces mostrados a finanzas.

**Acción:** dirigir cada perfil a una pantalla/proyecto ya autorizado y alinear menú, descripción de rol y rutas con la matriz real de permisos. Revisar navegación directa, enlaces de notificaciones y estados sin proyectos. La solución no requiere ampliar permisos.

**Aceptación:** cada rol entra, consulta sus módulos y se recupera de un acceso denegado sin volver a otro acceso denegado. Validación pendiente con cuentas de prueba por perfil. Referencias: `src/main.tsx:90`, `ProtectedRoute.tsx:82`, `RoleHomePage.tsx`, `SidebarComponent.tsx:618`.

### 07. Mantener proyecto y módulo durante la navegación

**Evidencia:** pasos 2, 11 y 14. El menú mezcla enlaces globales y del proyecto con nombres iguales, como Documentos. Tareas lleva a `/tareas`; ya existe una ruta de proyecto que redirige a `?proyecto=...`. El selector de proyecto usa una pantalla inicial por rol.

**Acción:** distinguir «Documentos del proyecto» y «Documentos generales». Usar el filtro de proyecto existente al abrir tareas desde la obra. Al cambiar de proyecto, mantener el módulo si está disponible y permitido; aplicar el destino inicial actual como alternativa cuando no lo esté. Evitar trasladar filtros específicos inválidos entre proyectos.

**Aceptación:** entrar a Tareas desde Sunrise conserva Sunrise seleccionado; cambiar de obra desde Programa abre Programa cuando corresponde. Referencias: `ProyectoTareasPage.tsx:7`, `SidebarComponent.tsx:916`.

### 08. Hacer que Tareas conduzca primero al trabajo pendiente

**Evidencia:** paso 14. Se observaron 61 tareas, 34 abiertas, 27 vencidas y 27 completadas. La cabecera, pestañas y filtros consumen gran parte de la primera pantalla; los grupos expandibles incluyen registros completados.

**Acción:** aprovechar las pestañas, filtros y grupos actuales para reducir el contenido completado en el estado inicial y priorizar pendientes/vencidas. Compactar controles secundarios. Mantener acceso sencillo al total y a completadas. La elección entre «mis pendientes» y «pendientes del proyecto» debe depender del trabajo de cada perfil, no asumirse igual para todos.

**Aceptación:** en una prueba de tareas representativas, se ubica un pendiente sin desplazarse por trabajo terminado y se entiende qué alcance está activo. No se midió todavía tiempo de resolución. Referencia: `src/pages/Tareas/TareasPage.tsx`.

### 09. Reducir espacio antes de las tablas y listas

**Evidencia:** pasos 2, 14 y 19. En Presupuesto de escritorio las métricas se distribuyen en tres tarjetas y una debajo; en móvil ocupan casi toda la primera pantalla. La tabla y sus controles quedan más abajo.

**Acción:** compactar márgenes, alturas y resumen; dar prioridad al monto y contexto indispensables. Presentar comparaciones redundantes, como presupuesto original igual a aprobado y «Aumento 0%», con menor peso. Adaptar el resumen al ancho del contenido, conservando precisión y acceso a detalles.

**Aceptación:** a 1280 × 720 se ve el comienzo de los registros después del resumen; a 390 × 844 se llega a filtros/lista con menos desplazamiento. La cifra financiera sigue completa y legible. Es un objetivo de diseño a verificar, no un resultado ya conseguido.

### 10. Ajustar tablas al área después de descontar la barra lateral

**Evidencia:** pasos 1, 9 y 12. Proyectos usa un mínimo de 1200 px; RFIs deja columnas y acciones fuera de la vista de 1280 px; Transacciones prioriza columnas anchas que obligan a desplazarse para llegar a fecha/estado/acciones. El ancho total de la ventana no es el ancho disponible del módulo.

**Acción:** revisar mínimos y puntos de adaptación según el contenedor. Usar resúmenes móviles, selección de columnas y detalle existentes. Mantener nombre, estado, fecha relevante y acción principal visibles; permitir desplazamiento para comparaciones extensas cuando sea necesario, con una señal clara.

**Aceptación:** se reconoce el estado y se abre un registro sin buscar acciones ocultas por scroll lateral. No exigir comprimir todas las columnas hasta volverlas ilegibles. Referencias: `ProyectosTablePage.tsx:189` y componentes de tablas de RFIs/Transacciones.

### 11. Distinguir estados vacíos según la causa

**Evidencia:** pasos 4, 10, 20 y 23. Requisiciones muestra «No se encontraron requisiciones» con «Por revisar 0» seleccionado y 18 aprobadas. Una búsqueda sin coincidencias en Documentos dice «Esta ubicación está vacía» e invita a subir documentos, aunque la ubicación tiene carpetas.

**Acción:** «No hay requisiciones por revisar. Hay 18 aprobadas», con acceso a la pestaña actual; «Sin coincidencias para esta búsqueda», con limpieza del filtro; y una explicación diferente cuando el módulo realmente no tiene registros. Reutilizar los patrones de orientación de Planos.

**Aceptación:** el mensaje identifica la causa y ofrece una acción existente que la resuelve. No cambiar automáticamente la pestaña operativa solo para evitar que se vea vacía.

Las pestañas de requisiciones también requieren explicar su relación: 18 aprobadas, 13 pagadas y 2 recibidas son conteos de revisión, pago y entrega que pueden superponerse. El código filtra cada dimensión por separado; no deben presentarse como grupos exclusivos cuya suma equivale al total. Aclarar esta relación con las etiquetas/ayudas actuales evita interpretar mal la carga pendiente.

### 12. Hacer escaneables las tarjetas de requisición

**Evidencia:** pasos 5 y 21. Las descripciones concatenan materiales en mayúsculas, fechas, monto y recorrido de estados. En móvil una sola solicitud ocupa una parte amplia de la pantalla y algunos controles de pestañas quedan fuera del área visible.

**Acción:** usar una vista previa breve de la descripción, conservar el conteo de materiales y el detalle expandible, y ordenar fecha relevante, monto y estados en una estructura consistente. Reducir repetición y espacios sin hacer más pequeños los objetivos de pulsación. Señalar la existencia de más pestañas en móvil o reorganizar las actuales sin ocultarlas.

**Aceptación:** se comparan solicitudes por solicitante, fecha y condición sin leer todo el catálogo; el texto completo permanece accesible en el detalle actual.

### 13. Explicar qué falta para enviar una requisición

**Evidencia:** paso 6. El formulario vacío presenta selección de partida, entrega, descripción y soportes; el botón de envío está desactivado. El flujo incorpora campos de familia/material después de seleccionar partida.

**Acción:** marcar requisitos y campos opcionales, explicar «Selecciona una partida para agregar materiales» y mostrar qué falta cerca del envío. Mantener la secuencia de captura existente. Etiquetar los controles de cierre y fechas en español de forma consistente.

**Aceptación:** antes de intentar enviar, se entiende la secuencia mínima; al detectar un error se indica el campo y se conserva lo capturado. Se revisó el estado vacío, no el envío completo.

### 14. Evitar que «sin costo capturado» se interprete como gratuito

**Evidencia:** pasos 5 y 21. Hay solicitudes aprobadas con monto total $0.00. El cálculo de total suma `item.monto || 0`, por lo que un importe ausente y un cero se presentan igual.

**Acción:** comprobar la disponibilidad del dato en el modelo actual. Cuando sea ausente, describir «Importe pendiente de captura»; cuando sea cero explícito, conservar $0.00. No obligar a capturar precio en una etapa que actualmente permite solicitar materiales sin cotización.

**Aceptación:** casos sin importe, cero válido y precio capturado tienen representaciones distintas y el total explica el alcance. La muestra por sí sola no permite determinar por qué cada solicitud vale cero. Referencia: `ProyectoRequisicionesPage.tsx:305,1415`.

### 15. Explicar qué cuenta «Total» en Documentos

**Evidencia:** paso 11. La raíz indica «Total: 0» junto a carpetas con cantidades, por ejemplo 1070 elementos. El total corresponde a documentos de la ubicación/consulta actual; las carpetas utilizan otro conteo.

**Acción:** rotular «Archivos en esta ubicación» o «Resultados de la búsqueda», según corresponda. Distinguir archivos y elementos de carpeta, y explicar el alcance cuando incluye subcarpetas. Corregir singular/plural, como «1 elementos».

**Aceptación:** el usuario entiende por qué puede haber cero archivos directos y carpetas con contenido, sin interpretar pérdida de documentos. Referencia: `ProyectoDocumentosPage.tsx:532`.

### 16. Colapsar ramas inactivas del árbol documental

**Evidencia:** paso 11. La barra lateral muestra un árbol profundo inicialmente expandido, con nombres largos y varios niveles sin contenido; aparecen desplazamientos anidados. La implementación inicia el conjunto de carpetas colapsadas vacío.

**Acción:** abrir la ubicación activa y sus ancestros, y dejar las otras ramas colapsadas al inicio. Conservar los controles de expansión existentes y dar acceso al nombre completo cuando se trunca. Mantener visibles los enlaces del módulo y el ámbito global.

**Aceptación:** se reconoce la carpeta actual y se accede a otro módulo sin recorrer toda la jerarquía. No borrar ni reorganizar carpetas reales para resolver la presentación. Referencia: `SidebarComponent.tsx:234`.

### 17. Presentar Reportes con lenguaje del usuario

**Evidencia:** paso 13. Nueve secciones seleccionadas y explicaciones extensas anteceden otros contenidos. Aparecen términos como «sanitizado», «nuevo formato» y referencias al orden cargado desde Excel, además de indicadores técnicos.

**Acción:** expresar qué recibe el lector: «Incidencias del periodo», «Avance y desviaciones», «Programa de obra». Llevar periodo, destinatario/propósito cuando ya exista y alcance a una jerarquía clara; resumir las explicaciones y mantener detalle opcional. Conservar configuración, programación e historial actuales. No crear más plantillas para compensar la complejidad del formulario.

**Aceptación:** se puede explicar qué incluirá el reporte antes de generarlo y entender los indicadores técnicos mediante definiciones breves. No se generó un PDF ni se programó un envío. Referencia: `ReportesPage.tsx:95,553`.

### 18. Hacer comparables los indicadores operativos sin mezclar poblaciones

**Evidencia:** pasos 7, 13 y 22. Programa indica 72 retrasadas; su nombre accesible especifica partidas y familias. Reportes indica 52 actividades atrasadas y una calificación de calidad de datos de 70/100. No se comprobó que ambas cifras deban coincidir.

**Acción:** mostrar unidad, fecha de corte y población: «72 partidas y familias con retraso» frente a «52 actividades atrasadas». Definir brevemente calidad de datos y los alcances de CPI/SPI usando los cálculos existentes. Presentar «Sin dato» cuando corresponda y separar ausencia de información de resultado cero.

**Aceptación:** una persona comprende por qué dos conteos distintos pueden ser correctos y qué limita la interpretación de un índice. La calidad de datos requiere revisar su fórmula antes de asociarla con una valoración del desempeño del equipo.

### 19. Depurar el catálogo aprovechando edición y revisión existentes

**Evidencia:** paso 16. En la primera página de proveedores se observaron varios campos no capturados, un nombre «0» y nombres parecidos. Estos últimos son candidatos a revisión, no duplicados confirmados.

**Acción:** revisar primero los proveedores usados en transacciones/requisiciones; completar datos necesarios para ese uso con las herramientas actuales. Ordenar y buscar para detectar variantes, confirmar identidad y usar la capacidad de consolidación/sincronización disponible cuando corresponda. Evitar fusionar automáticamente por parecido del nombre o forzar datos bancarios a quien no los necesita.

**Aceptación:** los proveedores de la muestra operativa son identificables y las correcciones mantienen sus relaciones. La tasa de registros incompletos de todo el catálogo no se midió.

### 20. Diferenciar consultar avisos de enviarlos

**Evidencia:** pasos 4, 14 y 17. La interfaz usa un punto en Tareas, «Notificaciones» dentro de Tareas, «Notificaciones» en Requisiciones y una campana de menciones en planos. La accesibilidad informa 337 notificaciones sin leer en el enlace de Tareas, mientras su indicador visible es un punto.

**Acción:** nombrar cada control según su función: «Avisos de tareas», «Enviar aviso» y «Menciones en planos». Mostrar conteo/estado con una jerarquía que no dependa de interpretar un punto. Mantener los sistemas y envíos existentes.

**Aceptación:** antes de abrir un control se sabe si consulta avisos o inicia un envío. No se contrastó la población de contadores de sistemas diferentes ni se enviaron mensajes.

### 21. Añadir nombres accesibles a controles existentes

**Evidencia:** DOM de Documentos muestra botones de vista y acciones sin nombre. El selector inicial de proyecto se presenta sin nombre en ciertos estados. En Tareas hay controles de selección/edición que requieren una asociación explícita con el registro. Otros módulos sí ofrecen nombres claros, como «Ver detalles de…» en requisiciones.

**Acción:** poner nombres específicos a vista de lista/cuadrícula, menú de fila, selector y casillas; exponer estado seleccionado/expandido cuando corresponda. Asociar etiquetas a entradas y nombrar acciones con el registro relevante. Un tooltip visual por sí solo no garantiza un nombre accesible.

**Aceptación:** el árbol accesible identifica propósito, registro y estado de cada control; el recorrido por teclado conserva un foco visible y lógico. Esto necesita prueba manual adicional con lector de pantalla y teclado, no solo capturas.

### 22. Dar legibilidad y señales de interacción al contenido operativo

**Evidencia:** paso 14 y código. Tareas usa `text-disabled-foreground` para valores que son contenido vigente; algunos títulos se editan y guardan al perder foco. Varias vistas utilizan texto tenue y acciones pequeñas de icono.

**Acción:** reservar el estilo deshabilitado para controles realmente deshabilitados, aumentar legibilidad del contenido secundario y señalar edición/guardado con los mecanismos actuales. Revisar tamaño y separación de puntos de estado, menús y expansores. Mantener texto de estado junto al color, como ya hace Programa móvil.

**Aceptación:** se distingue contenido editable de lectura y se percibe el resultado del guardado; el contraste se mide sobre colores efectivos y se prueban foco, zoom y pulsación táctil. No se afirma cumplimiento ni incumplimiento global de WCAG a partir de esta revisión. Referencia: `TareasPage.tsx:123`.

### 23. Separar lectura de edición en el perfil viewer

**Evidencia de código:** `src/index.css:5` aplica `pointer-events: none` y opacidad a botones, entradas y otros controles bajo `data-viewer-readonly`, con excepciones. Esto puede bloquear búsquedas/filtros/expansiones de consulta y no describe por sí mismo el comportamiento del teclado.

**Acción:** desactivar únicamente acciones de modificación según las capacidades existentes; conservar navegación, consulta, filtros y expansión. Mantener autorización en backend y usar atributos semánticos adecuados para controles deshabilitados. El CSS no debe ser la definición de permisos.

**Aceptación:** un viewer puede buscar y leer con ratón y teclado, mientras las escrituras permanecen restringidas. Riesgo identificado en código; no se comprobó un bypass de autorización ni se probó una sesión viewer.

### 24. Explicar los estados de preparación y sincronización de Bitácora

**Evidencia:** paso 8 documenta «Preparando Bitácora offline»; una visita posterior, paso 18, mostró registros y «Sincronizado». Por tanto, no hay evidencia de un fallo permanente. No se midió el tiempo de preparación.

**Acción:** distinguir preparación inicial de error, mantener la recuperación existente y explicar qué se está preparando. Reducir repetición de «Sincronizado» en cada fila cuando todo está actualizado, preservando los casos pendientes o fallidos. Mantener visible la última actualización.

**Aceptación:** una carga normal no parece un error; si falla, el usuario entiende el estado y la acción. Validar aparte inicio en frío, modo desconectado y reconexión con las pruebas offline ya disponibles.

### 25. Hacer más útil el contexto inicial del asistente

**Evidencia:** paso 17. El asistente se abre desde un icono pequeño, explica consulta de proyectos y presenta ejemplos con menciones. Ya dispone de contexto de ruta y referencias a proyectos.

**Acción:** usar el proyecto activo en ejemplos cuando exista, explicar brevemente cómo mencionarlo y mejorar el reconocimiento del acceso donde haya espacio. Mantener su carácter de consulta y el alcance real por rol.

**Aceptación:** se sabe para qué sirve y cómo formular una pregunta sobre la obra actual. No se enviaron preguntas ni se evaluaron exactitud de respuestas, latencia o costos.

### 26. Uniformar nombres y énfasis visual sin perder precisión

**Evidencia:** varias pantallas muestran nombres importados en mayúsculas/con guiones bajos, tarjetas con jerarquías diferentes y acciones secundarias de peso visual semejante a la acción principal.

**Acción:** reutilizar tokens y componentes actuales para cabeceras, filtros y acciones. Reservar el mayor énfasis para la acción principal, y una señal consistente para operaciones destructivas. Usar una etiqueta de presentación legible cuando ya exista, conservando código/nombre original en el detalle para trazabilidad. Acordar un pequeño vocabulario de gasto, pago, entrega, revisión y avance.

**Aceptación:** el mismo concepto mantiene nombre y tratamiento entre módulos. No traducir o modificar automáticamente catálogos del cliente; revisar antes el uso de esos identificadores.

## Accesibilidad: verificación necesaria

Los riesgos observados están ligados principalmente a los pasos 1, 11, 12, 14 y 21. Se revisaron nombres expuestos en el DOM y presentación visual, pero no se ejecutó una auditoría formal con lector de pantalla, contraste completo, zoom o navegación exhaustiva por teclado.

| Riesgo | Qué se vio o leyó | Qué debe verificarse al corregir |
|---|---|---|
| Controles sin nombre | Botones de vista/acciones en Documentos y algunos controles de tablas | Nombre, estado, asociación con registro y lectura con tecnología de asistencia |
| Contenido de bajo énfasis | Estilo de texto deshabilitado usado para datos vigentes en Tareas | Contraste efectivo en cada estado y tema; lectura con zoom |
| Interacciones por color/icono | Puntos de pipeline, avisos y acciones pequeñas | Texto equivalente, foco visible, tamaño y separación táctil |
| Lectura restringida por CSS | Bloqueo general bajo viewer con excepciones | Paridad ratón/teclado y separación real de consulta/escritura |
| Tablas extensas | Acciones y columnas fuera del ancho disponible | Orden de lectura, acceso a campos esenciales y detalle sin pérdida de contexto |
| Guardado implícito | Edición de tarea al perder foco | Etiqueta, señal de edición, anuncio del resultado y recuperación del error |

## Secuencia de trabajo propuesta

### Primero: confiabilidad y significado

Resolver 01, 02, 03, 04 y 05. En paralelo con la validación de perfiles, revisar 06 y 23. La meta es que la aplicación cargue, sus cifras se entiendan y el resultado de las acciones sea inequívoco. No iniciar un rediseño general mientras estos problemas permanezcan.

### Después: operación diaria

Atender 07–16 y 21–22. Dar prioridad al contexto de proyecto, Tareas, Requisiciones y las tablas usadas a diario. Trabajar con los componentes actuales, validar escritorio y móvil, y evitar que cada módulo adopte una solución distinta al mismo problema.

### Finalmente: aprovechamiento y consistencia

Revisar 17–20 y 24–26. Simplificar reportes, conteos, catálogos y estados de carga; hacer reconocibles los avisos y el asistente. Mantener esta fase ajustada a los recorridos con uso confirmado.

## Cómo comprobar que la mejora funciona

Usar cuentas de prueba y una copia representativa de los datos. Validar con personas de los perfiles principales, sin establecer porcentajes de mejora hasta tener una línea base.

1. **Interpretación:** pedir que expliquen «47% ejercido» y «33.5% físico» y describan el alcance de un periodo. Registrar confusiones, no solo clics.
2. **Requisiciones:** encontrar una solicitud, identificar lo pendiente y explicar el efecto de retroceder una etapa antes de confirmar. Medir tiempo, intentos y errores de interpretación.
3. **Tareas:** encontrar un pendiente vencido de una obra, abrirlo y volver conservando contexto. Medir desplazamientos y cambios de filtro innecesarios.
4. **Documentos:** localizar un archivo, interpretar conteos y recuperarse de una búsqueda vacía. Registrar dónde abandona o cambia de estrategia.
5. **Confiabilidad:** probar Control y P&L con la muestra real y mayor volumen; medir latencia y revisar lecturas de consultas. Simular fallos para confirmar que el resto de la aplicación sigue accesible.
6. **Guardado parcial:** provocar fallo de adjuntos en pruebas, confirmar una sola solicitud y reintentar solo los archivos pendientes.
7. **Roles y accesibilidad:** recorrer inicio, denegación, menús, filtros y controles con cada perfil y teclado. Medir contraste y probar lectura con asistencia.

Estos controles pueden realizarse con las pruebas, datos y funciones actuales. No necesitan añadir telemetría, un nuevo centro de notificaciones ni otro tablero para empezar.

## Recorrido numerado y salud general

«Con fricción» significa que la entrada revisada funciona, pero tiene oportunidades; no implica que se verificó todo su CRUD. «Orientación adecuada» corresponde al estado vacío observado. Los archivos en blanco solo se incluyen como evidencia del bloqueo, no como capturas válidas para juzgar su diseño interno.

| Paso | Pantalla/estado | Salud general | Evidencia y límite |
|---|---|---|---|
| 1 | Proyectos | Con fricción | Nombre del porcentaje y ancho de tabla; captura 01 |
| 2 | Presupuesto de Sunrise | Con fricción | Indicadores, jerarquía y periodo; captura 02 |
| 3 | Control | Bloqueado | Pantalla blanca + timeout; captura 03-control-bloqueado |
| 4 | Requisiciones: Por revisar | Con fricción | Vacío con 18 solicitudes existentes; captura 04 |
| 5 | Requisiciones: Aprobadas | Con fricción | Densidad, importes y pipeline; captura 05 |
| 6 | Nueva requisición | Con fricción | Formulario vacío, no enviado; captura 06 |
| 7 | Programa de obra | Funciona, con oportunidades | Gantt, jerarquía e indicadores; captura 07 |
| 8 | Preparación de Bitácora | Estado transitorio mejorable | Cargó en la visita posterior; captura 08 |
| 9 | RFIs sin registros | Con fricción | Tabla desborda; no se revisaron RFIs reales; captura 09 |
| 10 | Planos sin registros | Orientación adecuada | Sin revisión de visor/anotaciones con planos reales; captura 10 |
| 11 | Documentos del proyecto | Con fricción | Conteos, árbol y controles; captura 11 |
| 12 | Transacciones del proyecto | Con fricción | Columnas y acciones fuera de vista; captura 12 |
| 13 | Reportes | Con fricción | Configuración/resumen; sin generación o envío; captura 13 |
| 14 | Tareas | Con fricción | Prioridad y acceso a registros; captura 14 |
| 15 | P&L | Bloqueado | Pantalla blanca + timeout; captura 15 |
| 16 | Proveedores | Con fricción | Muestra del catálogo; duplicados no confirmados; captura 16 |
| 17 | Asistente | Orientación adecuada, alcance limitado | Sin enviar preguntas; captura 17 |
| 18 | Bitácora cargada | Funciona, con oportunidades | Agrupación y sincronización visibles; captura 18 |
| 19 | Presupuesto móvil | Con fricción | Ajusta ancho, resumen empuja registros; captura 19 |
| 20 | Requisiciones móvil: Por revisar | Con fricción | Vacío y pestañas desplazables; captura 20 |
| 21 | Requisiciones móvil: Aprobadas | Con fricción | Densidad y longitud de la tarjeta; captura 21 |
| 22 | Programa móvil | Buena adaptación observada | Lista, estado escrito y avance; captura 22 |
| 23 | Búsqueda documental sin coincidencias | Con fricción | Mensaje confunde búsqueda con ubicación vacía; captura 23 |

## Galería de evidencia

Las capturas y los pasos se mantienen en la secuencia original de toma; cada paso corresponde a un estado observado. Cada imagen es de esta auditoría. La captura 08 representa un estado transitorio, y las capturas 03 y 15 documentan bloqueos; no se usan para inferir diseño de contenido no cargado.

### Captura 01 — Proyectos · paso 1

Porcentaje llamado avance de obra y tabla extensa. Hallazgos 02 y 10.

![Proyectos](01-proyectos.png)

### Captura 02 — Presupuesto · paso 2

Resumen financiero, porcentaje repetido y distribución que retrasa el acceso a partidas. Hallazgos 02, 03 y 09.

![Presupuesto de Sunrise](02-presupuesto.png)

### Captura 03 — Control bloqueado · paso 3

Evidencia de la pantalla blanca; consulta identificada en logs. No se pudo evaluar el diseño interno. Hallazgo 01.

![Control bloqueado](03-control-bloqueado.png)

### Captura 04 — Requisiciones por revisar · paso 4

El total es 18 y la pestaña activa tiene cero pendientes; el mensaje no explica esa diferencia. Hallazgo 11.

![Requisiciones por revisar](04-requisiciones.png)

### Captura 05 — Requisiciones aprobadas · paso 5

Tarjetas extensas, importes y recorrido de estados. Hallazgos 04, 12 y 14.

![Requisiciones aprobadas](05-requisiciones-aprobadas.png)

### Captura 06 — Formulario vacío · paso 6

La secuencia y requisitos pueden explicarse mejor. No se envió la solicitud. Hallazgo 13.

![Nueva requisición](06-nueva-requisicion.png)

### Captura 07 — Programa de obra · paso 7

Avance físico, jerarquía y controles de retrasos. Conservar la relación con partidas y aclarar unidades. Hallazgos 02 y 18.

![Programa de obra](07-programa.png)

### Captura 08 — Preparación de Bitácora · paso 8

Estado transitorio observado. La captura 18 prueba que después cargó; no es evidencia de un fallo permanente. Hallazgo 24.

![Preparación de Bitácora](08-bitacora.png)

### Captura 09 — RFIs sin registros · paso 9

Las columnas exceden el área disponible incluso sin registros. Hallazgo 10.

![RFIs](09-rfis.png)

### Captura 10 — Planos sin registros · paso 10

La orientación inicial es un patrón útil. No se evaluó visor, anotaciones o versiones con un plano real.

![Planos sin registros](10-planos.png)

### Captura 11 — Documentos del proyecto · paso 11

Total local frente a carpetas con elementos, árbol expandido y acciones de icono. Hallazgos 15, 16 y 21.

![Documentos del proyecto](11-documentos-proyecto.png)

### Captura 12 — Transacciones · paso 12

Las columnas principales consumen el ancho y desplazan información operativa. Hallazgo 10.

![Transacciones](12-transacciones.png)

### Captura 13 — Configuración de reportes · paso 13

Muchas opciones y explicaciones antes del resumen. Hallazgo 17. Los indicadores inferiores se inspeccionaron también en el DOM, fuera de esta primera vista.

![Reportes](13-reportes.png)

### Captura 14 — Tareas · paso 14

La cabecera y controles retrasan el acceso a las filas. Hallazgos 08, 09 y 22.

![Tareas](14-tareas.png)

### Captura 15 — P&L bloqueado · paso 15

Pantalla blanca y consulta identificada en logs. No se pudo evaluar su contenido. Hallazgo 01.

![P&L bloqueado](15-pnl.png)

### Captura 16 — Proveedores · paso 16

Muestra de nombres/campos que requieren revisión. No demuestra duplicidad del catálogo. Hallazgo 19.

![Proveedores](16-proveedores.png)

### Captura 17 — Asistente abierto · paso 17

Orientación inicial y ejemplos de consulta. No se enviaron preguntas. Hallazgo 25.

![Asistente](17-asistente.png)

### Captura 18 — Bitácora cargada · paso 18

Agrupación y sincronización visibles; confirma recuperación respecto de captura 08. Hallazgo 24.

![Bitácora cargada](18-bitacora-revisita.png)

### Captura 19 — Presupuesto móvil · paso 19

Las métricas ocupan casi toda la primera vista a 390 × 844. Hallazgo 09.

![Presupuesto móvil](19-presupuesto-movil.png)

### Captura 20 — Requisiciones móvil, sin pendientes · paso 20

Vacío poco explicativo y pestañas con desplazamiento. Hallazgos 11 y 12.

![Requisiciones móvil](20-requisiciones-movil.png)

### Captura 21 — Requisiciones aprobadas móvil · paso 21

La descripción larga ocupa gran parte de la tarjeta. Hallazgos 12 y 14.

![Requisición aprobada móvil](21-requisiciones-aprobadas-movil.png)

### Captura 22 — Programa móvil · paso 22

Buena adaptación a lista, con fechas, estado escrito y avance físico. Patrón que conviene reutilizar.

![Programa móvil](22-programa-movil.png)

### Captura 23 — Documentos sin coincidencias · paso 23

La búsqueda sin resultados se interpreta como ubicación vacía. Hallazgo 11.

![Búsqueda documental sin coincidencias](23-documentos-sin-resultados.png)

## Límites y siguiente validación

La muestra no demuestra comportamiento uniforme en producción ni en todas las obras. No se midieron adopción, tasa de éxito, tiempos de tarea o retorno económico, por lo que no se asignan puntuaciones globales ni porcentajes de mejora inventados. Los timeouts son episodios observados; se debe confirmar su frecuencia mediante diagnóstico de las consultas.

Se revisaron estáticamente rutas de perfiles y capacidades relacionadas. Quedan pendientes las sesiones de contratista, finanzas, viewer y almacenista; rutas comerciales y administración; formularios completos, importación de Excel/facturas, generación y envío de reportes, offline real y operaciones de edición/eliminación. Su validación debe realizarse en pruebas para preservar los datos conectados.

La diferencia entre importes de Presupuesto y totales de Transacciones no se declara un error contable sin conciliar estados, fuentes, monedas y periodo. Del mismo modo, 72 partidas/familias retrasadas y 52 actividades atrasadas no se tratan como cifras contradictorias sin comprobar su población.

El próximo entregable de implementación puede tomar este informe como backlog: corregir primero 01–06 y 23, después validar recorridos operativos y aplicar las mejoras visuales en componentes compartidos. El criterio de éxito es aprovechar mejor los módulos actuales y reducir ambigüedad y trabajo innecesario.
