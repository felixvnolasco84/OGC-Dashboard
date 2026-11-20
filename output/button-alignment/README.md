# Alineación de botones

Medidas compartidas: acciones de 48 px de alto, ancho mínimo 192 px, padding horizontal 16 px, texto 14 px y separación de iconos 8 px. Herramientas: 48 × 48 px. El selector de P&L comparte la altura y el padding de sus acciones contiguas.

## Evidencia

- `before/`: referencia renderizada antes del ajuste en seis secciones.
- `after/`: P&L, proveedores, documentos, tareas, registro RFI y presupuesto de ventas.
- `after-extra/`: planos, Programa de Obra, requisiciones y capturas del detalle RFI.
- `regressions/`: capturas de las pruebas funcionales existentes de tareas y Programa de Obra.
- `build.log`: compilación de producción y TypeScript correctos; Vite conserva su aviso por tamaño de algunos paquetes.

Los archivos `measurements.json` registran 27 renders de nueve secciones a 320, 390 y 1440 px. Se verificaron alturas, ancho de herramientas, límites del viewport y ausencia de errores JavaScript y desbordamientos. El detalle RFI también pasó la comprobación de sus acciones a los tres tamaños.

Pruebas funcionales correctas:

- `node scripts/test-pnl-ui.mjs`: navegación, reportes, menú de herramientas, foco, configuración y carga original.
- `node scripts/test-task-filters-ui.mjs`: filtros, permisos, teclado, foco y adaptación responsiva.
- `node scripts/test-programa-toolbar-ui.mjs`: menú Archivo, diálogos, estados de carga, cambio de proyecto y modo de enfoque.

Se revisaron visualmente las capturas de escritorio y móvil. Se conservaron tipografía, paleta y estados existentes. El ajuste no agrega animaciones. Toda la validación usa datos simulados locales.

Contrato para nuevas secciones: `docs/ui-action-controls.md`.
