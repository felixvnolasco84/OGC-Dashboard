# Handoff: carga y clasificación inteligente de facturas

## Instrucción para la siguiente conversación

Continúa trabajando en `C:\Users\felix\Documents\OGC-Dashboard`. Lee este archivo antes de modificar código. La implementación inicial ya está integrada; el siguiente trabajo recomendado es corregir los edge cases priorizados en la sección **Hallazgos pendientes** y añadir las pruebas de integración correspondientes.

## Estado del repositorio al exportar

- Rama: `main`
- Commit actual: `fd131e1` (`Refine dashboard workflows and interface`)
- El worktree estaba limpio antes de crear este archivo de handoff.
- Fecha del handoff: 2026-09-02, zona horaria `America/Mexico_City`.

## Objetivo original

Agregar un flujo para cargar una factura directamente al sistema desde Presupuesto o Transacciones, extraer sus conceptos, inferir la partida/familia/subpartida real del proyecto aunque el nombre no coincida exactamente, permitir revisión humana y crear la transacción únicamente después de la aprobación de admin/finance.

Reglas funcionales solicitadas:

- Una factura por carga: CFDI XML y respaldo PDF/PNG/JPEG opcional.
- XML como fuente contable prioritaria; visual como evidencia secundaria.
- Destinos presupuestales válidos: nivel 3 o nivel 2 sin hijos; nunca nivel 1.
- Inferencia híbrida: memoria humana aprobada, similitud textual y selección semántica por IA.
- Sugerencias nunca autoaprobadas.
- Proveedor resuelto por RFC y después por nombre; creación siempre explícita.
- Estado inicial `Por pagar`; si es `Pagado`, exigir fecha y método.
- Para moneda distinta de MXN, exigir tipo de cambio.
- Suma de conceptos igual al total revisado con tolerancia de $0.01.
- Aprobación atómica e idempotente: una transacción y un `pago` por renglón, documentos vinculados, métricas actualizadas y memoria aprendida.
- Notas de crédito negativas; complementos de pago sin creación de gasto.
- Sin validación SAT en línea ni creación automática de proveedores.

## Implementación existente

### Interfaz

- `src/components/invoices/InvoiceIntakeDialog.tsx`
  - Carga de archivos y proyecto.
  - Cola para revisores.
  - Formulario fiscal/contable.
  - Selección de proveedor y creación explícita.
  - Tabla de conceptos con ruta presupuestal editable e importe corregible.
  - Aprobación/rechazo y navegación a la transacción.
- `src/pages/Presupuesto/PresupuestoPage.tsx`
  - Renderiza el diálogo con proyecto fijo.
- `src/pages/TransaccionesTable/TransaccionesTablePage.tsx`
  - Renderiza el diálogo con selector de proyecto.

### Backend y clasificación

- `convex/invoiceAnalysis.ts`
  - `startDirectInvoiceIntake` crea el borrador y programa el procesamiento.
  - `getDirectIntake` entrega revisión, conceptos, documentos y catálogo válido.
  - `listDirectIntakeQueue` lista pendientes para admin/finance.
  - `approveDirectInvoice` revalida y crea transacción/pagos/asignación de forma atómica.
  - `completeRun` persiste extracción, sugerencias y detección de duplicados.
- `convex/invoiceProcessing.ts`
  - Extrae XML localmente.
  - Usa Responses API con salida JSON Schema estricta.
  - Envía candidatos presupuestales reales y memoria aprendida.
  - Rechaza identificadores de partida que no estén en el catálogo enviado.
  - Tiene fallback determinista para XML cuando falla la IA.
- `convex/invoiceRules.ts`
  - `buildInvoiceBudgetTargets` genera destinos nivel 3 o familias nivel 2 hoja.
  - Normalización, similitud textual, ranking y parsing CFDI.
- `convex/schema.ts`
  - Referencias de transacción opcionales durante borrador.
  - Trazabilidad factura-concepto-pago.
  - Campos de sugerencia/aprobación presupuestal.
  - Tabla `invoice_budget_mapping_memory` por proyecto.
- `convex/transacciones.ts`
  - Búsqueda por descripción original de factura y compatibilidad con referencias opcionales.

## Verificaciones realizadas durante la implementación

Pasaron:

- `npm.cmd run test:invoices`
- `npm.cmd run typecheck:convex`
- `npm.cmd run test:providers`
- `npm.cmd run test:partidas`
- `npm.cmd run build`
- ESLint dirigido a todos los archivos modificados del flujo.

El lint completo del repositorio tenía 21 errores preexistentes en archivos ajenos al flujo. El build sólo reportó advertencias de tamaño de bundle y datos antiguos de Browserslist.

## Hallazgos pendientes

### P1 — bloqueadores recomendados antes de producción

1. **Aislamiento multiempresa de proveedores.** `proveedores` no tiene `organization_id`; `proveedores.getAll` devuelve todos y `approveDirectInvoice` sólo comprueba que el proveedor esté activo. El requisito de no usar proveedores ajenos no puede garantizarse con el esquema actual.

2. **Deduplicación con carrera e identidad inestable.**
   - El desempate usa `created_at <`; dos cargas creadas en el mismo milisegundo pueden ignorarse mutuamente.
   - `source_hash` combina todos los archivos y las versiones de esquema/taxonomía. El mismo XML con otro respaldo o tras una actualización genera otro hash.
   - Sin UUID, esos casos pueden contabilizarse dos veces.
   - Recomendación: clave canónica del XML/documento principal y tabla/claim único transaccional.

3. **Escalabilidad de aprobación.** `approveDirectInvoice` inserta hasta 250 `pagos`; cada inserción dispara recálculos completos de jerarquía y métricas. Puede exceder límites de Convex. Reutilizar el patrón bulk y recalcular cada jerarquía una sola vez dentro de la misma mutación.

4. **El aprobador no ve los archivos.** `getDirectIntake` devuelve URLs, pero `InvoiceIntakeDialog` no renderiza `analysis.documents`. Agregar previsualización/descarga de XML, PDF e imagen.

5. **XML no obligatorio.** Tanto UI como backend permiten PDF/imagen sin XML. El contrato original exige exactamente un XML y un respaldo visual opcional.

6. **El respaldo visual se ignora cuando hay XML.** En `processInvoiceRun`, la rama XML crea `xmlPrompt` y no incluye el PDF/imagen encontrado. Debe usarse como evidencia secundaria sin permitir que reemplace los importes del XML.

7. **Identidad fiscal no validada.** El backend no exige que el RFC del proveedor seleccionado coincida con el RFC emisor, ni valida el RFC receptor contra la organización. Como mínimo, bloquear o exigir excepción explícita para discrepancias.

8. **Pruebas de aceptación incompletas.** Sólo existen pruebas de reglas puras. Faltan pruebas de mutaciones y UI para permisos, rollback, reintentos, concurrencia, duplicados, cola, rechazo, fallos de IA y creación exacta de una transacción.

### P2 — importantes

9. **La inferencia no es realmente memoria-primero.** La memoria sólo se entrega al modelo como contexto. Si la IA falla, incluso una coincidencia humana exacta queda sin clasificar. La similitud textual sólo se usa para recortar catálogos mayores de 2,500 rutas.

10. **Colisiones en la memoria.** El upsert busca únicamente por `project_id + normalized_description`. Conceptos iguales con distintos `ClaveProdServ` o decisiones legítimas diferentes sobrescriben la misma memoria. Usar una clave compuesta y modelar ambigüedad.

11. **Pendientes invisibles en la cola.** Se toman los últimos 150/300 registros y luego se filtran. Una pendiente antigua puede desaparecer si existen suficientes registros recientes. Añadir índices por proyecto/modo/estado o paginación real.

12. **Fuga de metadatos de duplicados.** `getDirectIntake` valida acceso a la factura actual, pero devuelve folio, UUID y transacción del registro duplicado sin validar acceso al proyecto de ese registro.

13. **Monedas limitadas en UI.** El backend acepta cualquier código ISO de tres letras, pero la interfaz sólo permite MXN/USD/EUR. CFDI en CAD, GBP, JPY, etc. no pueden aprobarse.

14. **Idempotencia insuficiente desde el cliente.** `crypto.randomUUID()` se genera después de subir los archivos y cambia en cada reintento. Una respuesta perdida o una carga parcial deja blobs huérfanos y puede crear otro borrador.

15. **El cargador no puede recuperar sus pendientes.** Sólo admin/finance consulta la cola. Un usuario escritor que abandona la página no tiene historial propio de cargas ni opción de reintento.

16. **Alternativas por concepto ausentes.** El selector muestra todo el catálogo, no las alternativas ordenadas con puntuación/confianza solicitadas.

17. **Conceptos de importe cero.** La aprobación bloquea todo renglón con `amount === 0`; revisar política para muestras, descuentos completos o conceptos informativos.

18. **Rechazados bloquean nuevas cargas.** Una carga previa rechazada sigue contando como duplicado y no existe una operación de corregir/reabrir/reprocesar.

## Orden recomendado de trabajo

1. Diseñar aislamiento de proveedores y visibilidad de duplicados por organización.
2. Crear identidad canónica de factura y claim deduplicador atómico.
3. Hacer obligatorio el XML y usar el respaldo visual correctamente.
4. Agregar visor de documentos y validaciones RFC emisor/receptor.
5. Convertir la aprobación a inserción bulk con recálculo único.
6. Implementar memoria determinista previa a IA y corregir su clave.
7. Corregir cola, historial del cargador, reintentos y limpieza de blobs.
8. Añadir pruebas backend/UI de aceptación antes de ampliar la UX.

## Restricciones de trabajo

- Preservar cambios ajenos si el worktree deja de estar limpio.
- Usar `apply_patch` para editar archivos.
- No desplegar Convex ni efectuar cambios externos sin solicitud explícita.
- Después de cambios, ejecutar como mínimo `test:invoices`, `typecheck:convex`, `test:providers`, `test:partidas`, ESLint dirigido y build.
