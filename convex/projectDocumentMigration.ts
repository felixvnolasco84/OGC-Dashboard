import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { documentTypeFolder, ensureProjectDocumentRoot, normalizeFolderName, resolveProjectDocumentFolder } from "./projectDocumentFolders";

type Run = Doc<"document_folder_migration_runs">;
const phases = ["folder_claims", "document_claims", "roots", "folders", "documents", "complete"];

export const startProjectDocumentMigration = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => ctx.db.insert("document_folder_migration_runs", {
    dry_run: args.dryRun, phase: phases[0], cursor: null,
    processed: 0, changed: 0, ambiguous: 0, created_at: Date.now(),
  }),
});

async function claimAncestors(ctx: MutationCtx, runId: Run["_id"], folderId: Id<"document_folders"> | undefined, owner: string, claimed: Set<string>) {
  const visited = new Set<string>();
  while (folderId) {
    if (visited.has(folderId) || visited.size >= 64) throw new Error("Ciclo o jerarquía excesiva en carpetas heredadas.");
    visited.add(folderId);
    const key = `${folderId}:${owner}`;
    if (claimed.has(key)) break;
    claimed.add(key);
    const folder = await ctx.db.get(folderId);
    if (!folder) break;
    const claim = await ctx.db.query("document_folder_migration_claims")
      .withIndex("by_run_folder", q => q.eq("run_id", runId).eq("folder_id", folderId!)).unique();
    if (!claim) {
      await ctx.db.insert("document_folder_migration_claims", { run_id: runId, folder_id: folderId, owners: [owner] });
    } else if (!claim.owners.includes(owner)) {
      await ctx.db.patch(claim._id, { owners: [...claim.owners, owner] });
    }
    folderId = folder.parent_folder_id;
  }
}

async function soleOwner(ctx: MutationCtx, run: Run, folder: Doc<"document_folders">) {
  const claim = await ctx.db.query("document_folder_migration_claims")
    .withIndex("by_run_folder", q => q.eq("run_id", run._id).eq("folder_id", folder._id)).unique();
  // An ancestor's declared ownership is also a constraint, even for empty descendants.
  const owners = new Set(claim?.owners || []);
  let ancestor: Doc<"document_folders"> | null = folder;
  const visited = new Set<string>();
  while (ancestor) {
    if (visited.has(ancestor._id)) return { ambiguous: true };
    visited.add(ancestor._id);
    if (ancestor.proyecto) owners.add(ancestor.proyecto);
    if (ancestor.sales_proyecto) owners.add("foreign");
    ancestor = ancestor.parent_folder_id ? await ctx.db.get(ancestor.parent_folder_id) : null;
  }
  if (owners.size !== 1 || owners.has("foreign")) return { ambiguous: owners.size > 1 };
  const projectId = [...owners][0] as Id<"desarrollos">;
  const project = await ctx.db.get(projectId);
  return project ? { proyecto: projectId, project, ambiguous: false } : { ambiguous: true };
}

/** Merge in separate bounded transactions; only remove a folder after verifying it is empty. */
async function mergePage(ctx: MutationCtx, run: Run) {
  const source = await ctx.db.get(run.merge_source!);
  if (!source) {
    await ctx.db.patch(run._id, { merge_source: undefined, merge_target: undefined, merge_phase: undefined, merge_cursor: undefined });
    return 0;
  }
  const target = await ctx.db.get(run.merge_target!);
  if (!target || target.proyecto !== source.proyecto) throw new Error("Destino de consolidación inválido.");
  if (run.merge_phase === "documents") {
    const page = await ctx.db.query("documentos").withIndex("by_folder", q => q.eq("folder_id", source._id))
      .paginate({ cursor: run.merge_cursor || null, numItems: 50 });
    for (const document of page.page) {
      if (document.proyecto !== target.proyecto || document.sales_proyecto) throw new Error("La carpeta cambió de propietario durante la migración.");
      await ctx.db.patch(document._id, { folder_id: target._id });
    }
    await ctx.db.patch(run._id, {
      merge_phase: page.isDone ? "children" : "documents", merge_cursor: page.isDone ? null : page.continueCursor,
    });
    return page.page.length;
  }
  const page = await ctx.db.query("document_folders")
    .withIndex("by_parent_folder", q => q.eq("parent_folder_id", source._id))
    .paginate({ cursor: run.merge_cursor || null, numItems: 50 });
  for (const child of page.page) {
    if ((child.proyecto && child.proyecto !== target.proyecto) || child.sales_proyecto) throw new Error("Carpeta compartida durante la consolidación.");
    await ctx.db.patch(child._id, { parent_folder_id: target._id, proyecto: target.proyecto });
  }
  if (!page.isDone) {
    await ctx.db.patch(run._id, { merge_cursor: page.continueCursor });
    return page.page.length;
  }
  const remainingDoc = await ctx.db.query("documentos").withIndex("by_folder", q => q.eq("folder_id", source._id)).first();
  const remainingChild = await ctx.db.query("document_folders").withIndex("by_parent_folder", q => q.eq("parent_folder_id", source._id)).first();
  if (remainingDoc || remainingChild) {
    await ctx.db.patch(run._id, { merge_phase: "documents", merge_cursor: null });
  } else {
    await ctx.db.delete(source._id);
    await ctx.db.patch(run._id, { merge_source: undefined, merge_target: undefined, merge_phase: undefined, merge_cursor: undefined });
  }
  return page.page.length + (remainingDoc || remainingChild ? 0 : 1);
}

export const stepProjectDocumentMigration = internalMutation({
  args: { runId: v.id("document_folder_migration_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Migración no encontrada.");
    if (run.phase === "complete") return { ...run, isDone: true, changes: [], issues: [] };
    if (run.merge_source && !run.dry_run) {
      const changed = await mergePage(ctx, run);
      await ctx.db.patch(run._id, { changed: run.changed + changed });
      return { ...await ctx.db.get(run._id), isDone: false, changes: ["Consolidación por lotes"], issues: [] };
    }
    const changes: string[] = [];
    const issues: string[] = [];
    const claimed = new Set<string>();
    let changed = 0;
    // Claim batches are deliberately small: ancestry may require multiple reads/writes per item.
    const documentsPhase = run.phase === "document_claims" || run.phase === "documents";
    const pagination = { cursor: run.cursor, numItems: run.phase === "folders" ? 1 : documentsPhase ? 25 : 10 };
    const page = documentsPhase
      ? await ctx.db.query("documentos").paginate(pagination)
      : await ctx.db.query("document_folders").paginate(pagination);
    for (const item of page.page) {
      if (documentsPhase) {
        const document = item as Doc<"documentos">;
        if (run.phase === "document_claims") {
          await claimAncestors(ctx, run._id, document.folder_id,
            document.proyecto && !document.sales_proyecto ? document.proyecto : "foreign", claimed);
        } else if (document.proyecto && !document.sales_proyecto && !document.folder_id) {
          changes.push(`Clasificar ${document._id} por tipo: ${document.type}`);
          if (!run.dry_run) await ctx.db.patch(document._id, await resolveProjectDocumentFolder(ctx, document.proyecto, document.type));
          changed++;
        }
        continue;
      }
      const folder = item as Doc<"document_folders">;
      if (run.phase === "folder_claims") {
        if (folder.proyecto || folder.sales_proyecto) await claimAncestors(ctx, run._id, folder._id,
          folder.proyecto && !folder.sales_proyecto ? folder.proyecto : "foreign", claimed);
        continue;
      }
      const owner = await soleOwner(ctx, run, folder);
      if (!owner.proyecto || !owner.project) {
        if (owner.ambiguous || /^minutas?\b/i.test(folder.nombre)) issues.push(`Sin propietario inequívoco: ${folder._id} (${folder.nombre})`);
        continue;
      }
      const isLegacyRoot = !folder.parent_folder_id && normalizeFolderName(folder.nombre) === normalizeFolderName(owner.project.nombre);
      const projectFolders = await ctx.db.query("document_folders")
        .withIndex("by_proyecto", q => q.eq("proyecto", owner.proyecto)).collect();
      let existingRoot = projectFolders.find(f => f.system_kind === "project_root");
      if (run.phase === "roots") {
        if (isLegacyRoot && !existingRoot) {
          changes.push(`Asociar raíz ${folder._id} al proyecto ${owner.proyecto}`);
          if (!run.dry_run) await ctx.db.patch(folder._id, { proyecto: owner.proyecto, system_kind: "project_root" });
          changed++;
        }
        continue;
      }
      if (folder.system_kind === "project_root") continue;
      // Simulate the root adoption from the previous diagnostic phase without changing user data.
      if (run.dry_run && !existingRoot) {
        const claims = await ctx.db.query("document_folder_migration_claims")
          .withIndex("by_run_folder", q => q.eq("run_id", run._id)).collect();
        for (const claim of claims) {
          if (claim.owners.length !== 1 || claim.owners[0] !== owner.proyecto) continue;
          const candidate = await ctx.db.get(claim.folder_id);
          if (candidate && !candidate.parent_folder_id && !candidate.sales_proyecto &&
              normalizeFolderName(candidate.nombre) === normalizeFolderName(owner.project.nombre)) {
            existingRoot = candidate;
            break;
          }
        }
      }
      if (existingRoot?._id === folder._id) continue;
      const rootId = run.dry_run ? existingRoot?._id : await ensureProjectDocumentRoot(ctx, owner.proyecto);
      const isMinutes = /^minutas?\b/i.test(folder.nombre) || folder.type_key === "minutas";
      const parentId = !folder.parent_folder_id || isMinutes ? rootId : folder.parent_folder_id;
      // Recover the stable key of legacy type folders, while keeping their documents' manual placement.
      const sample = parentId === rootId ? await ctx.db.query("documentos")
        .withIndex("by_folder", q => q.eq("folder_id", folder._id)).first() : null;
      const legacyType = sample && normalizeFolderName(sample.type) === normalizeFolderName(folder.nombre)
        ? documentTypeFolder(sample.type) : undefined;
      let targetId: Id<"document_folders"> | undefined;
      if (isLegacyRoot && rootId && rootId !== folder._id) targetId = rootId;
      if (isMinutes && rootId) {
        const siblings = await ctx.db.query("document_folders")
          .withIndex("by_parent_folder", q => q.eq("parent_folder_id", rootId)).collect();
        targetId = siblings.find(f => f._id !== folder._id && f.proyecto === owner.proyecto &&
          (f.type_key === "minutas" || normalizeFolderName(f.nombre) === "minutas"))?._id;
      }
      if (targetId) {
        changes.push(`Consolidar ${folder._id} en ${targetId}`);
        if (!run.dry_run) {
          await ctx.db.patch(folder._id, { proyecto: owner.proyecto });
          await ctx.db.patch(run._id, { merge_source: folder._id, merge_target: targetId, merge_phase: "documents", merge_cursor: null });
        }
        changed++;
      } else {
        const patch = {
          proyecto: owner.proyecto,
          ...(parentId ? { parent_folder_id: parentId } : {}),
          ...(legacyType && !folder.type_key ? { system_kind: "document_type" as const, type_key: legacyType.key } : {}),
          ...(isMinutes ? { nombre: "Minutas", system_kind: "document_type" as const, type_key: "minutas" } : {}),
        };
        if (Object.entries(patch).some(([key, value]) => folder[key as keyof typeof folder] !== value) || (!rootId && !folder.parent_folder_id)) {
          changes.push(`Reubicar/asociar ${folder._id} (${folder.nombre}) en ${owner.project.nombre}${isMinutes ? " / Minutas" : ""}`);
          if (!run.dry_run) await ctx.db.patch(folder._id, patch);
          changed++;
        }
      }
    }
    const phase = page.isDone ? phases[phases.indexOf(run.phase) + 1] : run.phase;
    await ctx.db.patch(run._id, {
      phase, cursor: page.isDone ? null : page.continueCursor,
      processed: run.processed + page.page.length, changed: run.changed + changed,
      ambiguous: run.ambiguous + issues.length,
    });
    return { ...await ctx.db.get(run._id), isDone: phase === "complete", changes, issues };
  },
});

// One CLI request advances several bounded transactions, without enlarging any database batch.
export const advanceProjectDocumentMigration = internalAction({
  args: { runId: v.id("document_folder_migration_runs") },
  handler: async (ctx, args): Promise<{
    phase: string; processed: number; changed: number; isDone: boolean; changes: string[]; issues: string[];
  }> => {
    const changes: string[] = [];
    const issues: string[] = [];
    let last = { phase: "", processed: 0, changed: 0, isDone: false };
    for (let i = 0; i < 25; i++) {
      const page = await ctx.runMutation(internal.projectDocumentMigration.stepProjectDocumentMigration, args);
      changes.push(...page.changes);
      issues.push(...page.issues);
      last = { phase: page.phase!, processed: page.processed!, changed: page.changed!, isDone: page.isDone };
      if (page.isDone) break;
    }
    return { ...last, changes, issues };
  },
});
