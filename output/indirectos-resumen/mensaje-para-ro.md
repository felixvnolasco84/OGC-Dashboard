**Asunto: Mejoras en el cálculo de indirectos y el P&L**

Hola, buenas tardes, Ro. Espero que te encuentres muy bien.

Realicé algunas mejoras para calcular automáticamente los indirectos de cada obra, con una lógica similar a la de honorarios. Ahora, al crear o editar un proyecto, se puede definir un porcentaje de indirectos independiente, que se aplica sobre los pagos elegibles de la obra.

**Presupuesto y Control**

El cargo automático de indirectos se incorpora al gasto de la obra y al saldo por ejercer. En Presupuesto también aparece como un concepto separado para identificarlo fácilmente, evitando contabilizarlo dos veces con los registros manuales.

**P&L**

Separé los indirectos cobrados de sus costos reales y agregué el saldo de indirectos. Así, los gastos reales se capturan directamente en el P&L, con tipo Costo estructura y categoría INDIRECTOS, y se puede ver cuánto sobra o falta sin tener que registrarlos en cada obra.

El nuevo cálculo inicia el 1 de octubre de 2026 en las obras donde se configure el porcentaje. Los periodos anteriores conservan la lógica histórica y sus registros.

La implementación está terminada y validada en móvil y escritorio; queda pendiente su publicación en el sistema. Te comparto las capturas con datos de prueba para mostrar los cambios.

Quedo atento a tus comentarios. Saludos.

**Capturas adjuntas:**

1. `01-porcentaje-indirectos.png`: configuración independiente de indirectos y honorarios.
2. `02-indirectos-presupuesto.png`: cargo automático de indirectos en Presupuesto.
3. `03-saldo-indirectos-pnl.png`: ingresos de $10,000, costos reales de $7,000 y saldo de $3,000.
