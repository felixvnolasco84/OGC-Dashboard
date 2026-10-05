# Mensaje sugerido

Hola, buenas tardes, Ro. Espero que te encuentres muy bien.

Realicé una revisión de las acciones disponibles en las páginas y modales de la plataforma, sin incluir el módulo de ventas, e implementé verificaciones de permisos según el rol del usuario.

En **Ingresos**, las acciones de creación, edición, eliminación, carga masiva y gestión de documentos quedaron disponibles únicamente para los roles **administrador y finanzas** (`admin` y `finance`). Esto también incluye los ingresos registrados como movimientos OGC.

En **Autorizaciones de obra, IMSS/SIROC y Subcontratistas**, la gestión de registros, responsables, estados y documentos quedó restringida al rol **administrador**.

En **Proveedores por proyecto**, la creación y gestión de proveedores también quedó limitada al rol **administrador**. Ajusté los formularios relacionados con pagos, requisiciones, facturas e importaciones para aplicar la misma regla, conservando la selección de proveedores existentes para los usuarios autorizados.

Estas verificaciones se aplicaron tanto en las páginas y modales como en el servidor. Los demás roles conservan la consulta de la información correspondiente a los proyectos a los que tienen acceso.

Adjunto capturas de las vistas locales con datos de ejemplo para mostrar las diferencias entre los permisos de gestión y consulta. Los cambios están implementados y validados localmente; su despliegue está pendiente. El punto de **Catálogos** quedó detenido y sin cambios.

Quedo atento a tus comentarios. Saludos.

# Notas de validación y alcance

- Durante la implementación se verificaron 120 pruebas de permisos de ingresos, autorizaciones y proveedores, además de los tipos de frontend y Convex.
- Las capturas muestran los componentes actuales con consultas simuladas y datos ficticios. Las escrituras están deshabilitadas en la vista de capturas. No demuestran una sesión ni un despliegue en producción.
- La protección del servidor se verificó mediante las pruebas de permisos; las capturas documentan únicamente la interfaz.
- No se incluyen como cambios de esta conversación las mejoras del modal de pagos, biblioteca de cuentas o estandarización de Presupuesto y Bitácora mencionadas en el texto de referencia.

# Capturas adjuntas

1. Autorizaciones de obra como administrador: controles de gestión disponibles.
2. Autorizaciones de obra como finanzas: consulta con campos y carga de documentos deshabilitados.
3. IMSS/SIROC como finanzas: carga de contrato, archivo SIROC y pago de cuota deshabilitada.
4. Subcontratistas como finanzas: consulta con edición y alta deshabilitadas.
5. Ingresos como finanzas: alta, carga masiva, edición y eliminación disponibles.
6. Ingresos como usuario: información disponible sin acciones de gestión.
7. Proveedores por proyecto como administrador: acceso a gestión disponible.
8. Proveedores por proyecto como finanzas: consulta y búsqueda disponibles, sin acceso a gestión.
