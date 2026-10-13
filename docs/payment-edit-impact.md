# Edición de pagos y transacciones de Obra

Implementación local verificada el 13 de octubre de 2026.

## Comportamiento

Los dos editores de Obra comparten el flujo **editar → revisar cambios → confirmar actualización**. Desde una familia o partida, la transacción muestra todos sus conceptos y destaca el contexto de origen. El total global siempre incluye todos los conceptos. La edición individual limita el borrador al monto seleccionado y muestra los datos de la transacción como contexto.

La revisión compara total global, subtotal de origen, conceptos modificados, estado, fecha, moneda, tipo de cambio, proveedor y datos bancarios. Incluye los efectos en jerarquías, presupuesto, honorarios, indirectos, contribución a P&L por periodo y análisis de factura que requerirán revisión.

Cancelar un borrador modificado requiere elegir entre continuar y descartar. Reabrir un editor inicia una sesión nueva. Los errores conservan el borrador. Si cambian datos mientras se revisan, la confirmación se bloquea y exige actualizar la base y revisar de nuevo. Los cambios propios se conservan durante esa actualización; los campos no editados toman los valores actuales.

La biblioteca de cuentas conserva su funcionamiento independiente: guardar, editar o archivar una cuenta se aplica inmediatamente, incluso si después se cancela el borrador de la transacción. El panel explica esta separación.

## Guardado y cálculo

- `transacciones.getEditContext`: consulta autorizada de la transacción y todos sus conceptos.
- `transacciones.previewEdit`: simulación de sólo lectura; entrega la comparación y las firmas de la base y del impacto.
- `transacciones.saveEdit`: vuelve a comprobar acceso, pertenencia, valores y firmas; persiste todos los cambios en una sola mutación de Convex.
- `pagos.updatePago`: la API individual existente utiliza el mismo cálculo y guardado atómico.

`convex/paymentEdit.ts` comparte las reglas existentes de jerarquías, honorarios, presupuesto, indirectos, estadísticas de proveedor y P&L. El guardado aplica los conceptos y sus valores derivados finales juntos. Un fallo posterior revierte toda la mutación. También invalida los análisis vinculados cuando cambian los conceptos, aunque la redistribución conserve el total.

Se aceptan montos finitos positivos, cero y negativos con hasta dos decimales; el campo vacío es inválido. Cambiar la moneda conserva las cifras nominales. P&L mantiene las reglas actuales de conversión, estado, clasificación, fechas y valores absolutos; la revisión muestra la contribución de esta transacción, no el total consolidado del reporte.

La recuperación tras una respuesta perdida comprueba todos los campos editables, el conjunto completo de conceptos y el total contra el resultado revisado antes de informar que los cambios ya están guardados. Si hay diferencias, conserva el borrador y exige otra revisión.

## Validación

- 28 pruebas de edición: simulación sin escrituras, total completo, redistribución, permisos, conceptos ajenos, proveedor y cuenta inválidos, concurrencia, reintento, moneda/tasa, fechas, importes negativos/cero y reversión integral ante un fallo posterior.
- Suites relacionadas de jerarquías, cuentas, presupuesto y P&L: junto con edición, **94 aprobadas y 1 omitida**.
- Pruebas del panel con los componentes reales y servicios simulados a **1440, 390 y 320 px**: edición completa/individual, cancelar y reabrir, campo vacío, foco de revisión, errores, base obsoleta, una sola confirmación y recuperación de respuesta perdida.
- Compilación de producción, comprobación de tipos de Convex y lint de los componentes modificados.

Comandos reproducibles:

```sh
npm run test:payment-edits
npm run test:payment-edits-ui
npm run typecheck:convex
npm run build
```

Las capturas están en `output/payment-edits/`; usan datos ficticios y no prueban integración con un entorno desplegado. `convex-test` está fijado en `0.0.41`, compatible con la versión original de Convex `1.26.2`.

## Alcance y límites

Sales y la asignación individual/masiva de proveedor desde tablas siguen fuera de esta fase. No se cambió el esquema ni se requiere una migración. Las funciones nuevas necesitan el despliegue habitual de Convex junto con el frontend para estar disponibles en un entorno compartido.

La revisión completa limita la carga del proyecto a 2,500 registros combinados de partidas, transacciones y conceptos; limita igualmente los vínculos de factura y la firma de impacto a 512 KiB. Si se excede la capacidad, muestra un error y bloquea el guardado; no calcula ni guarda sobre un conjunto truncado. Ampliar este límite requiere revisar el coste y los límites de ejecución de Convex.

Las verificaciones se realizaron localmente con datos aislados. No se ejecutaron cambios financieros reales ni un despliegue de producción.
