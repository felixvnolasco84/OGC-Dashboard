/**
 * Neutral colors for renderers that cannot resolve CSS custom properties
 * (email clients, PDF/canvas export and persisted color values).
 *
 * Application components should use the semantic Tailwind utilities backed by
 * src/index.css instead of importing these values directly.
 */
export const STATIC_NEUTRAL_COLORS = {
  surface: "#FFFFFF",
  background: "#FAFAF8",
  mutedSurface: "#F5F5F3",
  border: "#DDDCD8",
  borderStrong: "#B9B9B4",
  disabledForeground: "#A3A39E",
  subtleForeground: "#74746E",
  mutedForeground: "#63635E",
  bodyText: "#3D3D3A",
  foreground: "#282822",
  inverse: "#181816",
} as const;
