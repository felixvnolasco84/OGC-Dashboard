# Programa de obra: respaldo e historial de Excel

Ro, quedó implementado el respaldo del Excel original al confirmar una importación de Programa de obra. El archivo se conserva con su nombre y contenido exactos, aunque se ajusten fechas o coincidencias durante la revisión.

El historial permite descargar los originales y consultar quién confirmó cada carga, cuándo, qué se creó o actualizó y cuáles filas quedaron sin cambios. También registra fallos. Cada partida o familia permite consultar sus fuentes; los efectos por dependencias se distinguen de las filas presentes en el archivo.

Las recargas parciales conservan los registros ausentes sin asignarles una procedencia nueva. Los renombres mantienen la identidad y el historial. Se preservan avances, fechas reales y frentes. Una respuesta perdida se recupera sin duplicar la importación. Archivar o eliminar un registro conserva los respaldos; borrar definitivamente el proyecto los limpia.

Las revisiones anteriores aparecen sin original disponible cuando se incorporan mediante la migración preparada. No se reconstruyen archivos anteriores.

La implementación está verificada localmente; aún no se ha desplegado ni se han migrado datos. La documentación técnica y el procedimiento de incorporación están en `docs/programa-obra-import-history.md`.

Capturas reales de los componentes, con **datos ficticios** y transporte de prueba en localhost:

- [Historial en escritorio](history-1440.png)
- [Detalle de carga en móvil](details-390.png)
- [Fuentes de una familia en móvil](sources-390.png)
- [Revisión final a 320 px](review-xlsx-320.png)

Pasaron 76 pruebas de backend, las reglas del programa y las pruebas visuales a 1440, 390 y 320 px. Comprueban archivos `.xls` y `.xlsx`, bytes y nombres exactos, errores, permisos, concurrencia, reintentos, conservación e históricos. También pasaron las regresiones de actividades, ponderaciones, PDF y reportes.
