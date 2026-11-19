# P14 · Biblioteca de Planos

Implementación del 18 de noviembre de 2026. Referencia: propuesta 14 de la auditoría aprobada del 17 de noviembre.

## Resultado

- Cabecera con un botón principal **Cargar** y las opciones **Cargar plano** / **Cargar carpeta**.
- Menú secundario contextual **Más acciones de la biblioteca de planos**, grupo **Seguimiento**, opción **Menciones de planos**.
- El acceso secundario conserva el contador real del proyecto, con nombre accesible para carga, cero y número completo; visualmente limita el badge a 9+.
- Áreas de 44 px para disparadores e items; no se duplican los tres botones antiguos en la cabecera.
- Seleccionar una modalidad abre el diálogo original después de cerrar el menú. Cancelar/cerrar devuelve foco al disparador; el estado vacío conserva sus llamadas contextuales.
- Se conserva canWrite y la protección de lectura. El lector mantiene menciones, sin modalidades de carga en el portal.
- El Sheet de menciones queda fuera del contenido desmontable del menú. Abrir «…» no marca novedades. Seleccionar explícitamente «Menciones de planos» conserva la lectura por lotes del proyecto, hasta 20.
- Cambiar de proyecto desmonta el centro anterior y detiene nuevos lotes de ese alcance. Los disparadores compact e iconOnly siguen siendo los predeterminados donde ya se usaban.

## Archivos propios

- `src/pages/Planos/PlanLibraryActions.tsx`: nuevo componente de las acciones de biblioteca.
- `src/pages/Planos/PlanosPage.tsx`: conexión de la cabecera y devolución de foco de los dos diálogos de carga.
- `src/pages/Planos/MentionNotificationCenter.tsx`: renderTrigger opcional, foco y reinicio por alcance. API predeterminada compatible.
- `src/pages/Planos/FolderPlanUploadDialog.tsx`: solo prop opcional onCloseAutoFocus reenviada a DialogContent. No cambia validación ni carga.
- `e2e/plan-library/`: montaje de PlanosPage real y centro global real con backend simulado, sin acceso a Convex.
- `scripts/test-plan-library-ui.mjs`: prueba de interacción y generación de evidencia.

## Validación

Pasaron:

- `npm run build` (TypeScript y Vite; aviso habitual de chunks mayores de 500 kB).
- `npx eslint src/pages/Planos/PlanLibraryActions.tsx src/pages/Planos/MentionNotificationCenter.tsx src/pages/Planos/PlanosPage.tsx src/pages/Planos/FolderPlanUploadDialog.tsx`.
- `node scripts/test-plan-library-ui.mjs`.
- `npm run test:performance-ui` (incluye contador/disparador global de menciones).
- `npm run test:loading-performance` (check existente de cierre de bundles offline; no es una medición aislada de P14).
- `git diff --check`.

La prueba de P14 corre a **1440 × 1000, 390 × 844 y 1024 × 1000**. Comprueba teclado (flechas, Enter, Escape), foco, ambos diálogos, cancelar/reabrir sin datos residuales, selección y descarte de archivos ficticios, revisión y disciplina obligatoria de carpeta, lector, pérdida de escritura con menú abierto, estado vacío, ubicación actual/PDF, drag-and-drop e initialEntries/rutas, conteo de proyecto/global, estado cero/cargando/9+, cambio de proyecto con menú/Sheet abierto y detención de lotes antiguos. Sin errores de página. Detalle automatizado: `resultado.json`.

Las 22 capturas nuevas están en `capturas/`; `index.html` permite compararlas por tamaño y superficie. No son las simulaciones de la auditoría: renderizan los componentes de producción con datos ficticios.

## Límites y concurrencia

No se subieron archivos reales, no se crearon carpetas/planos, no se publicaron comentarios ni menciones y no se cambiaron permisos. Solo se marcaron menciones ficticias dentro del stub. Las confirmaciones de carga y los reintentos de transferencias reales no se ejecutaron; se conservó su código existente.

La pestaña propia dirigida a la aplicación autenticada en localhost:5173 mostró una página en blanco durante esta sesión. La evidencia funcional procede del fixture local. No se intervino la sesión de autenticación.

El árbol es compartido. Durante el trabajo aparecieron cambios de otros chats en RFIs, Documentos, Proveedores y P15 (PlanViewerActions y la rama del visor en PlanosPage). No se revierten, no se sobrescriben ni se atribuyen a P14. Los resultados de build/checks corresponden al árbol disponible durante su ejecución. No se creó commit ni se hizo stage global.
