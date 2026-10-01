import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const normalizeFolderName = (name: string) => name.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
export const documentTypeFolder = (type: string) => {
  const name = type.trim() || "Sin tipo";
  const key = normalizeFolderName(name);
  return key === "minuta" || key === "minutas"
    ? { key: "minutas", name: "Minutas" }
    : { key, name };
};

export async function findProjectDocumentRoot(ctx: QueryCtx | MutationCtx, proyecto: Id<"desarrollos">) {
  const folders = await ctx.db.query("document_folders")
    .withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).collect();
  return folders.find(folder => folder.system_kind === "project_root");
}

export async function ensureProjectDocumentRoot(ctx: MutationCtx, proyecto: Id<"desarrollos">) {
  const project = await ctx.db.get(proyecto);
  if (!project) throw new Error("Proyecto no encontrado.");
  const existing = await findProjectDocumentRoot(ctx, proyecto);
  if (existing) {
    if (existing.nombre !== project.nombre) {
      await ctx.db.patch(existing._id, { nombre: project.nombre, updated_at: Date.now() });
    }
    return existing._id;
  }
  return ctx.db.insert("document_folders", {
    nombre: project.nombre, proyecto, system_kind: "project_root", created_at: Date.now(),
  });
}

/** Folder ownership is determined by IDs throughout the ancestry, never by display names. */
export async function assertProjectFolder(ctx: QueryCtx | MutationCtx, folderId: Id<"document_folders">, proyecto: Id<"desarrollos">) {
  let id: Id<"document_folders"> | undefined = folderId;
  const visited = new Set<string>();
  let belongsToProject = false;
  while (id) {
    if (visited.has(id)) throw new Error("La jerarquía de carpetas contiene un ciclo.");
    visited.add(id);
    const folder: Doc<"document_folders"> | null = await ctx.db.get(id);
    if (!folder) throw new Error("Carpeta no encontrada.");
    if (folder.sales_proyecto || (folder.proyecto && folder.proyecto !== proyecto)) {
      throw new Error("La carpeta no pertenece al proyecto.");
    }
    belongsToProject ||= folder.proyecto === proyecto;
    id = folder.parent_folder_id;
  }
  if (!belongsToProject) throw new Error("La carpeta no pertenece al proyecto. Ejecuta la migración de carpetas heredadas.");
}

/** General/sales documents cannot introduce foreign content into an owned construction tree. */
export async function assertNonProjectFolder(ctx: QueryCtx | MutationCtx, folderId: Id<"document_folders">) {
  let id: Id<"document_folders"> | undefined = folderId;
  const visited = new Set<string>();
  while (id) {
    if (visited.has(id)) throw new Error("La jerarquía de carpetas contiene un ciclo.");
    visited.add(id);
    const folder: Doc<"document_folders"> | null = await ctx.db.get(id);
    if (!folder) throw new Error("Carpeta no encontrada.");
    if (folder.proyecto) throw new Error("La carpeta requiere un documento del mismo proyecto de obra.");
    id = folder.parent_folder_id;
  }
}

export async function resolveProjectDocumentFolder(ctx: MutationCtx, proyecto: Id<"desarrollos">, type: string, explicitFolderId?: Id<"document_folders">) {
  if (explicitFolderId) {
    await assertProjectFolder(ctx, explicitFolderId, proyecto);
    return { folder_id: explicitFolderId, folder_assignment: "manual" as const };
  }
  const rootId = await ensureProjectDocumentRoot(ctx, proyecto);
  const { key, name } = documentTypeFolder(type);
  const siblings = await ctx.db.query("document_folders")
    .withIndex("by_parent_folder", q => q.eq("parent_folder_id", rootId)).collect();
  const projectFolders = await ctx.db.query("document_folders")
    .withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).collect();
  const existing = projectFolders.find(folder => folder.type_key === key) || siblings.find(folder =>
    !folder.type_key && normalizeFolderName(folder.nombre) === key);
  let folderId = existing?._id;
  if (existing) {
    await assertProjectFolder(ctx, existing._id, proyecto);
    if (existing.proyecto !== proyecto || existing.type_key !== key || existing.system_kind !== "document_type") {
      await ctx.db.patch(existing._id, { proyecto, type_key: key, system_kind: "document_type" });
    }
  } else {
    folderId = await ctx.db.insert("document_folders", {
      nombre: name, proyecto, parent_folder_id: rootId,
      system_kind: "document_type", type_key: key, created_at: Date.now(),
    });
  }
  return { folder_id: folderId!, folder_assignment: "automatic" as const };
}
