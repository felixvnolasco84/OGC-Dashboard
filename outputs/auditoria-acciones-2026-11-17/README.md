# Auditoría de acciones OGC · 17 de noviembre de 2026

Abre **index.html** para recorrer la galería. Las imágenes y las comparativas funcionan al abrir el archivo directamente.

Para probar los menús del simulador, ejecuta **iniciar-simulador.ps1** o, desde esta carpeta, `node servir.mjs`, y abre <http://127.0.0.1:5183/>. El servidor escucha únicamente en este equipo. No instala paquetes. Usa la versión ya compilada del simulador.

## Contenido

- `actuales/`: capturas reales, sin alterar, con nombres que identifican su ubicación.
- `propuestas/`: simulaciones en escritorio y móvil; el título de cada imagen identifica página, diálogo o panel.
- `comparativas/`: antes y después, con ubicación y explicación.
- `hallazgos.md`: propuestas, prioridades, beneficios y restricciones que deben conservarse.
- `cobertura.csv`: rutas registradas y nivel de comprobación.
- `cobertura-dialogos.csv`: inventario de diálogos y paneles; distingue comprobación visual y revisión en código.
- `evidencia/`: árbol de controles, capturas, referencias estáticas y límites del recorrido.
- `simulador/dist/`: versión compilada y portátil del simulador.

## Cómo interpretar la entrega

Las propuestas reorganizan acciones y controles; no son cambios aplicados a la aplicación. Las referencias estáticas conservan el aspecto de las páginas capturadas; las tablas de la maqueta se limitan a 12 filas y las gráficas de canvas se indican como referencia. Sólo los controles propuestos son interactivos. Los menús abren vistas de demostración y nunca ejecutan operaciones del sistema.

Las propuestas 24 y 25 se basan en código: no hubo proyectos de ventas seleccionables en la sesión. La ruta heredada `/dashboard` devolvió un error de validación de identificador y quedó en blanco; su captura se rechazó y se conserva únicamente como diagnóstico. La revisión no acredita accesibilidad completa ni comportamiento de todos los roles.

No se modificaron archivos de `src/` ni `convex/` como parte de esta entrega.

## Regenerar el simulador

Desde la raíz del repositorio, con las dependencias existentes:

`node node_modules/vite/bin/vite.js build --config outputs/auditoria-acciones-2026-11-17/simulador/vite.build.config.mjs`

Los archivos de trabajo están dentro de esta carpeta; la aplicación original no importa ninguno de ellos.
