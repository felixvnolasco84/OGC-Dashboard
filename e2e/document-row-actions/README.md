# Fixture aislado de P17

Renderiza `DocumentosPage` y sus componentes reales con el CSS de la aplicación. No sustituye el JSX ni utiliza los datos o estilos del simulador de auditoría.

Ejecutar desde la raíz del repositorio:

```powershell
npx vite --config e2e/document-row-actions/vite.config.ts
```

Abrir `http://127.0.0.1:4217/e2e/document-row-actions/preview.html`.

El servidor escucha sólo en loopback y usa un caché independiente. `convex/react` se reemplaza por un stub; no hay cliente Convex, credenciales o escrituras a red. Cada mutación registra nombre y argumentos en el panel inferior sin modificar los registros ficticios. Eliminar la carpeta Crest - CDS lanza un error simulado por contenido. `?fail=1` permite simular fallos de las demás operaciones.

El panel inferior enlaza los escenarios con registros, vacío, carga y error. El escenario con registros incluye una carpeta raíz con contenido y descendiente, una carpeta vacía, documentos de obra y ventas, y un documento anidado. No es necesario crear carpetas ni seleccionar archivos reales.

Validar: un trigger por fila/tarjeta; menús por teclado y ratón; Renombrar/Mover con el target y prellenado correctos; cancelar y retorno de foco; Eliminar abre confirmación sin mutation; navegación por nombre y clic derecho; lista/cuadrícula a 1440 y 390.

La evidencia de la revisión interactiva y los argumentos observados están en `outputs/P17-implementacion-2026-11-18`.
