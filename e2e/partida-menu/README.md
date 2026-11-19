# P27 · Menú de partida

El fixture monta `PresupuestoTable`, el menú de cada nivel, `BudgetRecordSource`, `EditPartidaForm` y la revisión compartida de eliminación reales. Reutiliza los contextos ficticios de edición y eliminación; todas las consultas están sustituidas y el borrado está bloqueado. No requiere sesión ni acceso a Convex.

```powershell
node scripts/test-partida-menu-ui.mjs
# Inspección manual en http://127.0.0.1:4227/e2e/partida-menu/preview.html
node scripts/test-partida-menu-ui.mjs --serve
```

Con un servidor ya abierto, usar `--existing-server`. Reiniciar el servidor tras cambiar el fixture, porque su configuración desactiva HMR y observación de archivos.

La prueba verifica nombres accesibles y orden por nivel, permisos admin/finance/viewer/almacenista y usuario pendiente/nulo, guardas de proyecto e id temporal, consultas diferidas y su alcance, importes del contexto de pagos, carga, enlaces válidos, apertura y cancelación de origen/edición/borrado, teclado y límites del menú a 1440×1000 y 390×844.

Capturas y resultado: `outputs/implementacion-P27-2026-11-19/`. Las regresiones existentes se ejecutan con `npm run test:partida-deletion-ui`, `npm run test:partida-edit-ui`, `npm run test:partida-deletion` y `npm run test:partida-edit`.
