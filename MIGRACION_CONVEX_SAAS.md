# Migración masiva de Convex a Convex SaaS

## Decisión técnica

La migración debe hacerse con un **snapshot ZIP nativo de Convex**, no
reinsertando filas mediante mutations. Convex conserva `_id`, `_creationTime`,
referencias entre tablas y los IDs de `_storage` al importar un backup ZIP en
otro deployment. Así se mantienen intactas las relaciones y los archivos.

Después de importar el snapshot, `massMigration:start` prepara los datos por
lotes para el tenant de destino. La función es reanudable, usa cursores y no
hace `collect()` sobre las tablas de negocio.

Documentación oficial:

- [Exportación de Convex](https://docs.convex.dev/cli/reference/export)
- [Importación de snapshots](https://docs.convex.dev/database/import-export/import)
- [Configuración de la carpeta de funciones](https://docs.convex.dev/production/project-configuration)

El archivo `convex.json` de este repositorio apunta ahora a `convex-SAAS/`.
Por tanto, `npx convex dev`, `codegen` y `deploy` operan sobre el backend SaaS.
Para leer o exportar el deployment anterior se debe indicar siempre
`--deployment` de forma explícita.

## Trazabilidad de usuarios

No es necesario crear todos los usuarios en la nueva instancia de Clerk antes
de migrar.

Cada registro importado de `users` continúa siendo el actor histórico al que
apuntan requisiciones, tareas, comentarios, auditorías y demás relaciones. La
preparación:

1. conserva el `clerkId` anterior en `legacy_clerk_id`;
2. sustituye el `clerkId` operativo por `legacy:<sourceKey>:<userId>`;
3. crea una membresía `pending` dentro del tenant;
4. registra la evidencia en `legacy_identity_claims`.

Cuando llega un login o webhook firmado de Clerk, el sistema sólo reclama el
actor si encuentra **una coincidencia única de email dentro de esa
organización**. Nunca enlaza por un email global.

Estados relevantes:

| Estado | Significado |
| --- | --- |
| `legacy_unclaimed` | Actor histórico preservado, todavía sin identidad nueva. |
| `active` | La identidad nueva reclamó el mismo actor; todos sus FKs históricos siguen intactos. |
| `legacy_linked` | Ya existía un usuario global activo; el ledger lo enlaza al actor histórico sin reescribir auditorías. |
| `conflict` | Hay duplicidad o ambigüedad; no se concede el alcance histórico automáticamente. |
| `provisional` | Perfil temporal creado por `user.created` antes de conocer la organización. |

## Requisitos previos

- Crear un deployment Convex nuevo y vacío para el SaaS. No usar un deployment
  que ya tenga datos de negocio.
- Habilitar Clerk Organizations. Para un SaaS B2B, usar `Membership required`.
- Crear la organización destino y guardar su ID `org_...`.
- Configurar en el deployment destino `CLERK_SECRET_KEY`,
  `CLERK_WEBHOOK_SIGNING_SECRET` y `TENANT_MIGRATION_KEY`.
- Registrar el endpoint `https://<deployment>.convex.site/clerk/webhook` para
  `user.*`, `organizationMembership.*` y `organization.deleted`.
- El JWT de Clerk usado por Convex debe incluir el `org_id` activo.
- Preparar una ventana de sólo lectura. El snapshot es consistente, pero no
  captura escrituras que ocurran después de exportarlo.

El secreto de migración debe ser aleatorio, temporal y diferente de cualquier
clave de Clerk o Convex. Eliminarlo al terminar.

## Runbook

### 1. Variables locales

En PowerShell:

```powershell
$sourceDeployment = "equipo:proyecto-anterior:prod"
$targetDeployment = "equipo:proyecto-saas:prod"
$targetOrganizationId = "org_REEMPLAZAR"
$sourceKey = "ogc-legacy-2026-08"
$backup = ".migration\ogc-legacy-2026-08.zip"
New-Item -ItemType Directory -Force .migration
```

Cargar el secreto temporal sin escribir su valor en el historial:

```powershell
$migrationKey = Read-Host "TENANT_MIGRATION_KEY"
$migrationKey | npx.cmd convex env set TENANT_MIGRATION_KEY --deployment $targetDeployment
```

`sourceKey` debe ser estable, único y contener sólo letras, números, punto,
guion o guion bajo. Es parte de la llave de idempotencia.

### 2. Verificar y desplegar el backend SaaS

Crear un archivo local ignorado `.env.saas.production` con el deploy key del
proyecto SaaS:

```dotenv
CONVEX_DEPLOY_KEY=prod:REEMPLAZAR
```

Después:

```powershell
npm.cmd run typecheck:convex-saas
npx.cmd convex deploy --env-file .env.saas.production --typecheck enable
```

### 3. Congelar escrituras y exportar el origen

Poner la aplicación anterior en mantenimiento o sólo lectura antes del export.

```powershell
npx.cmd convex export --deployment $sourceDeployment --include-file-storage --path $backup
Get-FileHash -Algorithm SHA256 $backup
```

Guardar el hash junto al ticket o bitácora de migración. No modificar el ZIP:
Convex no documenta transformaciones manuales de snapshots.

Opcionalmente, inventariar los conteos del ZIP:

```powershell
$inspect = ".migration\inspect-source"
Expand-Archive -LiteralPath $backup -DestinationPath $inspect
Get-ChildItem $inspect -Recurse -Filter documents.jsonl | ForEach-Object {
  [pscustomobject]@{
    Table = Split-Path $_.DirectoryName -Leaf
    Rows = (Get-Content -LiteralPath $_.FullName | Measure-Object -Line).Lines
  }
} | Sort-Object Table
```

### 4. Importar en el destino vacío

```powershell
npx.cmd convex import --deployment $targetDeployment $backup
```

No usar `--replace` en un destino con datos. El import ZIP sólo toca las tablas
incluidas en el snapshot; las tablas SaaS nuevas permanecen vacías.

### 5. Preparar el tenant e identidades

Leer el secreto sin dejarlo en el historial de PowerShell:

```powershell
$migrationKey = Read-Host "TENANT_MIGRATION_KEY"
$startArgs = @{
  migrationKey = $migrationKey
  sourceKey = $sourceKey
  targetOrganizationId = $targetOrganizationId
  legacyOrganizationIds = @()
  includeUnscoped = $true
} | ConvertTo-Json -Compress

npx.cmd convex run --deployment $targetDeployment massMigration:start $startArgs
```

Usar `legacyOrganizationIds` si los documentos antiguos ya contienen IDs de
organización que deban mapearse al nuevo `org_...`. `includeUnscoped = $true`
asigna los datos sin organización; sólo una migración puede reclamar esos
datos.

El comando devuelve `runId`. Consultar el progreso:

```powershell
$runId = "REEMPLAZAR"
$statusArgs = @{
  migrationKey = $migrationKey
  runId = $runId
} | ConvertTo-Json -Compress

npx.cmd convex run --deployment $targetDeployment massMigration:getStatus $statusArgs
```

Si una función programada falla por un error transitorio, reanudar exactamente
desde el checkpoint:

```powershell
npx.cmd convex run --deployment $targetDeployment massMigration:resume $statusArgs
```

El resultado final debe ser `ready` o `needs_attention`.

### 6. Resolver identidades ambiguas

Listar conflictos:

```powershell
$conflictArgs = @{
  migrationKey = $migrationKey
  runId = $runId
  paginationOpts = @{ numItems = 50; cursor = $null }
} | ConvertTo-Json -Depth 4 -Compress

npx.cmd convex run --deployment $targetDeployment massMigration:listIdentityConflicts $conflictArgs
```

Para resolver uno, el usuario objetivo ya debe existir en la **nueva** instancia
de Clerk y ser miembro de la organización destino. La action consulta Clerk y
comprueba usuario, membresía y email primario antes de escribir:

```powershell
$resolveArgs = @{
  migrationKey = $migrationKey
  runId = $runId
  sourceUserId = "ID_ORIGEN_MOSTRADO_EN_EL_CONFLICTO"
  targetClerkUserId = "user_REEMPLAZAR"
  confirmEmail = "persona@empresa.com"
} | ConvertTo-Json -Compress

npx.cmd convex run --deployment $targetDeployment massMigration:resolveIdentityConflict $resolveArgs
```

Cuando ya no queden conflictos:

```powershell
npx.cmd convex run --deployment $targetDeployment massMigration:finalizeIdentityResolution $statusArgs
```

Las identidades `pending` sin conflicto no bloquean el corte: podrán reclamarse
meses después cuando el usuario sea invitado y entre al tenant.

### 7. Validación y corte

Antes de cambiar `VITE_CONVEX_URL`:

- `massMigration:getStatus` debe devolver `status: "ready"` y
  `phase: "complete"`.
- Revisar `skipped`. Debe ser cero cuando todo el snapshot pertenece a un solo
  tenant; si no lo es, cada documento omitido debe corresponder a otro tenant
  previsto en el manifiesto de migración.
- Exportar nuevamente el destino y comparar los conteos de todas las tablas
  originales y `_storage` contra el inventario de origen. Las tablas nuevas
  `organization_memberships`, `legacy_identity_claims` y
  `data_migration_runs` tendrán filas adicionales.
- Probar con un administrador del tenant: proyectos, ventas, documentos,
  imágenes, requisiciones, tareas, bitácora y reportes.
- Verificar un usuario reclamado y uno todavía pendiente.
- Confirmar que un usuario de otro tenant no puede leer proyectos ni usuarios
  del tenant migrado.
- Generar un backup del destino ya validado.

Después, actualizar `VITE_CONVEX_URL`/deploy del frontend al destino y retirar
`TENANT_MIGRATION_KEY`:

```powershell
npx.cmd convex env remove TENANT_MIGRATION_KEY --deployment $targetDeployment
```

## Rollback

- Antes del corte: descartar o recrear el deployment destino y repetir desde el
  ZIP. El origen no se modifica.
- Después del corte y antes de nuevas escrituras: volver el frontend al origen.
- Si ya hubo escrituras en el SaaS, no hacer rollback ciego; congelar ambos
  lados y reconciliar el delta para no perder datos.

Conservar el origen en sólo lectura y el ZIP con su hash durante el periodo de
aceptación acordado.
