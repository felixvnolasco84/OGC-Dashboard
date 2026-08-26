# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
# OGC-Dashboard

## Análisis de facturas con IA

El análisis se inicia desde **Transacciones → Documentos** y sólo está disponible para los roles `admin` y `finance`. Admite un CFDI XML y, opcionalmente, un PDF o imagen. Un desglose no se publica al chatbot hasta que una persona lo aprueba.

Variables de Convex requeridas:

```bash
npx convex env set OPENAI_API_KEY sk-...
npx convex env set OPENAI_INVOICE_MODEL gpt-5.6-terra
```

`OPENAI_INVOICE_MODEL` es opcional; su valor predeterminado es `gpt-5.6-terra`. Los CFDI se extraen localmente y sólo sus descripciones de conceptos se envían para clasificación. PDF e imágenes se procesan visualmente. Las facturas pendientes, rechazadas o desactualizadas nunca forman parte de los agregados del chatbot.
