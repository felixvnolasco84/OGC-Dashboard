# Corrección P1 — estados de requisición independientes

Fecha: 5 de octubre de 2026. Referencia: hallazgo 04 del análisis de producto.

## Comportamiento anterior y nuevo

Antes, seleccionar una etapa podía aprobar todos los materiales, revertir el pago y reiniciar la recepción. Varias mutaciones secuenciales permitían guardar un cambio antes de fallar por permisos en otra dimensión.

Ahora, marcar Pagada modifica únicamente el estado de pago; marcar Recibida modifica únicamente la entrega. Elegir una condición cumplida, incluida la aprobación parcial, no guarda cambios, evidencia ni historial adicional. Se retiró la conexión visual entre los indicadores para representar condiciones independientes.

El control de aprobación pendiente abre la revisión individual de materiales existente y conserva las cantidades editadas y las decisiones ya tomadas. Abrir la revisión no realiza una aprobación masiva ni solicita un comentario: reutiliza los requisitos del flujo individual actual. El pago y la recepción requieren aprobación completa o parcial; un requisito pendiente se explica en el diálogo y ofrece acceso a la revisión a administración/finanzas. Los demás perfiles reciben orientación para solicitarla.

Los retrocesos explícitos permanecen en los controles actuales de pago y entrega. La confirmación muestra valores anteriores/nuevos y las dimensiones que se conservan. También muestra el cambio de la solicitud de pago en obra cuando la lógica existente la marca pagada o cancelada.

El comentario/comprobante sigue siendo opcional al marcar Pagado. La recepción requiere comentario o foto; una foto debe ser una imagen menor a 10 MB. Otros cambios conservan el comentario obligatorio y el documento opcional. Los mensajes de resultado nombran el estado que efectivamente cambió.

Cada confirmación realiza una única mutación de estado. Un bloqueo inmediato evita envíos duplicados; los estados repetidos son operaciones sin escrituras en backend. El estado esperado impide sobrescribir una transición concurrente durante la confirmación/subida del documento. El diálogo conserva la información y permite reintentar ante un error.

## Backend y trazabilidad

- Los permisos existentes se conservan: administración/finanzas revisan y cambian pago; administración/usuario/contratista solicitante registran entrega. Finanzas no adquiere permisos de entrega.
- Se comprueban sesión, identidad del actor, acceso al proyecto, estados válidos y requisito de aprobación en backend.
- La revisión completa valida que las decisiones incluyan exactamente los materiales de la requisición; no admite vacíos, duplicados ni materiales ajenos. La revisión individual reconoce una cantidad reducida como aprobación parcial y evita escrituras de decisiones repetidas.
- Se reutiliza `requisicion_history`, incluyendo campo, antes/después, actor, fecha, comentario y vínculos de evidencia. Se añade la identificación del campo de aprobación y la etiqueta explícita de pago/entrega en su presentación. No se creó otro historial ni un módulo.

## Archivos principales

- `src/pages/ProyectoRequisiciones/ProyectoRequisicionesPage.tsx`: controles independientes, acceso a revisión, confirmación, requisitos, bloqueo y resultados.
- `convex/requisicionStateRules.ts`: reglas compartidas de transición y consecuencias.
- `convex/requisiciones.ts`: validación de cambios y revisiones, permisos e idempotencia.
- `src/components/modals/RequisicionHistoryModal.tsx`: identificación de la dimensión en el historial.
- `convex/requisicionStates.test.mjs`: 34 pruebas de estados, aprobación y autorización con contextos en memoria.
- `scripts/test-requisiciones-ui.mjs` y `e2e/requisiciones/*`: escenarios de interfaz con transportes simulados.

## Validación

- `npm run test:requisicion-states`: 34 pruebas aprobadas.
- `npm run test:requisiciones-ui`: aprobado en 320, 390, 768, 1024, 1440 y 1536 px; diálogos también en ventanas de poca altura. Incluye requisitos pendientes, revisión existente, conservación de aprobación parcial, pago con entrega completa, recepción sin pago, repetición, doble envío, error/reintento, retrocesos y permisos por rol.
- `npm run test:requisicion-notifications`: aprobado.
- `npm run typecheck:convex` y comprobación TypeScript del frontend: aprobados.
- ESLint sobre los cuatro archivos de implementación: aprobado.
- `npm run build -- --configLoader runner`: compilación de producción aprobada. El cargador normal de Vite encuentra una restricción de lectura del sandbox; el cargador alternativo permite compilar sin modificar la configuración del proyecto. Vite mantiene su aviso sobre tamaño de los bundles.
- `git diff --check`: aprobado.

Las capturas se guardaron en `test-results/requisiciones-responsive`. Se inspeccionaron visualmente los diálogos de pago y retroceso en escritorio/móvil y se corrigió un desbordamiento del formulario en móvil.

## Alcance y límites

Todo se validó con datos y transportes simulados y handlers ejecutados en memoria. No se modificaron requisiciones reales, no se enviaron notificaciones, no se registraron pagos reales y no se publicó/desplegó. La integración con un despliegue real de Convex queda sin ejecutar. El checkout no tenía cambios pendientes al comenzar; los cambios entregados permanecen locales y sin commit.
