# OGC · Reorganización de acciones y controles

17 de noviembre de 2026 · Auditoría y simulación previa a cambios

27 propuestas: 13 de prioridad alta, 12 media y 2 baja. 69 capturas reales aceptadas; 54 vistas propuestas principales en escritorio y móvil, más estados complementarios. No se modificó la aplicación.

## Criterio de diseño

Conservar una acción principal visible donde la tarea frecuente lo requiera. Agrupar importaciones, historial y mantenimiento por propósito; usar «Agregar» cuando existen varias modalidades. Presupuesto sigue el ejemplo solicitado con un único menú y Total Ingresos visible. Mantener filtros y cambios de vista cerca del contenido. No ocultar Guardar, Cancelar, revisiones ni confirmaciones dentro de menús. Los iconos necesitan un nombre accesible y las acciones que cambian estado necesitan verbos explícitos. Las prioridades reflejan claridad y espacio observado; no hay datos de frecuencia de uso ni pruebas con usuarios.

## Alcance y límites

Sesión autenticada existente y proyecto de obra Lote 77. Sin comprobación de todos los roles. Las vistas por proyecto de Ventas no estaban disponibles: no había un proyecto seleccionable y la gestión de usuarios mostraba «Sin acceso a ventas». P24 y P25 son hipótesis basadas en código. /dashboard quedó en blanco por un identificador de desarrollo inválido; se conserva únicamente como diagnóstico. Las rutas públicas de autenticación y legales, y algunos detalles/diálogos secundarios, se revisaron en código. El inventario distingue esta cobertura.

Las capturas actuales son originales. Las propuestas reutilizan una referencia estática saneada de cada pantalla y los componentes Button, DropdownMenu y Dialog existentes. Las tablas de la maqueta se limitan a 12 filas, los avatares externos se reemplazan por iniciales y los canvas se identifican como referencias. Sólo los controles propuestos son interactivos; abrir una acción muestra una demostración, sin ejecutar cargas, pagos, cambios de permisos ni eliminaciones. Los selectores simplifican las opciones para mostrar distribución; la implementación debe conservar búsqueda, multiselección, filtros y reglas originales. P20 es un ejemplo ilustrativo de tarjeta expandida. En Documentos, el árbol se pliega en móvil para dar espacio al registro; debe reutilizarse el control Carpetas existente.

## Salud del recorrido observado

- Presupuesto: varias acciones de igual jerarquía y cabecera alta en móvil; propuestas P01–P04 y P27.
- Operación de obra: Programa tiene un Archivo útil que puede absorber historial; Bitácora requiere sólo un selector de vista más compacto. Requisiciones y RFIs presentan oportunidades de agrupar utilidades y aclarar transiciones.
- Documentos y Planos: el visor debe priorizar herramientas repetidas; las acciones del archivo y las duplicadas por fila pueden agruparse. El desplazamiento y ajuste de las tablas móviles requiere una revisión de contenido posterior; esta entrega se centra en controles.
- Administración y finanzas: preservar filtros, ubicación y permisos. Sin proyectos seleccionables no es posible validar los flujos completos de Ventas.
- Accesibilidad: se comprobaron nombres del menú propuesto, apertura con teclado, Escape y retorno de foco en Presupuesto; no constituye una auditoría integral.

## Patrones que conviene conservar

Control ya presenta una acción Reporte clara. Reportes separa Generar, Programaciones e Historial. Exportar PDF, Nueva entrada de Bitácora, Nueva tarea, Nueva carpeta y Crear proyecto tienen acciones de cierre y confirmación comprensibles. Los diálogos de carga separan selección, validación y confirmación; no conviene ocultar estos pasos. El formulario completo Nueva RFI ya conserva acciones de pie visibles. Configuración de P&L aplica supuestos inmediatamente: no añadir un falso Guardar. Proveedores por proyecto ya ofrece un único acceso de gestión. El asistente conserva su tamaño compacto y el botón de envío identificado. Usuarios e invitaciones deben conservar las restricciones de rol. /upload ya tiene una entrada simple de selección.

## Orden sugerido de adopción

1. Revisar P01, P03, P05, P06 y P18 para acordar la jerarquía común de cabeceras.
2. Acordar filtros P02, P07, P12 y P26, conservando todas las combinaciones actuales.
3. Aplicar menús por archivo/registro y verbos de transición; validar permisos en cada estado.
4. Ajustar los pies de formularios y validar con datos y roles representativos.
5. Validar P24 y P25 cuando haya acceso a un proyecto de Ventas.

## Propuestas completas

### P01 · Obra › Presupuesto › Página · cabecera

**Un solo menú para las acciones del presupuesto · Prioridad Alta**

- Problema: Excel de origen, Agregar y el menú de acciones compiten en la misma cabecera. En móvil ocupan varias filas.
- Propuesta: Reunir las ocho acciones en un menú «…» con grupos y conservar Total Ingresos a la vista.
- Beneficio: Menos controles visibles y un lugar predecible para las acciones.
- Debe conservarse: Crear reporte financiero sólo para admin; ingresos según permiso; las cargas conservan sus restricciones. No deshabilitar la consulta del Excel cuando un presupuesto esté incompleto.
- Evidencia: [001 · 001 Obra Presupuesto Pagina Cabecera Actual Desktop](actuales/001_Obra_Presupuesto_Pagina_Cabecera_Actual_Desktop.jpg); [002 · 002 Obra Presupuesto Menu Agregar Actual Desktop](actuales/002_Obra_Presupuesto_Menu_Agregar_Actual_Desktop.jpg); [005 · 005 Obra Presupuesto Menu Acciones Actual Desktop](actuales/005_Obra_Presupuesto_Menu_Acciones_Actual_Desktop.jpg); [064 · 064 Obra Presupuesto Pagina Cabecera Actual Movil](actuales/064_Obra_Presupuesto_Pagina_Cabecera_Actual_Movil.jpg).
- Simulación: [escritorio](propuestas/P01_Obra_Presupuesto_Pagina_cabecera_Propuesta_Desktop.jpg), [móvil](propuestas/P01_Obra_Presupuesto_Pagina_cabecera_Propuesta_Movil.jpg), [comparativa](comparativas/P01_Obra_Presupuesto_Pagina_cabecera_Antes_Despues.jpg).
- Código: `src/pages/Presupuesto/PresupuestoPage.tsx`, `src/components/transactions/AddTransactionMenu.tsx`, `src/components/Presupuesto/BudgetOriginal.tsx`.

### P02 · Obra › Presupuesto › Página · filtros y visualización

**Filtros alineados y opciones de vista identificables · Prioridad Media**

- Problema: Los tres filtros ocupan una franja alta y Precio unitario queda aislado debajo.
- Propuesta: Una barra compacta con Partida, Familia y Fecha; reunir las opciones de columnas en Vista. En móvil apilar sin ocultar las etiquetas.
- Beneficio: Relacionar filtros y presentación con la tabla que controlan.
- Debe conservarse: Selección múltiple, búsqueda, chips y limpieza de filtros. El precio unitario sigue siendo una opción de vista, no una acción de edición.
- Evidencia: [001 · 001 Obra Presupuesto Pagina Cabecera Actual Desktop](actuales/001_Obra_Presupuesto_Pagina_Cabecera_Actual_Desktop.jpg); [064 · 064 Obra Presupuesto Pagina Cabecera Actual Movil](actuales/064_Obra_Presupuesto_Pagina_Cabecera_Actual_Movil.jpg).
- Simulación: [escritorio](propuestas/P02_Obra_Presupuesto_Pagina_filtros_y_visualizacion_Propuesta_Desktop.jpg), [móvil](propuestas/P02_Obra_Presupuesto_Pagina_filtros_y_visualizacion_Propuesta_Movil.jpg), [comparativa](comparativas/P02_Obra_Presupuesto_Pagina_filtros_y_visualizacion_Antes_Despues.jpg).
- Código: `src/pages/Presupuesto/PresupuestoPage.tsx`.

### P03 · Obra › Presupuesto › Diálogo · Ingresos

**Nuevo ingreso visible; importación e historial en un menú · Prioridad Alta**

- Problema: Tres botones de la misma jerarquía ocupan varias filas dentro del diálogo.
- Propuesta: Conservar Nuevo ingreso como principal y reunir Carga masiva e Historial de cargas en «…».
- Beneficio: Entrada más clara y cabecera más corta en móvil.
- Debe conservarse: El lector conserva la consulta; sólo los roles autorizados ven las acciones de registro y carga. Las acciones de cada ingreso continúan siendo contextuales.
- Evidencia: [006 · 006 Obra Presupuesto Dialog Ingresos Actual Desktop](actuales/006_Obra_Presupuesto_Dialog_Ingresos_Actual_Desktop.jpg); [065 · 065 Obra Presupuesto Dialog Ingresos Actual Movil](actuales/065_Obra_Presupuesto_Dialog_Ingresos_Actual_Movil.jpg).
- Simulación: [escritorio](propuestas/P03_Obra_Presupuesto_Dialogo_Ingresos_Propuesta_Desktop.jpg), [móvil](propuestas/P03_Obra_Presupuesto_Dialogo_Ingresos_Propuesta_Movil.jpg), [comparativa](comparativas/P03_Obra_Presupuesto_Dialogo_Ingresos_Antes_Despues.jpg).
- Código: `src/components/modals/ingresos-modal.tsx`.

### P04 · Obra › Presupuesto › Diálogo · Registrar pagos

**Controles secundarios compactos en el registro de pagos · Prioridad Media**

- Problema: Pagado/Por pagar y Agregar Partida tienen gran tamaño; Nuevo proveedor es poco explícito.
- Propuesta: Usar un selector de estado compacto, etiquetar Crear proveedor y Agregar partida con la misma escala de controles. Conservar Cancelar y Guardar en el pie.
- Beneficio: Menos ruido sin agregar pasos al registro.
- Debe conservarse: Cálculo del total, múltiples partidas, campos obligatorios y estado deshabilitado de Guardar. El formulario continúa desplazándose dentro del panel.
- Evidencia: [003 · 003 Obra Presupuesto Dialog RegistrarPagos Actual Desktop](actuales/003_Obra_Presupuesto_Dialog_RegistrarPagos_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P04_Obra_Presupuesto_Dialogo_Registrar_pagos_Propuesta_Desktop.jpg), [móvil](propuestas/P04_Obra_Presupuesto_Dialogo_Registrar_pagos_Propuesta_Movil.jpg), [comparativa](comparativas/P04_Obra_Presupuesto_Dialogo_Registrar_pagos_Antes_Despues.jpg).
- Código: `src/components/modals/add-payment-modal.tsx`.

### P05 · General › Proyectos › Página · cabecera

**Nuevo proyecto como acción principal · Prioridad Alta**

- Problema: Creaciones de proyectos, Agregar Proyecto y Subir Transacciones ocupan la cabecera; configurar ubicaciones añade otro botón junto al filtro.
- Propuesta: Un botón Nuevo proyecto y un menú con historial, carga y configuración. Mantener el filtro de ubicación junto al buscador.
- Beneficio: Jerarquía clara y una cabecera más compacta.
- Debe conservarse: Historial accesible para consultar o reanudar creaciones; los permisos de administración no cambian.
- Evidencia: [038 · 038 General Proyectos Pagina Cabecera Actual Desktop](actuales/038_General_Proyectos_Pagina_Cabecera_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P05_General_Proyectos_Pagina_cabecera_Propuesta_Desktop.jpg), [móvil](propuestas/P05_General_Proyectos_Pagina_cabecera_Propuesta_Movil.jpg), [comparativa](comparativas/P05_General_Proyectos_Pagina_cabecera_Antes_Despues.jpg).
- Código: `src/pages/ProyectosTable/ProyectosTablePage.tsx`.

### P06 · Obra › Transacciones › Página · cabecera

**Separar registro de transacciones y herramientas · Prioridad Alta**

- Problema: Cuatro botones amplios compiten con las cifras de la cabecera.
- Propuesta: Conservar Agregar y agrupar las herramientas en «…». Escribir Sincronizar documentos completo en el menú.
- Beneficio: Reducir ancho sin esconder el registro frecuente.
- Debe conservarse: Indicadores sin proveedor y sin documentos visibles; permisos por rol y estados de carga; sincronizar no se ejecuta al abrir el menú.
- Evidencia: [026 · 026 Obra Transacciones Pagina Cabecera Actual Desktop](actuales/026_Obra_Transacciones_Pagina_Cabecera_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P06_Obra_Transacciones_Pagina_cabecera_Propuesta_Desktop.jpg), [móvil](propuestas/P06_Obra_Transacciones_Pagina_cabecera_Propuesta_Movil.jpg), [comparativa](comparativas/P06_Obra_Transacciones_Pagina_cabecera_Antes_Despues.jpg).
- Código: `src/pages/ProyectoTransaccionesTable/ProyectoTransaccionesTablePage.tsx`.

### P07 · Obra › Transacciones › Panel · filtros

**Filtros avanzados sin desplazar la lista · Prioridad Alta**

- Problema: Al expandir filtros, nueve controles desplazan la tabla casi una pantalla.
- Propuesta: Abrir los filtros en un panel contextual con etiquetas y conservar un contador de filtros activos junto al buscador. Mostrar chips para quitar filtros individuales.
- Beneficio: Seguir viendo resultados y comprender qué está filtrado.
- Debe conservarse: Los valores aplicados persisten al cerrar el panel; Limpiar filtros sigue disponible. Aplicar y Cancelar sólo aparecen en el simulador de esta propuesta, sin cambiar la semántica real hasta implementarla.
- Evidencia: [027 · 027 Obra Transacciones Panel Filtros Actual Desktop](actuales/027_Obra_Transacciones_Panel_Filtros_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P07_Obra_Transacciones_Panel_filtros_Propuesta_Desktop.jpg), [móvil](propuestas/P07_Obra_Transacciones_Panel_filtros_Propuesta_Movil.jpg), [comparativa](comparativas/P07_Obra_Transacciones_Panel_filtros_Antes_Despues.jpg).
- Código: `src/pages/ProyectoTransaccionesTable/ProyectoTransaccionesTablePage.tsx`.

### P08 · Obra › Programa › Página · barra de herramientas

**Archivo reúne importación, historial y exportación · Prioridad Alta**

- Problema: Historial de cargas está separado de Archivo, aunque ambos pertenecen al mismo trabajo con archivos.
- Propuesta: Mover historial dentro de Archivo y usar altura compacta para las herramientas. Mantener búsqueda, estado, Hoy y Vista accesibles.
- Beneficio: Más espacio para el Gantt y agrupación coherente.
- Debe conservarse: Alertas y retrasos siguen visibles; Actividades por frente se conserva. No ocultar las herramientas de edición por fila.
- Evidencia: [012 · 012 Obra Programa Pagina BarraHerramientas Actual Desktop](actuales/012_Obra_Programa_Pagina_BarraHerramientas_Actual_Desktop.jpg); [013 · 013 Obra Programa Menu Archivo Actual Desktop](actuales/013_Obra_Programa_Menu_Archivo_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P08_Obra_Programa_Pagina_barra_de_herramientas_Propuesta_Desktop.jpg), [móvil](propuestas/P08_Obra_Programa_Pagina_barra_de_herramientas_Propuesta_Movil.jpg), [comparativa](comparativas/P08_Obra_Programa_Pagina_barra_de_herramientas_Antes_Despues.jpg).
- Código: `src/pages/Programa Obra/ProgramaObra.tsx`.

### P09 · Obra › Bitácora › Página · selector de vista

**Un selector de vista compacto en Bitácora · Prioridad Baja**

- Problema: Agrupado y Calendario tienen el mismo peso visual que Agregar reporte.
- Propuesta: Usar un control segmentado compacto para la vista; conservar Agregar reporte como principal y los accesos de categoría como atajos contextuales.
- Beneficio: Distinguir consulta de creación sin ocultar funciones.
- Debe conservarse: El estado En línea y los avisos offline continúan visibles. Las acciones de conflictos de sincronización no se guardan en un menú genérico.
- Evidencia: [015 · 015 Obra Bitacora Pagina Controles Actual Desktop](actuales/015_Obra_Bitacora_Pagina_Controles_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P09_Obra_Bitacora_Pagina_selector_de_vista_Propuesta_Desktop.jpg), [móvil](propuestas/P09_Obra_Bitacora_Pagina_selector_de_vista_Propuesta_Movil.jpg), [comparativa](comparativas/P09_Obra_Bitacora_Pagina_selector_de_vista_Antes_Despues.jpg).
- Código: `src/pages/Bitacora/BitacoraPage.tsx`.

### P10 · Obra › Requisiciones › Página · cabecera

**Nueva requisición visible y utilidades agrupadas · Prioridad Alta**

- Problema: Notificaciones, Historial y Nueva Requisición usan el mismo tamaño y estilo.
- Propuesta: Dar prioridad a Nueva requisición y agrupar seguimiento en «…». Conservar el indicador de novedades al lado del disparador.
- Beneficio: Entrada clara al flujo sin perder las novedades.
- Debe conservarse: Contadores de estados, permisos de solicitante/almacenista y filtros actuales. No cambiar estados desde la cabecera.
- Evidencia: [017 · 017 Obra Requisiciones Pagina CabeceraFiltros Actual Desktop](actuales/017_Obra_Requisiciones_Pagina_CabeceraFiltros_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P10_Obra_Requisiciones_Pagina_cabecera_Propuesta_Desktop.jpg), [móvil](propuestas/P10_Obra_Requisiciones_Pagina_cabecera_Propuesta_Movil.jpg), [comparativa](comparativas/P10_Obra_Requisiciones_Pagina_cabecera_Antes_Despues.jpg).
- Código: `src/pages/ProyectoRequisiciones/ProyectoRequisicionesPage.tsx`.

### P11 · Obra › Requisiciones › Tarjeta · acciones de estado

**Distinguir el avance de las acciones que lo modifican · Prioridad Media**

- Problema: Los círculos Por revisar, Pagada y Recibida se parecen a indicadores; no explican claramente que permiten acciones.
- Propuesta: Conservar el avance como información y reunir sus operaciones con verbos dentro del menú de la tarjeta. Mantener las revisiones y confirmaciones existentes.
- Beneficio: Hacer explícita la consecuencia de cada acción.
- Debe conservarse: Sólo mostrar operaciones permitidas para el rol y estado. No saltar aprobaciones, pagos ni entregas; ninguna selección de la simulación modifica datos.
- Evidencia: [017 · 017 Obra Requisiciones Pagina CabeceraFiltros Actual Desktop](actuales/017_Obra_Requisiciones_Pagina_CabeceraFiltros_Actual_Desktop.jpg); [018 · 018 Obra Requisiciones Dialog NuevaRequisicion Actual Desktop](actuales/018_Obra_Requisiciones_Dialog_NuevaRequisicion_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P11_Obra_Requisiciones_Tarjeta_acciones_de_estado_Propuesta_Desktop.jpg), [móvil](propuestas/P11_Obra_Requisiciones_Tarjeta_acciones_de_estado_Propuesta_Movil.jpg), [comparativa](comparativas/P11_Obra_Requisiciones_Tarjeta_acciones_de_estado_Antes_Despues.jpg).
- Código: `src/pages/ProyectoRequisiciones/ProyectoRequisicionesPage.tsx`.

### P12 · Obra › RFIs › Página · filtros de estado y creación rápida

**Estados compactos y Continuar con etiqueta visible · Prioridad Alta**

- Problema: Seis controles de filtro y la fila de creación rápida exceden el ancho visible; Continuar es sólo un icono.
- Propuesta: Un selector Estado, el filtro Mi responsabilidad y una acción Nueva RFI. En creación rápida, mostrar Cancelar y Continuar con texto.
- Beneficio: Filtros legibles y acciones de creación que no quedan fuera de pantalla.
- Debe conservarse: Contadores, búsqueda y rutas de detalle; Continuar debe informar que crea un borrador. No se crea ningún borrador en esta auditoría.
- Evidencia: [019 · 019 Obra RFIs Pagina Registro Actual Desktop](actuales/019_Obra_RFIs_Pagina_Registro_Actual_Desktop.jpg); [021 · 021 Obra RFIs Formulario CreacionRapida Actual Desktop](actuales/021_Obra_RFIs_Formulario_CreacionRapida_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P12_Obra_RFIs_Pagina_filtros_de_estado_y_creacion_rapida_Propuesta_Desktop.jpg), [móvil](propuestas/P12_Obra_RFIs_Pagina_filtros_de_estado_y_creacion_rapida_Propuesta_Movil.jpg), [comparativa](comparativas/P12_Obra_RFIs_Pagina_filtros_de_estado_y_creacion_rapida_Antes_Despues.jpg).
- Código: `src/pages/RFIs/RFIListPage.tsx`.

### P13 · Obra › RFIs › Diálogo · detalle

**Hacer explícitas las transiciones de estado de RFI · Prioridad Alta**

- Problema: Abrir RFI puede interpretarse como navegar al detalle, pero es una transición del flujo.
- Propuesta: Etiquetar la acción como Cambiar a abierta y mantener Editar RFI en un menú secundario. Mostrar siempre el estado actual.
- Beneficio: Evitar ambigüedad antes de cambiar el estado.
- Debe conservarse: La transición continúa pasando por la revisión existente; las acciones dependen del estado y los permisos. Las acciones importantes de respuesta/revisión permanecen visibles en su contexto.
- Evidencia: [020 · 020 Obra RFIs Dialog Detalle Actual Desktop](actuales/020_Obra_RFIs_Dialog_Detalle_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P13_Obra_RFIs_Dialogo_detalle_Propuesta_Desktop.jpg), [móvil](propuestas/P13_Obra_RFIs_Dialogo_detalle_Propuesta_Movil.jpg), [comparativa](comparativas/P13_Obra_RFIs_Dialogo_detalle_Antes_Despues.jpg).
- Código: `src/pages/RFIs/RFIDetailPage.tsx`, `src/pages/RFIs/RfiActionReview.tsx`.

### P14 · Obra › Planos › Página · biblioteca

**Un menú Cargar para plano o carpeta · Prioridad Alta**

- Problema: Tres botones amplios ocupan la cabecera antes de los filtros.
- Propuesta: Un menú Cargar con las dos modalidades y un acceso secundario de seguimiento identificado.
- Beneficio: Un punto de entrada claro a las cargas.
- Debe conservarse: La carga de carpeta conserva selección, validación y revisión; menciones globales y del módulo mantienen sus alcances.
- Evidencia: [022 · 022 Obra Planos Pagina Biblioteca Actual Desktop](actuales/022_Obra_Planos_Pagina_Biblioteca_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P14_Obra_Planos_Pagina_biblioteca_Propuesta_Desktop.jpg), [móvil](propuestas/P14_Obra_Planos_Pagina_biblioteca_Propuesta_Movil.jpg), [comparativa](comparativas/P14_Obra_Planos_Pagina_biblioteca_Antes_Despues.jpg).
- Código: `src/pages/Planos/PlanosPage.tsx`, `src/pages/Planos/FolderPlanUploadDialog.tsx`.

### P15 · Obra › Planos › Visor · acciones del archivo

**Separar herramientas del plano y gestión del archivo · Prioridad Alta**

- Problema: Descargar, Editar y Eliminar compiten con las herramientas del visor y con la información del plano.
- Propuesta: Agrupar la gestión del archivo en «…» y dejar seleccionar, dibujar, zoom y paginación en la barra del visor. Eliminar queda al final y separado.
- Beneficio: Más espacio para trabajar sobre el plano y menor riesgo de confusión.
- Debe conservarse: Eliminar conserva la confirmación y los permisos actuales. El menú no reemplaza herramientas que se usan repetidamente al anotar.
- Evidencia: [023 · 023 Obra Planos Visor BarraHerramientas Actual Desktop](actuales/023_Obra_Planos_Visor_BarraHerramientas_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P15_Obra_Planos_Visor_acciones_del_archivo_Propuesta_Desktop.jpg), [móvil](propuestas/P15_Obra_Planos_Visor_acciones_del_archivo_Propuesta_Movil.jpg), [comparativa](comparativas/P15_Obra_Planos_Visor_acciones_del_archivo_Antes_Despues.jpg).
- Código: `src/pages/Planos/PlanosPage.tsx`.

### P16 · General y Obra › Documentos › Página · cabecera y vista

**Un punto de entrada para agregar contenido · Prioridad Media**

- Problema: Nueva carpeta y Subir documentos ocupan espacio equivalente; los iconos de lista y cuadrícula carecen de texto visible.
- Propuesta: Un menú Agregar con ambas opciones y un selector de vista compacto con etiquetas o ayudas claras.
- Beneficio: Cabecera más corta y controles de vista comprensibles.
- Debe conservarse: La ubicación de la carpeta actual, filtros de proyecto/tipo y estados de carga. Guardar y Cancelar de los diálogos permanecen visibles.
- Evidencia: [024 · 024 Obra Documentos Pagina Cabecera Actual Desktop](actuales/024_Obra_Documentos_Pagina_Cabecera_Actual_Desktop.jpg); [035 · 035 General Documentos Pagina Acciones Actual Desktop](actuales/035_General_Documentos_Pagina_Acciones_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P16_General_y_Obra_Documentos_Pagina_cabecera_y_vista_Propuesta_Desktop.jpg), [móvil](propuestas/P16_General_y_Obra_Documentos_Pagina_cabecera_y_vista_Propuesta_Movil.jpg), [comparativa](comparativas/P16_General_y_Obra_Documentos_Pagina_cabecera_y_vista_Antes_Despues.jpg).
- Código: `src/pages/Documentos/DocumentosPage.tsx`, `src/pages/ProyectoDocumentos/ProyectoDocumentosPage.tsx`.

### P17 · General › Documentos › Tabla · acciones de carpeta/archivo

**Un menú por fila sin acciones duplicadas · Prioridad Alta**

- Problema: Cada fila muestra iconos para renombrar y mover, además de un menú que vuelve a ofrecer esas acciones.
- Propuesta: Un único menú de acciones por fila. Mantener el nombre como acceso para abrir y dejar Eliminar separado al final.
- Beneficio: Reducir tres controles a uno y eliminar duplicidad.
- Debe conservarse: Diferenciar carpetas y archivos, permisos y confirmaciones. El nombre accesible del menú identifica el registro.
- Evidencia: [035 · 035 General Documentos Pagina Acciones Actual Desktop](actuales/035_General_Documentos_Pagina_Acciones_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P17_General_Documentos_Tabla_acciones_de_carpeta_archivo_Propuesta_Desktop.jpg), [móvil](propuestas/P17_General_Documentos_Tabla_acciones_de_carpeta_archivo_Propuesta_Movil.jpg), [comparativa](comparativas/P17_General_Documentos_Tabla_acciones_de_carpeta_archivo_Antes_Despues.jpg).
- Código: `src/pages/Documentos/DocumentosPage.tsx`.

### P18 · General › Proveedores › Página · cabecera

**Nuevo proveedor y herramientas de catálogo · Prioridad Alta**

- Problema: Las dos herramientas largas desplazan Nuevo proveedor a otra línea.
- Propuesta: Mantener Nuevo proveedor visible y agrupar importación y sincronización en «…».
- Beneficio: Una sola línea de acciones en escritorio y dos controles claros en móvil.
- Debe conservarse: Confirmaciones de sincronización y fusión; filtros y ordenamiento se conservan. Archivar/reactivar sigue en el contexto de cada proveedor.
- Evidencia: [029 · 029 General Proveedores Pagina Cabecera Actual Desktop](actuales/029_General_Proveedores_Pagina_Cabecera_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P18_General_Proveedores_Pagina_cabecera_Propuesta_Desktop.jpg), [móvil](propuestas/P18_General_Proveedores_Pagina_cabecera_Propuesta_Movil.jpg), [comparativa](comparativas/P18_General_Proveedores_Pagina_cabecera_Antes_Despues.jpg).
- Código: `src/pages/ProveedoresTable/ProveedoresTablePage.tsx`.

### P19 · General › P&L › Página · herramientas

**Herramientas financieras con nombres claros · Prioridad Media**

- Problema: Configuración y Ledger se representan sólo con iconos junto a pestañas, ubicación y carga.
- Propuesta: Mantener Cargar movimientos y poner los accesos secundarios con texto en un menú. Conservar ubicación visible.
- Beneficio: Reducir controles ambiguos sin alterar las vistas financieras.
- Debe conservarse: Los supuestos se reflejan inmediatamente, como hoy; no presentar un falso Guardar. Restablecer conserva su significado y debe diferenciarse de cerrar.
- Evidencia: [031 · 031 General PyL Pagina BarraAcciones Actual Desktop](actuales/031_General_PyL_Pagina_BarraAcciones_Actual_Desktop.jpg); [032 · 032 General PyL Dialog Configuracion Actual Desktop](actuales/032_General_PyL_Dialog_Configuracion_Actual_Desktop.jpg); [033 · 033 General PyL Tab WorkInProgress Actual Desktop](actuales/033_General_PyL_Tab_WorkInProgress_Actual_Desktop.jpg); [034 · 034 General PyL Tab Rentabilidad Actual Desktop](actuales/034_General_PyL_Tab_Rentabilidad_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P19_General_PyL_Pagina_herramientas_Propuesta_Desktop.jpg), [móvil](propuestas/P19_General_PyL_Pagina_herramientas_Propuesta_Movil.jpg), [comparativa](comparativas/P19_General_PyL_Pagina_herramientas_Antes_Despues.jpg).
- Código: `src/pages/ProfitAndLoss/ProfitAndLossPage.tsx`.

### P20 · Obra › Autorizaciones › Tarjetas · documentos y responsables

**Acciones documentales identificadas por nombre · Prioridad Media**

- Problema: Las tarjetas utilizan iconos pequeños para reemplazar, consultar historial o retirar documentos; algunos botones no tienen nombre accesible en el DOM.
- Propuesta: Un menú Documento con verbos completos para las utilidades y un acceso explícito Asignar responsable. Conservar el estado de cumplimiento visible.
- Beneficio: Comprender qué hace cada icono y compactar controles repetidos.
- Debe conservarse: No mover los indicadores de cumplimiento a acciones genéricas. Mostrar sólo opciones disponibles según documento y permisos; la simulación es ilustrativa para las tarjetas expandidas.
- Evidencia: [055 · 055 Obra Autorizaciones Tab PermisosLegal Actual Desktop](actuales/055_Obra_Autorizaciones_Tab_PermisosLegal_Actual_Desktop.jpg); [056 · 056 Obra Autorizaciones Tab Contratos Actual Desktop](actuales/056_Obra_Autorizaciones_Tab_Contratos_Actual_Desktop.jpg); [057 · 057 Obra Autorizaciones Tab IMSSSIROC Actual Desktop](actuales/057_Obra_Autorizaciones_Tab_IMSSSIROC_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P20_Obra_Autorizaciones_Tarjetas_documentos_y_responsables_Propuesta_Desktop.jpg), [móvil](propuestas/P20_Obra_Autorizaciones_Tarjetas_documentos_y_responsables_Propuesta_Movil.jpg), [comparativa](comparativas/P20_Obra_Autorizaciones_Tarjetas_documentos_y_responsables_Antes_Despues.jpg).
- Código: `src/pages/AutorizacionesObra/PermisosYLegalTab.tsx`, `src/pages/AutorizacionesObra/PresupuestosContratosTab.tsx`, `src/pages/AutorizacionesObra/ImssYSirocTab.tsx`.

### P21 · Obra › Flujo › Página · origen e historial

**Origen e historial dentro de Archivo · Prioridad Baja**

- Problema: El historial y la fuente vigente aparecen como controles de distinto estilo separados de los datos del archivo.
- Propuesta: Un menú Archivo junto a la referencia del Excel, con origen vigente e historial.
- Beneficio: Asociar las acciones con su documento de origen.
- Debe conservarse: El archivo vigente, su fecha y el filtro por partida siguen visibles. El patrón también aplica a cobros de ventas, pendiente de validar con un proyecto accesible.
- Evidencia: [052 · 052 Obra Flujo Pagina Controles Actual Desktop](actuales/052_Obra_Flujo_Pagina_Controles_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P21_Obra_Flujo_Pagina_origen_e_historial_Propuesta_Desktop.jpg), [móvil](propuestas/P21_Obra_Flujo_Pagina_origen_e_historial_Propuesta_Movil.jpg), [comparativa](comparativas/P21_Obra_Flujo_Pagina_origen_e_historial_Antes_Despues.jpg).
- Código: `src/pages/ProyectoFlujo/ProyectoFlujoPage.tsx`, `src/pages/SalesProyectoFlujo/SalesProyectoFlujoPage.tsx`.

### P22 · Ventas › Documentos › Página · cabecera

**Retirar la acción que todavía no está disponible · Prioridad Media**

- Problema: Agregar Documento sólo muestra un aviso de «próximamente», mientras Subir Documentos inicia el flujo disponible.
- Propuesta: Conservar Subir documentos como entrada única y retirar de la cabecera la función pendiente hasta que tenga un flujo implementado.
- Beneficio: Eliminar un botón que no permite completar una tarea.
- Debe conservarse: El flujo actual de carga y los permisos; no crear una función nueva como parte de esta propuesta.
- Evidencia: [045 · 045 Ventas Documentos Pagina Cabecera Actual Desktop](actuales/045_Ventas_Documentos_Pagina_Cabecera_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P22_Ventas_Documentos_Pagina_cabecera_Propuesta_Desktop.jpg), [móvil](propuestas/P22_Ventas_Documentos_Pagina_cabecera_Propuesta_Movil.jpg), [comparativa](comparativas/P22_Ventas_Documentos_Pagina_cabecera_Antes_Despues.jpg).
- Código: `src/pages/Documentos/SalesDocumentosPage.tsx`.

### P23 · General › Diálogos › Diálogo · edición de partida

**Nombres específicos y escala consistente en el pie · Prioridad Media**

- Problema: Actualizar, Crear y Guardar cambian de etiqueta y tamaño entre formularios, sin nombrar el objeto afectado.
- Propuesta: Etiquetas como Guardar cambios, Crear carpeta o Guardar proveedor; tamaño compacto en escritorio y área táctil suficiente en móvil. Conservar acción principal y Cancelar en el pie.
- Beneficio: Anticipar el resultado y reconocer el patrón entre formularios.
- Debe conservarse: Sin cambios sigue deshabilitado; no ocultar confirmaciones ni botones de guardar detrás de «…». En altas con Excel mantener explícito que se guarda el archivo original.
- Evidencia: [063 · 063 Obra Presupuesto Dialog EditarPartida Actual Desktop](actuales/063_Obra_Presupuesto_Dialog_EditarPartida_Actual_Desktop.jpg); [025 · 025 Obra Documentos Dialog NuevaCarpeta Actual Desktop](actuales/025_Obra_Documentos_Dialog_NuevaCarpeta_Actual_Desktop.jpg); [030 · 030 General Proveedores Dialog NuevoProveedor Actual Desktop](actuales/030_General_Proveedores_Dialog_NuevoProveedor_Actual_Desktop.jpg); [039 · 039 General Proyectos Dialog CrearProyecto Actual Desktop](actuales/039_General_Proyectos_Dialog_CrearProyecto_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P23_General_Dialogos_Dialogo_edicion_de_partida_Propuesta_Desktop.jpg), [móvil](propuestas/P23_General_Dialogos_Dialogo_edicion_de_partida_Propuesta_Movil.jpg), [comparativa](comparativas/P23_General_Dialogos_Dialogo_edicion_de_partida_Antes_Despues.jpg).
- Código: `src/components/Forms/EditPartidaForm.tsx`, `src/pages/Documentos/DocumentosPage.tsx`, `src/components/modals/add-proyecto-modal.tsx`.

### P24 · Ventas › Presupuesto › Página · cabecera · referencia de código

**Sincronizar como utilidad secundaria en ventas · Prioridad Media** · Basada en código, pendiente de validar

- Problema: La implementación de presupuesto de ventas incluye Sincronizar como botón independiente. No se pudo abrir una vista real por proyecto de ventas.
- Propuesta: Simular Sincronizar dentro de «…», con el mismo patrón de utilidades de obra.
- Beneficio: Consistencia entre módulos sin dar prioridad a mantenimiento.
- Debe conservarse: La propuesta está basada en código y necesita validación visual con un proyecto de ventas accesible antes de adoptarse.
- Evidencia: [043 · 043 Ventas Proyectos Pagina SinProyectos Actual Desktop](actuales/043_Ventas_Proyectos_Pagina_SinProyectos_Actual_Desktop.jpg); [048 · 048 Ventas Usuarios Pagina Acceso Actual Desktop](actuales/048_Ventas_Usuarios_Pagina_Acceso_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P24_Ventas_Presupuesto_Pagina_cabecera_referencia_de_codigo_Propuesta_Desktop.jpg), [móvil](propuestas/P24_Ventas_Presupuesto_Pagina_cabecera_referencia_de_codigo_Propuesta_Movil.jpg), [comparativa](comparativas/P24_Ventas_Presupuesto_Pagina_cabecera_referencia_de_codigo_Antes_Despues.jpg).
- Código: `src/components/Tables/SalesPresupuestoTable.tsx`.

### P25 · Ventas › Transacciones del proyecto › Página · cabecera · referencia de código

**Agrupar importación y sincronización de ventas · Prioridad Media** · Basada en código, pendiente de validar

- Problema: La página por proyecto separa Subir Transacciones y Sincronizar Docs. La sesión no permite seleccionar un proyecto de ventas para comprobarla.
- Propuesta: Mantener Subir transacciones visible y reunir mantenimiento en «…». Usar el detalle de transacción como acceso a conceptos y documentos.
- Beneficio: La misma jerarquía de acciones que en obra.
- Debe conservarse: Simulación basada en código; no representa una captura real de un proyecto. Conservar los accesos actuales a detalles, conceptos y documentos y las confirmaciones de eliminación.
- Evidencia: [043 · 043 Ventas Proyectos Pagina SinProyectos Actual Desktop](actuales/043_Ventas_Proyectos_Pagina_SinProyectos_Actual_Desktop.jpg); [046 · 046 Ventas Transacciones Pagina Listado Actual Desktop](actuales/046_Ventas_Transacciones_Pagina_Listado_Actual_Desktop.jpg); [048 · 048 Ventas Usuarios Pagina Acceso Actual Desktop](actuales/048_Ventas_Usuarios_Pagina_Acceso_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P25_Ventas_Transacciones_del_proyecto_Pagina_cabecera_referencia_de_codigo_Propuesta_Desktop.jpg), [móvil](propuestas/P25_Ventas_Transacciones_del_proyecto_Pagina_cabecera_referencia_de_codigo_Propuesta_Movil.jpg), [comparativa](comparativas/P25_Ventas_Transacciones_del_proyecto_Pagina_cabecera_referencia_de_codigo_Antes_Despues.jpg).
- Código: `src/pages/SalesProyectoTransacciones/SalesProyectoTransaccionesPage.tsx`.

### P26 · General y Obra › Tareas › Página · filtros

**Estado y filtros sin duplicar controles · Prioridad Media**

- Problema: La fila Total/Abiertas/Vencidas/Completas y el selector Todos los estados se superponen como entradas para filtrar.
- Propuesta: Una barra compacta con Estado, Responsable y Más filtros; mantener contadores y mostrar los filtros activos como chips. Nueva tarea sigue visible.
- Beneficio: Menos controles repetidos y mejor lectura en móvil.
- Debe conservarse: Los filtros de estado y vencimiento no siempre son equivalentes: conservar la combinación «Vencidas» como filtro rápido independiente. La propuesta no elimina esa capacidad.
- Evidencia: [036 · 036 General Tareas Pagina Controles Actual Desktop](actuales/036_General_Tareas_Pagina_Controles_Actual_Desktop.jpg); [054 · 054 Obra Tareas Pagina Controles Actual Desktop](actuales/054_Obra_Tareas_Pagina_Controles_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P26_General_y_Obra_Tareas_Pagina_filtros_Propuesta_Desktop.jpg), [móvil](propuestas/P26_General_y_Obra_Tareas_Pagina_filtros_Propuesta_Movil.jpg), [comparativa](comparativas/P26_General_y_Obra_Tareas_Pagina_filtros_Antes_Despues.jpg).
- Código: `src/pages/Tareas/TareasPage.tsx`.

### P27 · Obra › Presupuesto › Tabla · menú de partida

**Consulta primero y eliminación al final · Prioridad Media**

- Problema: Eliminar partida aparece entre Editar partida y los accesos de consulta.
- Propuesta: Ordenar consulta, edición y finalmente eliminación, separada visualmente. Nombrar el disparador Acciones de la partida correspondiente.
- Beneficio: Lectura más predecible y acción destructiva claramente diferenciada.
- Debe conservarse: No cambiar las condiciones de eliminación ni la revisión de impacto. Las opciones de familia/subpartida mantienen su contexto.
- Evidencia: [062 · 062 Obra Presupuesto Menu Partida Actual Desktop](actuales/062_Obra_Presupuesto_Menu_Partida_Actual_Desktop.jpg).
- Simulación: [escritorio](propuestas/P27_Obra_Presupuesto_Tabla_menu_de_partida_Propuesta_Desktop.jpg), [móvil](propuestas/P27_Obra_Presupuesto_Tabla_menu_de_partida_Propuesta_Movil.jpg), [comparativa](comparativas/P27_Obra_Presupuesto_Tabla_menu_de_partida_Antes_Despues.jpg).
- Código: `src/components/Tables/PresupuestoTable.tsx`.


## Evidencia del recorrido

- [001 · 001 Obra Presupuesto Pagina Cabecera Actual Desktop](actuales/001_Obra_Presupuesto_Pagina_Cabecera_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [002 · 002 Obra Presupuesto Menu Agregar Actual Desktop](actuales/002_Obra_Presupuesto_Menu_Agregar_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [003 · 003 Obra Presupuesto Dialog RegistrarPagos Actual Desktop](actuales/003_Obra_Presupuesto_Dialog_RegistrarPagos_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [004 · 004 Obra Presupuesto Dialog ExcelOrigen Actual Desktop](actuales/004_Obra_Presupuesto_Dialog_ExcelOrigen_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [005 · 005 Obra Presupuesto Menu Acciones Actual Desktop](actuales/005_Obra_Presupuesto_Menu_Acciones_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [006 · 006 Obra Presupuesto Dialog Ingresos Actual Desktop](actuales/006_Obra_Presupuesto_Dialog_Ingresos_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [007 · 007 Obra Presupuesto Dialog NuevoIngreso Actual Desktop](actuales/007_Obra_Presupuesto_Dialog_NuevoIngreso_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [008 · 008 Obra Control Pagina Cabecera Actual Desktop](actuales/008_Obra_Control_Pagina_Cabecera_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/control
- [009 · 009 Obra Reportes Pagina Generar Actual Desktop](actuales/009_Obra_Reportes_Pagina_Generar_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/reportes
- [010 · 010 Obra Reportes Tab Programaciones Actual Desktop](actuales/010_Obra_Reportes_Tab_Programaciones_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/reportes
- [011 · 011 Obra Reportes Tab Historial Actual Desktop](actuales/011_Obra_Reportes_Tab_Historial_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/reportes
- [012 · 012 Obra Programa Pagina BarraHerramientas Actual Desktop](actuales/012_Obra_Programa_Pagina_BarraHerramientas_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/programa
- [013 · 013 Obra Programa Menu Archivo Actual Desktop](actuales/013_Obra_Programa_Menu_Archivo_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/programa
- [014 · 014 Obra Programa Dialog ExportarPDF Actual Desktop](actuales/014_Obra_Programa_Dialog_ExportarPDF_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/programa
- [015 · 015 Obra Bitacora Pagina Controles Actual Desktop](actuales/015_Obra_Bitacora_Pagina_Controles_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/bitacora
- [016 · 016 Obra Bitacora Dialog NuevaEntrada Actual Desktop](actuales/016_Obra_Bitacora_Dialog_NuevaEntrada_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/bitacora
- [017 · 017 Obra Requisiciones Pagina CabeceraFiltros Actual Desktop](actuales/017_Obra_Requisiciones_Pagina_CabeceraFiltros_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/requisiciones
- [018 · 018 Obra Requisiciones Dialog NuevaRequisicion Actual Desktop](actuales/018_Obra_Requisiciones_Dialog_NuevaRequisicion_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/requisiciones
- [019 · 019 Obra RFIs Pagina Registro Actual Desktop](actuales/019_Obra_RFIs_Pagina_Registro_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/rfis
- [020 · 020 Obra RFIs Dialog Detalle Actual Desktop](actuales/020_Obra_RFIs_Dialog_Detalle_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/rfis
- [021 · 021 Obra RFIs Formulario CreacionRapida Actual Desktop](actuales/021_Obra_RFIs_Formulario_CreacionRapida_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/rfis
- [022 · 022 Obra Planos Pagina Biblioteca Actual Desktop](actuales/022_Obra_Planos_Pagina_Biblioteca_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/planos
- [023 · 023 Obra Planos Visor BarraHerramientas Actual Desktop](actuales/023_Obra_Planos_Visor_BarraHerramientas_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/planos
- [024 · 024 Obra Documentos Pagina Cabecera Actual Desktop](actuales/024_Obra_Documentos_Pagina_Cabecera_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/documentos
- [025 · 025 Obra Documentos Dialog NuevaCarpeta Actual Desktop](actuales/025_Obra_Documentos_Dialog_NuevaCarpeta_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/documentos
- [026 · 026 Obra Transacciones Pagina Cabecera Actual Desktop](actuales/026_Obra_Transacciones_Pagina_Cabecera_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/transacciones
- [027 · 027 Obra Transacciones Panel Filtros Actual Desktop](actuales/027_Obra_Transacciones_Panel_Filtros_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/transacciones
- [028 · 028 Obra Transacciones Dialog Detalle Actual Desktop](actuales/028_Obra_Transacciones_Dialog_Detalle_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/transacciones
- [029 · 029 General Proveedores Pagina Cabecera Actual Desktop](actuales/029_General_Proveedores_Pagina_Cabecera_Actual_Desktop.jpg) — /proveedores
- [030 · 030 General Proveedores Dialog NuevoProveedor Actual Desktop](actuales/030_General_Proveedores_Dialog_NuevoProveedor_Actual_Desktop.jpg) — /proveedores
- [031 · 031 General PyL Pagina BarraAcciones Actual Desktop](actuales/031_General_PyL_Pagina_BarraAcciones_Actual_Desktop.jpg) — /pnl
- [032 · 032 General PyL Dialog Configuracion Actual Desktop](actuales/032_General_PyL_Dialog_Configuracion_Actual_Desktop.jpg) — /pnl
- [033 · 033 General PyL Tab WorkInProgress Actual Desktop](actuales/033_General_PyL_Tab_WorkInProgress_Actual_Desktop.jpg) — /pnl
- [034 · 034 General PyL Tab Rentabilidad Actual Desktop](actuales/034_General_PyL_Tab_Rentabilidad_Actual_Desktop.jpg) — /pnl
- [035 · 035 General Documentos Pagina Acciones Actual Desktop](actuales/035_General_Documentos_Pagina_Acciones_Actual_Desktop.jpg) — /documentos
- [036 · 036 General Tareas Pagina Controles Actual Desktop](actuales/036_General_Tareas_Pagina_Controles_Actual_Desktop.jpg) — /tareas
- [037 · 037 General Tareas Dialog NuevaTarea Actual Desktop](actuales/037_General_Tareas_Dialog_NuevaTarea_Actual_Desktop.jpg) — /tareas
- [038 · 038 General Proyectos Pagina Cabecera Actual Desktop](actuales/038_General_Proyectos_Pagina_Cabecera_Actual_Desktop.jpg) — /proyectos
- [039 · 039 General Proyectos Dialog CrearProyecto Actual Desktop](actuales/039_General_Proyectos_Dialog_CrearProyecto_Actual_Desktop.jpg) — /proyectos
- [040 · 040 Admin Usuarios Pagina Acciones Actual Desktop](actuales/040_Admin_Usuarios_Pagina_Acciones_Actual_Desktop.jpg) — /usuarios
- [041 · 041 Admin Usuarios Pagina Invitacion Actual Desktop](actuales/041_Admin_Usuarios_Pagina_Invitacion_Actual_Desktop.jpg) — /usuarios/nuevo
- [042 · 042 Admin Flujo Pagina CargaProyecciones Actual Desktop](actuales/042_Admin_Flujo_Pagina_CargaProyecciones_Actual_Desktop.jpg) — /admin/flujo
- [043 · 043 Ventas Proyectos Pagina SinProyectos Actual Desktop](actuales/043_Ventas_Proyectos_Pagina_SinProyectos_Actual_Desktop.jpg) — /sales-proyectos
- [044 · 044 Ventas Proyectos Dialog CrearProyecto Actual Desktop](actuales/044_Ventas_Proyectos_Dialog_CrearProyecto_Actual_Desktop.jpg) — /sales-proyectos
- [045 · 045 Ventas Documentos Pagina Cabecera Actual Desktop](actuales/045_Ventas_Documentos_Pagina_Cabecera_Actual_Desktop.jpg) — /sales-documentos
- [046 · 046 Ventas Transacciones Pagina Listado Actual Desktop](actuales/046_Ventas_Transacciones_Pagina_Listado_Actual_Desktop.jpg) — /sales-transacciones
- [047 · 047 Ventas Gestion Pagina SinProyectos Actual Desktop](actuales/047_Ventas_Gestion_Pagina_SinProyectos_Actual_Desktop.jpg) — /sales-gestion
- [048 · 048 Ventas Usuarios Pagina Acceso Actual Desktop](actuales/048_Ventas_Usuarios_Pagina_Acceso_Actual_Desktop.jpg) — /sales-usuarios
- [049 · 049 Admin VentasFlujo Pagina SinProyecto Actual Desktop](actuales/049_Admin_VentasFlujo_Pagina_SinProyecto_Actual_Desktop.jpg) — /admin/sales-flujo
- [050 · 050 Admin General Pagina TotalesSemanales Actual Desktop](actuales/050_Admin_General_Pagina_TotalesSemanales_Actual_Desktop.jpg) — /admin
- [051 · 051 General Transacciones Pagina Controles Actual Desktop](actuales/051_General_Transacciones_Pagina_Controles_Actual_Desktop.jpg) — /transacciones
- [052 · 052 Obra Flujo Pagina Controles Actual Desktop](actuales/052_Obra_Flujo_Pagina_Controles_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/flujo
- [053 · 053 Obra Proveedores Pagina Controles Actual Desktop](actuales/053_Obra_Proveedores_Pagina_Controles_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/proveedores
- [054 · 054 Obra Tareas Pagina Controles Actual Desktop](actuales/054_Obra_Tareas_Pagina_Controles_Actual_Desktop.jpg) — /tareas
- [055 · 055 Obra Autorizaciones Tab PermisosLegal Actual Desktop](actuales/055_Obra_Autorizaciones_Tab_PermisosLegal_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/autorizaciones
- [056 · 056 Obra Autorizaciones Tab Contratos Actual Desktop](actuales/056_Obra_Autorizaciones_Tab_Contratos_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/autorizaciones
- [057 · 057 Obra Autorizaciones Tab IMSSSIROC Actual Desktop](actuales/057_Obra_Autorizaciones_Tab_IMSSSIROC_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/autorizaciones
- [058 · 058 Obra RFIs Pagina NuevaRFI Actual Desktop](actuales/058_Obra_RFIs_Pagina_NuevaRFI_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/rfis/nueva
- [060 · 060 Legacy CargaExcel Pagina Seleccion Actual Desktop](actuales/060_Legacy_CargaExcel_Pagina_Seleccion_Actual_Desktop.jpg) — /upload
- [061 · 061 General Inicio Pagina Resumen Actual Desktop](actuales/061_General_Inicio_Pagina_Resumen_Actual_Desktop.jpg) — /
- [062 · 062 Obra Presupuesto Menu Partida Actual Desktop](actuales/062_Obra_Presupuesto_Menu_Partida_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [063 · 063 Obra Presupuesto Dialog EditarPartida Actual Desktop](actuales/063_Obra_Presupuesto_Dialog_EditarPartida_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [064 · 064 Obra Presupuesto Pagina Cabecera Actual Movil](actuales/064_Obra_Presupuesto_Pagina_Cabecera_Actual_Movil.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [065 · 065 Obra Presupuesto Dialog Ingresos Actual Movil](actuales/065_Obra_Presupuesto_Dialog_Ingresos_Actual_Movil.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [066 · 066 Obra Transacciones Panel Filtros Actual Movil](actuales/066_Obra_Transacciones_Panel_Filtros_Actual_Movil.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/transacciones
- [067 · 067 Obra Transacciones Dialog SubirPagosFuerzaLaboral Actual Desktop](actuales/067_Obra_Transacciones_Dialog_SubirPagosFuerzaLaboral_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [068 · 068 Obra Presupuesto Dialog CargarFactura Actual Desktop](actuales/068_Obra_Presupuesto_Dialog_CargarFactura_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [069 · 069 General Asistente Panel Controles Actual Desktop](actuales/069_General_Asistente_Panel_Controles_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto
- [070 · 070 Obra Presupuesto Dialog AgregarElementos Actual Desktop](actuales/070_Obra_Presupuesto_Dialog_AgregarElementos_Actual_Desktop.jpg) — /proyecto/jh7298n8vwk2fz4f20d27q153s89ap52/presupuesto

La captura rechazada de /dashboard está en evidencia/bloqueos y no forma parte de los antes/después. Consulta cobertura.csv y cobertura-dialogos.csv para el nivel de comprobación de cada ruta y título de diálogo.
