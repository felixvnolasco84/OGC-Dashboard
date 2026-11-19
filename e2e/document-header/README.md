# Fixture aislado de P16

Renderiza `DocumentosPage`, `ProyectoDocumentosPage`, sus modales de carga y `ProtectedRoute` reales con el CSS vigente. Sólo Convex y Clerk se reemplazan por stubs. No crea clientes de Convex, usa credenciales ni escribe por red. Las mutaciones registran sus argumentos sin modificar registros, incluso los ficticios.

Desde la raíz del repositorio:

```powershell
node node_modules/vite/bin/vite.js --config e2e/document-header/vite.config.ts --configLoader runner
```

Abrir `http://127.0.0.1:4316/e2e/document-header/preview.html`.

Parámetros de prueba:

- Sin parámetros: biblioteca global, admin y datos ficticios.
- `?context=project`: documentos del proyecto ficticio `obra`.
- `state=loading` o `state=empty`: documentos pendientes o vacíos.
- `role=user` o `role=viewer`: el rol se evalúa con la guarda real. La biblioteca requiere admin y obra requiere user.
- `context=project&denied=1`: alcance de proyecto denegado, incluso para admin.

`MemoryRouter` mantiene las rutas de proyecto dentro de este fixture. La navegación de prueba no entra en la aplicación conectada. El puerto y el caché son exclusivos de P16.

El panel inferior muestra el destino de carga, las mutaciones simuladas y la última consulta. Usar “Actualizar evidencia” después de cambiar filtros o carpeta para refrescar la consulta mostrada. Comprobar Agregar con ratón y teclado, validación del nombre vacío, limpieza del borrador, foco al cancelar, lista/cuadrícula, carpeta raíz/anidada y panel de carpetas móvil. La carga puede abrirse y cancelarse sin seleccionar archivos.

Evidencia: `outputs/P16-implementacion-2026-11-19/README.md` y `ui-results.json`.
