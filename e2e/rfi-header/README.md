# Fixture aislado de P13

Ejecutar desde la raíz del proyecto:

```sh
npx vite --config e2e/rfi-header/vite.config.ts
```

Abrir `http://127.0.0.1:4207/e2e/rfi-header/preview.html?state=pending_manager_review`.
Usa el detalle real de la aplicación y un alias propio de `convex/react`. No se conecta con Convex ni modifica el fixture compartido de P12. El servidor no observa cambios: reiniciarlo después de editar código.

| Parámetro | Escenario |
| --- | --- |
| `state=draft`, `pending_manager_review`, `open`, `closed` | Estado del flujo simulado |
| `embedded` | Contenedor Sheet aislado, con callbacks de edición, borrado y busy |
| `list` | Listado real y sus componentes de detalle/editor dentro del Sheet |
| `readonly` | Permisos de acciones revocados |
| `missing` / `missing-date` | Apertura sin asignados / sin fecha límite |
| `derived=overdue` | Condición derivada, separada del estado del flujo |
| `derived=awaiting_response` / `awaiting_official_response` | Otras condiciones derivadas |
| `fail=action` | Error simulado de una mutation |
| `delay=5000` | Permite inspeccionar bloqueo y cierre durante la operación |
| `no-official` | Sin respuesta oficial para la guarda de cierre |

Los controles permiten revocar sólo la edición, simular un cambio concurrente inmediatamente o en diez segundos y desactivar errores. Los outputs registran llamadas, argumentos y snapshot actual. `markAsRead` se simula sin registrar una transición.

La ruta de edición standalone y el callback del Sheet aislado muestran marcadores sin formulario. `list` permite verificar además el editor real, sin guardar. Las operaciones de apertura se validan con el snapshot real calculado por `rfiReviewSnapshot`; este fixture no sustituye las pruebas de reglas/transiciones del backend ni pretende cubrir las operaciones de adjuntos o respuestas.
