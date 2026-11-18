# P01 · Un solo menú para las acciones del presupuesto

Implementación y verificación del 18 de noviembre de 2026. Alcance: cabecera de Obra → Presupuesto.

## Cambio aplicado

- `src/pages/Presupuesto/PresupuestoPage.tsx`: un disparador «…», con nombre accesible «Acciones de presupuesto», sustituye los accesos separados a Excel de origen, Agregar y acciones. Conserva Total Ingresos, Neto, moneda, cálculos y acceso directo a ingresos.
- Las ocho acciones del administrador aparecen en el orden aprobado, agrupadas en Crear y registrar, Consultar y Mantenimiento, sin submenús. Se reutilizan los componentes de `ui/dropdown-menu.tsx` y `ui/button.tsx`.
- Las opciones conservan sus callbacks y contexto del proyecto. La acción seleccionada se ejecuta después del cierre y la restauración de foco del menú de Radix.
- `src/components/Presupuesto/BudgetOriginal.tsx`: admite apertura controlada, ocultar el disparador y personalizar el retorno de foco. Conserva el uso autónomo y sin projectId, y la consulta del historial solo mientras está abierto. El diálogo permanece fuera del contenido desmontable del menú.
- El presupuesto incompleto conserva su aviso y deja disponible Excel de origen; las otras opciones quedan deshabilitadas. No se cambia la lógica de sincronización ni sus errores, etiqueta de carga o icono animado.
- Agregar pago, Subir Excel y Cargar factura conservan `canCreateTransactions`; ingresos conserva `hasIncomeManagementAccess`; el reporte continúa siendo exclusivo de admin. Agregar partida y Sincronizar datos tienen una protección explícita acorde con `assertCanWrite`, ya que el contenido del menú se renderiza en un portal fuera del contenedor de solo lectura. El disparador y la lectura del Excel conservan `data-viewer-readonly-allow`.

## Verificación en la aplicación real

Aplicación local en localhost:5173, proyecto Lote 77. Las imágenes `P01_Real_*` son capturas nuevas de esta implementación, sin el simulador de la auditoría.

| Comprobación | Resultado |
| --- | --- |
| Cabecera y menú a 1440 × 1000 | Correctos; ocho acciones, tres grupos y dos separadores |
| Cabecera y menú a 1024 × 1000 | Correctos; sin desbordamiento |
| Cabecera y menú a 390 × 844 | Correctos; indicador y disparador en una fila |
| Cabecera y menú a 320 × 844 | Correctos; importes completos y menú dentro del viewport |
| ArrowDown en el disparador y las opciones, Enter, Escape | Correctos; apertura, navegación, selección y cierre |
| Retorno de foco al cerrar menú y Excel de origen | Correcto; vuelve a Acciones de presupuesto |
| Agregar pago | Abre Registrar pagos con contexto de Lote 77 |
| Agregar partida con teclado | Abre Agregar Elementos al Presupuesto para Lote 77 |
| Subir Excel | Abre Subir pagos y fuerza laboral para Lote 77 |
| Cargar factura | Abre Cargar y clasificar factura para Lote 77 |
| Gestionar ingresos | Abre Ingresos de Lote 77; importe coincide con la cabecera |
| Excel de origen | Abre el diálogo real; el proyecto informa que no tiene un Excel inicial respaldado |
| Crear reporte financiero | Navega a /proyecto/{id}/reportes?sections=executive,financial,earned_value,cashflow,variances |
| Menú tras abrir cada diálogo | Cerrado; sin superposición del menú |
| Consola de la pestaña | Sin errores capturados durante la verificación |
| npm run build | Correcto: tsc -b y vite build; advertencia general por chunks mayores de 500 kB |
| git diff --check | Correcto |

No se guardaron pagos, partidas ni ingresos; no se seleccionaron ni subieron archivos; no se generaron reportes ni se ejecutó Sincronizar datos. Se verificaron aperturas y navegación, sin probar escrituras en datos reales. Los formularios compartidos conservan su implementación y comportamiento de cierre existentes; la restauración explícita añadida se limita al nuevo acceso a Excel de origen.

## Roles y presupuesto incompleto: comprobación aislada

Las imágenes `P01_Aislado_*` corresponden al componente real `PresupuestoPage`, con consultas sustituidas por datos ficticios locales. No son capturas de la sesión real ni maquetas de la auditoría. El fixture no utiliza autenticación ni el backend y rechaza todas las mutaciones y acciones.

- Viewer: el disparador funciona dentro del contenedor de solo lectura; solo aparecen Ver ingresos y Excel de origen. El Excel abre y el foco vuelve al disparador al cerrar.
- Finance: siete acciones; Gestionar ingresos visible y Crear reporte financiero ausente.
- Admin con presupuesto incompleto: las ocho opciones aparecen; solo Excel de origen está habilitada. Su selección con Enter abre el diálogo y cierra el menú. El aviso de creación incompleta sigue visible.
- Compatibilidad: `BudgetOriginalDialog` sin props conserva su botón Creaciones de proyectos y abre el historial sin projectId.

También se revisaron las protecciones de backend existentes: `assertCanWrite` para partida/sincronización, `assertBudgetReady`, acceso al proyecto en `budgetCreationHistory` y restricción de reanudación al administrador que inició la creación. No se cambió ninguna de ellas.

Para repetir estos casos: ejecutar `npm exec vite -- --config outputs/P01-implementacion-2026-11-18/verificacion/vite.config.ts` y abrir `http://127.0.0.1:5184/outputs/P01-implementacion-2026-11-18/verificacion/index.html?role=viewer`. Los otros casos usan `?role=finance`, `?role=admin&incomplete=1` y `?role=admin&legacy=1`. El servidor auxiliar se detuvo al terminar.

## Capturas

- `P01_Real_Desktop_Cabecera.jpg` y `P01_Real_Desktop_Menu.jpg`
- `P01_Real_Movil_Cabecera.jpg`, `P01_Real_Movil_Menu.jpg` y `P01_Real_Movil_Excel_origen.jpg`
- `P01_Real_1024_Cabecera.jpg` y `P01_Real_1024_Menu.jpg`
- `P01_Real_320_Cabecera.jpg` y `P01_Real_320_Menu.jpg`
- `P01_Aislado_Viewer_Menu.jpg` y `P01_Aislado_Incompleto_Menu_Movil.jpg`

Los cambios ajenos que ya existían o aparecieron en el árbol compartido durante la tarea se conservaron. Esta implementación solo modifica los dos archivos de aplicación indicados y añade esta carpeta de evidencia/verificación.
