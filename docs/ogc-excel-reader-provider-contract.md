# Contrato de proveedores para `ogc-excel-reader`

El endpoint `POST /upload/transactions` debe conservar el contrato existente y agregar los siguientes campos a cada elemento de `transactions`:

```json
{
  "source_key": "Sheet1:2-3",
  "proveedor_nombre": "VILLAGOMEZ JURADO S.A. DE C.V.",
  "validation_errors": [],
  "transaction": {
    "monto_total": 53717.28,
    "fecha": 46171,
    "tipo_pago": "TRANSFERENCIA",
    "moneda": "MXN",
    "tipo_cambio": "17.3305",
    "status": "Pagado",
    "categoria": "MATERIAL"
  },
  "lineitems": []
}
```

## Reglas obligatorias

- Leer `PROVEEDOR` como texto, hacer `trim` y devolver su escritura original en `proveedor_nombre`.
- `source_key` debe ser estable para el mismo archivo y grupo; se recomienda `hoja:filaInicial-filaFinal`.
- Si las filas agrupadas contienen más de un proveedor normalizado, conservar el grupo en `transactions` y agregar un error `MIXED_PROVIDERS` a `validation_errors` para que la vista previa lo bloquee sin impedir que continúen las demás transacciones.
- Reportar filas exactamente duplicadas mediante `validation_errors`, por ejemplo `{ "code": "DUPLICATE_ROW", "message": "Filas exactamente duplicadas", "row_numbers": [2, 3] }`. No eliminarlas silenciosamente: deben bloquear la transacción hasta que el usuario corrija el archivo.
- No convertir `PROVEEDOR` en `banco`; ambos campos tienen significados independientes.
- Mantener `categoria` en su campo propio y no reutilizar `codigo_referencia`.
- Una celda vacía de proveedor es válida y se devuelve como ausencia del campo, porque la relación en el dashboard es opcional.

El dashboard acepta temporalmente respuestas sin estos campos para compatibilidad, pero esas transacciones se importarán como `Sin proveedor`.

`validation_errors` es opcional para compatibilidad. Cada elemento puede ser texto o un objeto con `code`, `message` y `row_numbers`; la interfaz presenta el mensaje y bloquea solo esa transacción.
