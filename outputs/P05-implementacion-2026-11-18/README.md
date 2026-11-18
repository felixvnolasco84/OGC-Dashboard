# P05 · Nuevo proyecto como acción principal

Implementación real en `/proyectos`, verificada el 18 de noviembre de 2026 con la sesión administradora existente en Chrome y el servidor local `http://localhost:5173`.

## Resultado

- «Nuevo proyecto» es la acción principal y utiliza el alta existente.
- «Acciones de proyectos» abre un menú Radix con Consultar → Historial de creaciones, Importar → Subir transacciones y Configuración → Configurar ubicaciones.
- El menú se cierra y restaura el foco antes de abrir un diálogo. El cierre de los diálogos devuelve el foco al control de entrada.
- El historial global utiliza `BudgetOriginalDialog` controlado, sin `projectId`, con `hideTrigger` y fuera del contenido del menú. Su acceso sigue condicionado al rol administrador.
- El buscador y el filtro de ubicación conservan catálogo y comportamiento combinado. Se retiró el acceso duplicado de configuración de esa barra.

## Archivos de P05

| Archivo | Cambio |
| --- | --- |
| `src/pages/ProyectosTable/ProyectosTablePage.tsx` | Cabecera, menú agrupado y apertura controlada del historial global. |
| `src/components/modals/add-proyecto-modal.tsx` | Capturar y devolver el foco al botón que abrió el alta. |
| `src/components/modals/upload-transactions-modal.tsx` | Devolver el foco al cancelar/cerrar; conservar el foco dentro del importador por proyecto al continuar. |
| `src/components/modals/project-locations-modal.tsx` | Devolver el foco al disparador al cerrar. |

Los tres cambios de modal sólo afectan foco. No se modificaron stores, validaciones, queries, mutations, cálculos, catálogo, permisos ni procesos de importación. Se reutilizó la API compartida de `BudgetOriginalDialog` añadida por P01 sin editar ese archivo. Los cambios concurrentes de P01 y P03 permanecen independientes.

## Validación

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | Correcto: TypeScript, Vite y PWA. Vite advierte sobre chunks de más de 500 kB; no impide compilar. Registro: [build.log](build.log). |
| `npx eslint src/pages/ProyectosTable/ProyectosTablePage.tsx src/components/modals/project-locations-modal.tsx src/components/modals/upload-transactions-modal.tsx src/components/modals/add-proyecto-modal.tsx` | Correcto, sin hallazgos. |
| `npm run test:project-locations` | Correcto: `Project location catalog rules: OK`. |
| `git diff --check` sobre los cuatro archivos de P05 | Correcto. |
| 1440 × 1000 y 390 × 844 CSS px | Cabecera cerrada, menú abierto y los cuatro accesos existentes. |
| 1024 × 1000 CSS px | Cabecera y menú legibles; ambos controles de cabecera visibles. |
| Desbordamiento | `document.documentElement.scrollWidth === innerWidth` en 1440, 1024 y 390 px. La tabla conserva su desplazamiento propio en escritorio. |
| Teclado | Enter abre el menú y el historial; flechas abajo/arriba cambian de elemento; Escape cierra menú/diálogos y devuelve el foco. |
| Foco | Verificado en alta, historial, importación y ubicaciones. Menú desmontado antes de abrir los diálogos. |
| Búsqueda + ubicación | `lOtE 77` encuentra el proyecto en Los Cabos, y lo oculta con Ciudad de México o Sin ubicación. Todas las ubicaciones recupera el resultado. Una búsqueda sin coincidencias conserva la barra en escritorio y móvil. |
| Importador global | Abre «Importar transacciones». Elegir el proyecto y continuar abre «Subir pagos y fuerza laboral» con ese proyecto y el foco dentro del diálogo. Cancelado sin archivos. |
| Protección de acceso | Revisión de código: `/proyectos` sigue con `ProtectedRoute requiredRole="admin"`; historial condicionado a `currentUser?.role === "admin"`. No se alteraron protecciones backend. |

Las medidas solicitadas se comprobaron leyendo `innerWidth`/`innerHeight`: el entorno usa DPR 1.5 y el override del navegador requirió dimensiones físicas equivalentes. Al terminar se restableció el viewport temporal.

## Límites de la comprobación

El historial global de esta sesión está vacío: se verificaron carga, estado vacío, cierre y reapertura. No hubo registros con los que comprobar descarga, paginación o reanudación; su implementación y permisos compartidos se conservaron. No se cambió de rol para simular una sesión no administradora. El estado de carga de la tabla se conserva por revisión del código; no se forzó retraso de backend. No se crearon proyectos, reanudaron intentos, cargaron archivos ni modificaron ubicaciones.

## Capturas de la aplicación

Estas imágenes son evidencia nueva de la aplicación, separada de las simulaciones de auditoría.

| Vista | Escritorio | Móvil |
| --- | --- | --- |
| Antes | [1440 px](01-antes-escritorio-1440.jpg) | [390 px](02-antes-movil-390.jpg) |
| Cabecera implementada | [1440 px](09-cabecera-escritorio-1440.jpg) | [390 px](03-cabecera-movil-390.jpg) |
| Menú implementado | [1440 px](10-menu-escritorio-1440.jpg) | [390 px](04-menu-movil-390.jpg) |
| Nuevo proyecto | [1440 px](14-nuevo-proyecto-escritorio-1440.jpg) | [390 px](08-nuevo-proyecto-movil-390.jpg) |
| Historial global | [1440 px](15-historial-escritorio-1440.jpg) | [390 px](05-historial-movil-390.jpg) |
| Importador global | [1440 px](17-importador-global-escritorio-1440.jpg) | [390 px](06-importador-global-movil-390.jpg) |
| Configurar ubicaciones | [1440 px](16-ubicaciones-escritorio-1440.jpg) | [390 px](07-ubicaciones-movil-390.jpg) |
| Filtro y lista vacía | [Catálogo de ubicaciones](11-catalogo-filtro-1440.jpg) | [Búsqueda sin coincidencias](19-lista-vacia-movil-390.jpg) |

Adicionales: [cabecera 1024 px](12-cabecera-intermedia-1024.jpg), [menú 1024 px](13-menu-intermedio-1024.jpg) y [transición al importador del proyecto](18-transicion-importador-proyecto-1440.jpg).
