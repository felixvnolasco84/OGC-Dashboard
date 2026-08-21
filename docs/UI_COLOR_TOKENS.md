# Sistema de color neutral

La interfaz usa una escala neutral cálida centralizada en `src/index.css`. Los
componentes no deben consumir números de gris ni hexadecimales neutrales; deben
seleccionar el token según la función del elemento.

## Tokens para componentes

| Uso | Clase de texto | Fondo | Borde |
| --- | --- | --- | --- |
| Contenido principal, títulos y valores | `text-foreground` | `bg-background` | `border-foreground` |
| Texto secundario y descripciones | `text-muted-foreground` | `bg-muted` | `border-border` |
| Metadatos y ayudas de menor jerarquía | `text-subtle-foreground` | `bg-subtle` | `border-border` |
| Contenido deshabilitado o placeholder | `text-disabled-foreground` | `bg-disabled` | `border-border-strong` |
| Tarjetas, paneles y contenedores elevados | `text-card-foreground` | `bg-card` | `border-border` |
| Contenido sobre una superficie oscura neutral | `text-inverse-foreground` | `bg-inverse` | `border-inverse` |
| Texto o iconos sobre colores de estado | `text-on-color` | — | `border-on-color` |
| Backdrops y scrims | — | `bg-overlay/50` | — |
| Foco de teclado | — | — | `ring-ring` |

Los modificadores de opacidad siguen disponibles, por ejemplo `bg-card/95`,
`border-border/60` y `text-on-color/70`.

## Criterio de uso

- `foreground` es el nivel predeterminado para títulos, etiquetas y datos que
  deben leerse primero.
- `muted-foreground` conserva contraste de lectura para texto explicativo.
- `subtle-foreground` se limita a metadatos cortos, iconos auxiliares y ayudas.
- `disabled-foreground` no debe usarse para información necesaria para completar
  una tarea; comunica inactividad o baja disponibilidad.
- `border` separa estructuras normales; `border-strong` identifica campos,
  dropzones o controles que necesitan un límite más evidente.
- Los colores rojo, verde, azul y amarillo se reservan para estado, severidad o
  datos. No sustituyen niveles de jerarquía neutral.

## Renderizadores sin CSS

Correos, PDF/canvas y valores de color persistidos no siempre pueden resolver
variables CSS. Esos casos usan `STATIC_NEUTRAL_COLORS` desde
`src/lib/design-tokens.ts`, que mantiene el equivalente estático de la paleta.

## Regla de mantenimiento

No agregar clases como `text-gray-500`, `bg-white`, `border-slate-200`,
`text-black` ni hexadecimales neutrales dentro de componentes. Si
aparece una necesidad que no corresponde a los tokens anteriores, debe definirse
primero su función semántica en el tema global.
