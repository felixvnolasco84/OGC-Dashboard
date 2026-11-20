# Medidas de las acciones de sección

Las cabeceras usan las medidas compartidas de `src/index.css`, expuestas en Tailwind y en los componentes `Button` y `SelectTrigger`.

| Control | Uso | Medidas |
| --- | --- | --- |
| `Button size="action"` | Crear, cargar, agregar y otras acciones con texto | Alto 48 px; ancho mínimo 192 px; padding horizontal 16 px; texto 14 px; separación de iconos 8 px |
| `Button size="actionIcon"` | Menú de herramientas o acciones con icono | 48 × 48 px; padding 0; icono 16 px |
| `SelectTrigger size="action"` | Selector junto a acciones de cabecera | Alto 48 px; padding horizontal 16 px; ancho según el contenido de la sección |

```tsx
<div className="flex flex-wrap items-center gap-2">
  <Button size="action" onClick={onCreate}>
    <Plus aria-hidden="true" />
    Nuevo proyecto
  </Button>
  <Button size="actionIcon" variant="outline" aria-label="Acciones del proyecto">
    <MoreHorizontal aria-hidden="true" />
  </Button>
</div>
```

El ancho mínimo permite que textos largos crezcan. En móvil, los grupos deben permitir saltos de línea; `w-full sm:w-auto` puede ampliar una acción al ancho disponible. Los iconos comparten el tamaño definido por `Button`: añadir márgenes al icono duplica la separación.

Para ajustar estas medidas en toda la aplicación, cambiar `--control-height`, `--control-action-width` y `--control-padding-x`. Las reglas responsivas respetan el ancho mínimo de `size="action"`.

La comprobación visual de este ajuste está en `output/button-alignment`: capturas antes/después y medidas de los controles a 320, 390 y 1440 px, con datos simulados.
