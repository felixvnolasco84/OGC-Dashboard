import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { plugin as shadcn } from '@shadcn/lint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      'src/pages/Bitacora/BitacoraPage.tsx',
      'src/components/Bitacora/BitacoraCalendarView.tsx',
      'src/components/Bitacora/BitacoraGalleryModal.tsx',
      'src/components/Bitacora/BitacoraModal.tsx',
    ],
    plugins: { shadcn },
    rules: {
      // Tailwind v3 is still in use; no-unknown-classes needs Tailwind v4.
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-arbitrary-values': ['error', { allow: ['layout'] }],
      'shadcn/no-inline-styles': 'error',
      'shadcn/require-static-classes': 'error',
    },
  },
  {
    files: [
      'src/pages/Bitacora/BitacoraPage.tsx',
      'src/components/Bitacora/BitacoraCalendarView.tsx',
      'src/components/Bitacora/BitacoraGalleryModal.tsx',
      'src/components/Bitacora/BitacoraModal.tsx',
    ],
    rules: {
      'shadcn/no-arbitrary-values': 'error',
    },
  },
  {
    files: [
      'src/pages/Presupuesto/PresupuestoPage.tsx',
      'src/components/Tables/PresupuestoTable.tsx',
      'src/components/DropdownMenu/DropdownMenuComponenPartida.tsx',
      'src/components/Forms/EditPartidaForm.tsx',
      'src/components/Cards/PaymentCard.tsx',
      'src/components/Cards/TransactionCardWithDocuments.tsx',
      'src/components/transactions/AddTransactionMenu.tsx',
      'src/components/invoices/InvoiceIntakeDialog.tsx',
      'src/components/providers/ProviderFormDialog.tsx',
      'src/components/modals/add-payment-modal.tsx',
      'src/components/modals/add-partida-modal.tsx',
      'src/components/modals/edit-payment-modal.tsx',
      'src/components/modals/ingresos-modal.tsx',
      'src/components/modals/upload-project-transactions-modal.tsx',
      'src/components/modals/see-transactions-details-modal.tsx',
      'src/components/modals/aggregated-details-modal.tsx',
      'src/pages/Bitacora/BitacoraPage.tsx',
      'src/components/Bitacora/BitacoraCalendarView.tsx',
      'src/components/Bitacora/BitacoraGalleryModal.tsx',
      'src/components/Bitacora/BitacoraModal.tsx',
    ],
    plugins: { shadcn },
    rules: {
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-arbitrary-values': ['error', { allow: ['layout'] }],
      'shadcn/no-restyle': ['error', { allow: ['layout'] }],
      'no-restricted-syntax': ['error',
        { selector: "JSXOpeningElement[name.name='button']", message: 'Usa Button del design system.' },
        { selector: "JSXSelfClosingElement[name.name='button']", message: 'Usa Button del design system.' },
        { selector: "JSXOpeningElement[name.name=/^(Button|Badge)$/] > JSXAttribute[name.name='className']", message: 'Usa una variante del design system en lugar de className.' },
        { selector: "JSXSelfClosingElement[name.name=/^(Button|Badge)$/] > JSXAttribute[name.name='className']", message: 'Usa una variante del design system en lugar de className.' },
      ],
    },
  },
  {
    files: [
      'src/pages/Bitacora/BitacoraPage.tsx',
      'src/components/Bitacora/BitacoraCalendarView.tsx',
    ],
    rules: { 'shadcn/no-arbitrary-values': 'error' },
  },
)
