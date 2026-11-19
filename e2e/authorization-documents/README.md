# P20 · Acciones documentales de Autorizaciones

Fixture independiente de los tres tabs reales. El alias de `convex/react` devuelve datos ficticios y registra consultas/mutaciones. Las cargas se resuelven en memoria; `fetch` rechaza cualquier otro destino. No usa Convex, credenciales ni archivos reales.

```sh
node scripts/test-authorization-documents-ui.mjs
```

La prueba inicia su propio Vite en `127.0.0.1:4321`, usa Chromium y guarda capturas/resultados en `outputs/P20-implementacion-2026-11-19`. Comprueba 1440×1000 y 390×844, capacidades según archivo/rol, historial, teclado/foco, apertura del selector nativo, selección vacía, carga y callbacks de destino. Las selecciones y borrados se ejecutan sólo contra el stub; no elimina entidades para simular quitar un archivo.

Para inspección manual:

```sh
npx vite --config e2e/authorization-documents/vite.config.ts
```

Abrir `http://127.0.0.1:4320/e2e/authorization-documents/preview.html?tab=permisos`.

- `tab=permisos|contratos|imss`: tab real que se monta.
- `readonly`: usuario lector, sin acciones de escritura.
- `empty`: documentos ausentes.
- `nohistory`: documentos presentes sin versiones anteriores.

El servidor de inspección no observa cambios: reiniciarlo después de editar. El fixture no sustituye la validación del almacenamiento/backend ni una sesión autenticada de producción. La cancelación automatizada corresponde a una selección de archivos vacía; no controla el diálogo del sistema operativo.

Capacidades conservadas: Permisos/plan/póliza y los contratos/SIROC de IMSS no tienen callback de borrado documental. Los trámites tampoco tienen historial en su celda actual. Esas opciones se omiten. Presupuesto/contrato de subcontratista y comprobante/soporte de pago conservan sus callbacks `remove…` de archivo. `useWorkAccess`/`useWorkMutation` mantienen la restricción de escritura a administradores.
