# Respaldo del Excel original en la carga masiva de ingresos

Ro, quedó implementada la conservación del Excel original al confirmar una carga masiva de ingresos. Ahora se puede descargar con su nombre original desde el historial del proyecto y consultar qué ingreso provino de cada registro del archivo. Se conserva el archivo completo, con sus fórmulas y formato.

El historial muestra quién confirmó, cuándo, el resultado y los rechazos conocidos. Los ingresos anteriores aparecen sin información de archivo de origen cuando nunca se guardó esa evidencia. Editar o eliminar un ingreso conserva su respaldo y los valores importados; eliminar definitivamente el proyecto programa la limpieza de sus archivos e historial.

La carga verifica el respaldo antes de crear ingresos. Los reintentos técnicos recuperan el mismo resultado sin duplicarlos. Volver a confirmar el mismo Excel como una carga nueva agrega ingresos y requiere reconocer una advertencia. Las reglas actuales de fechas, monedas y movimientos OGC se conservan.

Se verificó con pruebas automatizadas y con la interfaz real en escritorio (1440 px) y móviles (390 y 320 px), utilizando exclusivamente datos ficticios y servicios simulados. Las capturas de esta carpeta incluyen historial, registros, origen, vista previa y recuperación. No muestran cuentas ni datos de producción.

La implementación está en el checkout local. Para habilitarla se deben publicar juntos el esquema y las funciones de Convex y el frontend; no requiere migración de datos históricos. No se ha desplegado desde este chat.

Capturas sugeridas para compartir: `history-1440.png` (escritorio) y `history-390.png` (móvil). Los nombres, importes y errores mostrados son datos de prueba.

Verificación técnica: 43 pruebas de ingresos/permisos aprobadas, tipos y compilación correctos y prueba visual completada en los tres tamaños. En siete suites relacionadas hubo 134 aprobadas, una omitida y el mismo fallo previo de indirectos (6405 frente a 6225), ajeno al respaldo de ingresos.
