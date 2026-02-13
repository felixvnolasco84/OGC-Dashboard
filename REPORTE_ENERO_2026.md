# Reporte Histórico de Actividades — Enero 2026 (1 al 23)

**Proyecto:** OGC Dashboard  
**Período:** 01/01/2026 – 23/01/2026

| # | Tarea | Prioridad | Propietario | Estado | Fecha inicio | Fecha de finalización | Hito | Distribuible | Notas | Horas |
|---|-------|-----------|-------------|--------|--------------|----------------------|------|-------------|-------|-------|
| 1 | Implementar acciones de botones en la página de Documentos | Media | Desarrollo | Completado | 07/01/2026 | 07/01/2026 | — | Funcionalidad de botones en página de documentos | Se añadieron las acciones interactivas a los botones existentes en la vista de documentos | 2 |
| 2 | Seguimiento de pagos de última semana con script seed, extensión de rangos de gráficas y mejoras en tabla de presupuesto | Alta | Desarrollo | Completado | 08/01/2026 | 08/01/2026 | — | Script de seed, gráfica de progreso actualizada, tabla de presupuesto mejorada | Se creó un script de seed para pagos de la semana anterior, se ampliaron los rangos de fecha en ProgressChart y se rediseñó la tabla de presupuesto. 7 archivos modificados, 460 inserciones | 6 |
| 3 | Mutación de sincronización integral de proyecto con recalculación de pagado, actualización de honorarios y botón de sincronización en presupuesto | Alta | Desarrollo | Completado | 14/01/2026 | 14/01/2026 | Sincronización de datos del proyecto | Mutación syncProjectData en partida.ts, botón "Sincronizar" en PresupuestoPage | Se implementó una mutación completa que recalcula el campo `pagado` de todas las partidas, actualiza honorarios y sincroniza métricas del presupuesto. 417 líneas nuevas en backend | 6 |
| 4 | Módulo de Ingresos: gestión de documentos, seguimiento de totales y triggers automáticos | Alta | Desarrollo | Completado | 14/01/2026 | 14/01/2026 | Módulo de Ingresos | Backend (ingresos.ts, ingresos_documentos.ts), modal UI (ingresos-modal.tsx), hook Zustand, esquema actualizado | Módulo completo de ingresos con CRUD, documentos adjuntos, cálculo automático de totales mediante triggers y modal de gestión. 9 archivos, 1,405 inserciones | 8 |
| 5 | Corrección de z-index en diálogo del calendario en modal de ingresos | Baja | Desarrollo | Completado | 14/01/2026 | 14/01/2026 | — | Corrección de bug en ingresos-modal.tsx | Se corrigió un problema de z-index donde el calendario del DatePicker quedaba detrás del diálogo | 0.5 |
| 6 | Ajustes de UI en página de Presupuesto: orden de etiquetas y layout | Baja | Desarrollo | Completado | 15/01/2026 | 15/01/2026 | — | Cambios de layout en PresupuestoPage.tsx | Se reordenaron las etiquetas en la sección de métricas y se ajustó el diseño general de la página de presupuesto | 1 |
| 7 | Mostrar valores de honorarios del proyecto en la partida HONORARIOS de la tabla de presupuesto | Media | Desarrollo | Completado | 16/01/2026 | 16/01/2026 | — | Visualización de honorarios en PresupuestoTable | Se agregó la visualización de los valores de honorarios del proyecto (presupuesto original, aprobado, pagado) directamente en la fila de la partida HONORARIOS de la tabla de presupuesto | 3 |
| 8 | Incorporar honorarios al gasto total en métricas, rediseño de tabla de transacciones con funcionalidad de eliminación y ocultamiento de elementos del menú | Alta | Desarrollo | Completado | 19/01/2026 | 19/01/2026 | Rediseño de tabla de transacciones | Métricas actualizadas, tabla de transacciones rediseñada, sidebar actualizado | Se incluyeron los honorarios en el cálculo del gasto total de métricas de presupuesto, se rediseñó la tabla de transacciones con funcionalidad de eliminación y se ocultaron los elementos de menú Flujo y Documentos. 4 archivos, 266 inserciones | 5 |
| 9 | Cambiar gráfica FamiliaChart a agregación acumulativa con suma de fechas duplicadas y cálculo de totales acumulados | Media | Desarrollo | Completado | 21/01/2026 | 21/01/2026 | — | FamiliaChart.tsx actualizado | Se modificó la lógica de la gráfica para sumar valores de fechas duplicadas y calcular totales acumulados (running totals) en lugar de valores individuales | 2 |
| 10 | Módulo de Requisiciones: gestión de documentos, seguimiento de presupuesto y operaciones CRUD para flujo de compras de material/equipo | Alta | Desarrollo | Completado | 23/01/2026 | 23/01/2026 | Módulo de Requisiciones | Backend (requisiciones.ts), esquema, modales (NuevaRequisicionModal, RequisicionModal), hook, página de listado, diagrama SVG, ruta en router | Módulo completo de requisiciones con: creación/edición/vista de requisiciones, gestión de ítems con cantidades y precios, estados de aprobación, documentos de soporte, diagrama de flujo de compras y página de listado con filtros. 9 archivos, 6,400 inserciones | 10 |

---

**Resumen del período:**

| Métrica | Valor |
|---------|-------|
| **Total de tareas completadas** | 10 |
| **Horas totales estimadas** | 43.5 |
| **Hitos alcanzados** | 3 (Sincronización de proyecto, Módulo de Ingresos, Módulo de Requisiciones) |
| **Archivos modificados (total)** | ~35 |
| **Líneas de código nuevas (aprox.)** | ~9,400+ |

---

# Reporte Histórico de Actividades — Enero/Febrero 2026 (24 Ene – 11 Feb)

**Proyecto:** OGC Dashboard  
**Período:** 24/01/2026 – 11/02/2026

| # | Tarea | Prioridad | Propietario | Estado | Fecha inicio | Fecha de finalización | Hito | Distribuible | Notas | Horas |
|---|-------|-----------|-------------|--------|--------------|----------------------|------|-------------|-------|-------|
| 1 | Soporte de documentos adjuntos en Bitácora: carga, visualización y eliminación | Alta | Desarrollo | Completado | 28/01/2026 | 28/01/2026 | — | Funcionalidad de adjuntos en módulo de Bitácora | Se añadió la capacidad de subir, visualizar y eliminar documentos adjuntos en las entradas de la bitácora. 11 archivos, 1,665 inserciones | — |
| 2 | Seguimiento de estado de entrega en Requisiciones con permisos por rol para usuarios de finanzas | Alta | Desarrollo | Completado | 29/01/2026 | 29/01/2026 | — | Tracking de entregas en requisiciones, permisos de rol en sidebar y rutas | Se implementó el seguimiento del estado de entrega de requisiciones con permisos diferenciados para usuarios de finanzas. Se actualizó el sidebar, rutas protegidas y la gestión de usuarios. 8 archivos, 314 inserciones | — |
| 3 | Mejora del componente Popover en página de Requisiciones | Baja | Desarrollo | Completado | 29/01/2026 | 29/01/2026 | — | Componente Popover mejorado en ProyectoRequisicionesPage | Se mejoró el diseño y comportamiento del componente Popover utilizado en la página de requisiciones | — |
| 4 | Filtrado por pestañas en página de Requisiciones: vistas Solicitudes, Pagadas, Parcial y Recibidas | Media | Desarrollo | Completado | 30/01/2026 | 30/01/2026 | — | Sistema de tabs con filtros en ProyectoRequisicionesPage | Se añadió navegación por pestañas para filtrar requisiciones por estado (Solicitudes, Pagadas, Parcial, Recibidas). 54 inserciones | — |
| 5 | Historial de requisiciones con registro de auditoría, estado de lectura y notificaciones de no leídos | Alta | Desarrollo | Completado | 04/02/2026 | 04/02/2026 | Sistema de historial y auditoría de Requisiciones | Backend (requisicion_history.ts), modal de historial, hook Zustand, esquema actualizado, notificaciones en sidebar | Módulo completo de historial con: registro de auditoría de cada cambio, estado de lectura por usuario, indicador de notificaciones no leídas en el sidebar. 9 archivos, 852 inserciones | — |
| 6 | Mejora del historial de requisiciones con seguimiento detallado de cambios, logging JSON estructurado y mejor visualización | Alta | Desarrollo | Completado | 05/02/2026 | 05/02/2026 | — | Historial mejorado en requisiciones.ts y RequisicionHistoryModal.tsx | Se mejoró el registro de cambios con comparación detallada de valores anteriores/nuevos en formato JSON estructurado y se rediseñó la visualización del historial. 2 archivos, 306 inserciones | — |
| 7 | Flujo de revisión de requisiciones: aprobación/rechazo, decisiones a nivel de ítem y seguimiento de reenvío | Alta | Desarrollo | Completado | 06/02/2026 | 06/02/2026 | Flujo de revisión de Requisiciones | ReviewRequisicionModal.tsx, mutación reviewRequisicion, hook Zustand, esquema con campos de revisión | Se implementó el flujo completo de revisión: aprobación/rechazo parcial por ítem con ajuste de cantidades, notas del revisor, estados de revisión (Aprobada, Parcialmente Aprobada, Rechazada) y registro de reenvío. 7 archivos, 919 inserciones | — |
| 8 | Corrección de doble conteo de honorarios en métricas de presupuesto y ordenamiento de transacciones por fecha | Media | Desarrollo | Completado | 10/02/2026 | 10/02/2026 | — | Corrección en meticas_presupuesto.ts, ordenamiento en see-sales-transactions-details-modal.tsx | Se corrigió el doble conteo de honorarios en el cálculo del gasto total de métricas y se implementó el ordenamiento de transacciones por fecha descendente (más reciente primero) | — |
| 9 | Normalización de formato de fechas a DD/MM/YYYY en transacciones y utilidad de actualización masiva de fechas | Media | Desarrollo | Completado | 10/02/2026 | 10/02/2026 | — | Conversión de fechas en backend y frontend, corrección de bug UTC en inicialización de fechas | Se normalizó el almacenamiento de fechas al formato DD/MM/YYYY en createTransaction y createSalesTransaction. Se corrigió el bug de toISOString() que causaba fechas incorrectas por conversión a UTC. Se añadió mutación para actualización masiva de fechas. 7 archivos, 100 inserciones | — |

---

**Resumen del período (24 Ene – 11 Feb):**

| Métrica | Valor |
|---------|-------|
| **Total de tareas completadas** | 9 |
| **Hitos alcanzados** | 2 (Sistema de historial de Requisiciones, Flujo de revisión de Requisiciones) |
| **Archivos modificados (total)** | ~45 |
| **Líneas de código nuevas (aprox.)** | ~4,200+ |
