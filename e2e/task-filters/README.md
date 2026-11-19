# P26 · Filtros de tareas

Fixture del componente real `TareasPage`/`TareasBoard`, sus componentes UI y los estilos de la aplicación. No utiliza el simulador de auditoría. La única sustitución es `convex/react`: consultas de datos ficticios y mutaciones bloqueadas y registradas. No hay cliente Convex ni credenciales.

Desde la raíz:

```powershell
node scripts/test-task-filters-ui.mjs
```

La prueba abre Chrome sin interfaz y un servidor Vite propio en `127.0.0.1:5326`; cierra ambos al terminar. Requiere permiso para conexiones locales. Guarda las capturas y `checks.json` en `outputs/P26-implementacion-2026-11-19`.

Para revisión manual:

```powershell
npx vite --config e2e/task-filters/vite.config.ts
```

Abrir `http://127.0.0.1:5226/tareas`. El puerto y caché son exclusivos del fixture.

## Escenarios

- `/tareas`: 11 tareas ficticias, estados estándar y «En revisión técnica», fechas relativas a hoy, dos responsables, dos proyectos, tareas generales y una minuta con una subtarea de obra.
- `/tareas?proyecto=obra`: proyecto fijo; el resumen incluye la minuta padre, mientras los resultados sólo cuentan las tareas que coinciden con los filtros.
- `/proyecto/obra/tareas`: wrapper real que redirige conservando el proyecto.
- `/board-scoped`: `TareasBoard` con `proyectoId`.
- `/tareas?proyecto=__general__`: alcance General fijo.
- `/tareas?role=viewer`: consulta sin permiso para crear tareas.
- `/tareas?state=empty` y `?state=loading`: vacío y carga.

Se comprueban intersecciones de estado/vencimiento/responsable, estados configurables, exclusión de canceladas/completas en Abiertas y Vencidas, búsqueda, propiedad asignada frente a creada, todos los filtros avanzados, chips individuales, limpieza, conservación de alcance/URL, teclado, retorno de foco, permisos y ausencia de mutaciones. Los tamaños principales son 1440×1000 y 390×844; 1024×1000 añade una comprobación de carga y desbordamiento.
