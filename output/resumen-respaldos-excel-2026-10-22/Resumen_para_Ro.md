**Asunto: Mejoras en el respaldo e historial de archivos Excel**

Hola, buenas tardes, Ro. Espero que te encuentres muy bien.

Realicé algunas mejoras para conservar los archivos Excel originales y facilitar la consulta de la información que se carga al sistema:

**Programa de obra**

Agregué el respaldo del Excel y un historial que permite descargarlo, consultar quién realizó cada carga, cuándo y qué registros se crearon, actualizaron o quedaron sin cambios. También se puede consultar el archivo de origen desde las partidas y familias, conservando los avances y las fechas reales del programa.

**Presupuesto de obra**

Al crear un proyecto de obra, ahora se conserva el Excel completo, con su nombre, fórmulas y formato. Se puede consultar desde Presupuesto y Documentos, así como desde las partidas y los pagos semanales generados. Si la creación se interrumpe, el proyecto conserva su avance y permite reanudarla sin duplicar registros.

**Carga masiva de ingresos**

Agregué el respaldo del Excel y un historial con el resultado de cada carga, los ingresos creados y los registros rechazados. Cada ingreso importado permite consultar y descargar su archivo de origen. Los reintentos técnicos recuperan el mismo resultado sin duplicar ingresos; confirmar el mismo archivo como una carga nueva sí agrega registros y muestra una advertencia.

Los respaldos se conservan aunque posteriormente se editen o eliminen registros individuales. Cuando no existe un archivo respaldado de una carga anterior, se indica que el original no está disponible.

Las mejoras están implementadas y validadas localmente en escritorio y móvil; queda pendiente su publicación en producción.

Te comparto las capturas de las pruebas, realizadas con datos ficticios.

Quedo atento a tus comentarios. Saludos.
