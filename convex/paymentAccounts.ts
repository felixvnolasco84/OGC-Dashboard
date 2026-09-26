import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  assertCanWrite, assertInvoiceReviewer, checkDesarrolloAccess,
  getCurrentUserOrThrow, hasInvoiceReviewAccess,
} from "./permissions";
import {
  accountIdentity, accountMatchesSnapshot, accountsConflict, isValidAccount, isValidClabe, maskAccount,
  normalizeAccountNumber, normalizeBank, normalizePaymentMethod, paymentScopeKey,
} from "./paymentAccountRules";

type AccountInput = {
  banco: string;
  numero_cuenta?: string;
  clabe?: string;
  alias?: string;
};

async function projectScope(ctx: QueryCtx | MutationCtx, projectId: Id<"desarrollos">) {
  if (!(await checkDesarrolloAccess(ctx, projectId))) throw new Error("Sin acceso al proyecto.");
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Proyecto no encontrado.");
  return paymentScopeKey(project);
}

function cleanAccount(input: AccountInput) {
  const banco = input.banco.trim().replace(/\s+/g, " ");
  const numero_cuenta = normalizeAccountNumber(input.numero_cuenta) || undefined;
  const clabe = normalizeAccountNumber(input.clabe) || undefined;
  if (!banco || (numero_cuenta && !isValidAccount(numero_cuenta)) ||
    (clabe && !isValidClabe(clabe)) || (!numero_cuenta && !clabe)) {
    throw new Error("Indica banco y una cuenta completa o una CLABE de 18 dígitos.");
  }
  const identity_key = accountIdentity(banco, numero_cuenta, clabe);
  if (!identity_key) throw new Error("Los datos bancarios no son válidos.");
  return { banco, numero_cuenta, clabe, identity_key, alias: input.alias?.trim() || `${banco} ${maskAccount(numero_cuenta || clabe)}` };
}

async function assertActiveProvider(ctx: MutationCtx, providerId: Id<"proveedores">) {
  const provider = await ctx.db.get(providerId);
  if (!provider || provider.archived_at || provider.merged_into) throw new Error("Proveedor no disponible.");
  return provider;
}

export async function resolveAccountForTransaction(
  ctx: MutationCtx,
  args: { projectId: Id<"desarrollos">; providerId?: Id<"proveedores">; method: string; accountId: Id<"payment_accounts"> },
) {
  if (!args.providerId || !normalizePaymentMethod(args.method)) {
    throw new Error("Selecciona un proveedor y transferencia o cheque para usar una cuenta guardada.");
  }
  const scope = await projectScope(ctx, args.projectId);
  const account = await ctx.db.get(args.accountId);
  if (!account || account.status !== "active" || account.scope_key !== scope || account.provider_id !== args.providerId) {
    throw new Error("La cuenta guardada ya no está disponible para este proveedor.");
  }
  return account;
}

export async function upsertPaymentAccount(
  ctx: MutationCtx,
  args: { scopeKey: string; providerId: Id<"proveedores">; input: AccountInput;
    source: "manual" | "transaction" | "provider"; createdBy?: Id<"users"> },
): Promise<{ status: "created" | "existing" | "conflict" | "archived"; accountId: Id<"payment_accounts"> }> {
  const cleaned = cleanAccount(args.input);
  const accounts = await ctx.db.query("payment_accounts")
    .withIndex("by_scope_provider", q => q.eq("scope_key", args.scopeKey).eq("provider_id", args.providerId)).collect();
  const existing = accounts.find(account => account.identity_key === cleaned.identity_key ||
    Boolean(account.clabe && cleaned.clabe && account.clabe === cleaned.clabe &&
      normalizeBank(account.banco) === normalizeBank(cleaned.banco)));
  if (existing) {
    if (accountsConflict(existing, cleaned)) {
      if (existing.status === "active") await ctx.db.patch(existing._id, { status: "pending_review", updated_at: Date.now() });
      return { status: "conflict", accountId: existing._id };
    }
    if (existing.status === "archived") return { status: "archived", accountId: existing._id };
    if (existing.status === "pending_review") return { status: "conflict", accountId: existing._id };
    if (!existing.numero_cuenta && cleaned.numero_cuenta) {
      const duplicate = accounts.find(account => account._id !== existing._id &&
        account.status !== "archived" && account.identity_key === cleaned.identity_key);
      if (duplicate) {
        if (existing.status === "active") await ctx.db.patch(existing._id, { status: "pending_review", updated_at: Date.now() });
        return { status: "conflict", accountId: existing._id };
      }
      await ctx.db.patch(existing._id, {
        numero_cuenta: cleaned.numero_cuenta, identity_key: cleaned.identity_key,
        clabe: existing.clabe || cleaned.clabe, updated_at: Date.now(),
      });
    } else if (!existing.clabe && cleaned.clabe) {
      await ctx.db.patch(existing._id, { clabe: cleaned.clabe, updated_at: Date.now() });
    }
    return { status: "existing", accountId: existing._id };
  }
  const accountId = await ctx.db.insert("payment_accounts", {
    scope_key: args.scopeKey, provider_id: args.providerId, ...cleaned,
    status: "active", source: args.source, created_by: args.createdBy,
    created_at: Date.now(), updated_at: Date.now(),
  });
  return { status: "created", accountId };
}

export async function queuePaymentAccountCandidate(
  ctx: MutationCtx,
  args: { scopeKey: string; sourceKey: string; providerId?: Id<"proveedores">;
    sourceTransactionId?: Id<"transacciones">; banco?: string; numeroCuenta?: string;
    clabe?: string; reason: string },
) {
  const existing = await ctx.db.query("payment_account_candidates")
    .withIndex("by_source_key", q => q.eq("source_key", args.sourceKey)).first();
  if (existing) return false;
  await ctx.db.insert("payment_account_candidates", {
    scope_key: args.scopeKey, source_key: args.sourceKey, provider_id: args.providerId,
    source_transaction_id: args.sourceTransactionId, banco: args.banco,
    numero_cuenta: args.numeroCuenta, clabe: args.clabe, reason: args.reason,
    status: "pending", created_at: Date.now(), updated_at: Date.now(),
  });
  return true;
}

const accountFields = {
  projectId: v.id("desarrollos"),
  providerId: v.id("proveedores"),
  banco: v.string(),
  numeroCuenta: v.optional(v.string()),
  clabe: v.optional(v.string()),
  alias: v.optional(v.string()),
};

export const listForProvider = query({
  args: { projectId: v.id("desarrollos"), providerId: v.id("proveedores") },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const scope = await projectScope(ctx, args.projectId);
    const accounts = await ctx.db.query("payment_accounts")
      .withIndex("by_scope_provider", q => q.eq("scope_key", scope).eq("provider_id", args.providerId)).collect();
    return accounts.filter(account => account.status === "active").map(account => ({
      _id: account._id, alias: account.alias, banco: account.banco,
      account_mask: maskAccount(account.numero_cuenta), clabe_mask: maskAccount(account.clabe),
    }));
  },
});

export const permissions = query({
  args: { projectId: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await projectScope(ctx, args.projectId);
    return { canWrite: user.role !== "viewer", canReview: hasInvoiceReviewAccess(user) };
  },
});

export const create = mutation({
  args: accountFields,
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const scope = await projectScope(ctx, args.projectId);
    await assertActiveProvider(ctx, args.providerId);
    const result = await upsertPaymentAccount(ctx, {
      scopeKey: scope, providerId: args.providerId, input: {
        banco: args.banco, numero_cuenta: args.numeroCuenta, clabe: args.clabe, alias: args.alias,
      }, source: "manual", createdBy: user._id,
    });
    if (result.status === "conflict" || result.status === "archived") {
      throw new Error("La cuenta coincide con un registro que requiere revisión.");
    }
    return result.accountId;
  },
});

export const listManagement = query({
  args: { projectId: v.id("desarrollos"), providerId: v.optional(v.id("proveedores")) },
  handler: async (ctx, args) => {
    await assertInvoiceReviewer(ctx);
    const scope = await projectScope(ctx, args.projectId);
    const accounts = args.providerId
      ? await ctx.db.query("payment_accounts").withIndex("by_scope_provider", q =>
        q.eq("scope_key", scope).eq("provider_id", args.providerId!)).collect()
      : [];
    const candidates = await ctx.db.query("payment_account_candidates")
      .withIndex("by_scope_status", q => q.eq("scope_key", scope).eq("status", "pending")).take(100);
    return { accounts, candidates };
  },
});

export const update = mutation({
  args: { id: v.id("payment_accounts"), ...accountFields },
  handler: async (ctx, args) => {
    await assertInvoiceReviewer(ctx);
    const scope = await projectScope(ctx, args.projectId);
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.scope_key !== scope || existing.provider_id !== args.providerId) throw new Error("Cuenta no encontrada.");
    const cleaned = cleanAccount({ banco: args.banco, numero_cuenta: args.numeroCuenta, clabe: args.clabe, alias: args.alias });
    const peers = await ctx.db.query("payment_accounts")
      .withIndex("by_scope_provider", q => q.eq("scope_key", scope).eq("provider_id", args.providerId)).collect();
    if (peers.some(account => account._id !== existing._id && account.status !== "archived" &&
      (account.identity_key === cleaned.identity_key ||
        Boolean(account.clabe && cleaned.clabe && account.clabe === cleaned.clabe &&
          normalizeBank(account.banco) === normalizeBank(cleaned.banco)) ||
        accountsConflict(account, cleaned)))) {
      throw new Error("Ya existe otra cuenta coincidente o contradictoria.");
    }
    await ctx.db.patch(existing._id, { ...cleaned, status: "active", updated_at: Date.now() });
    return existing._id;
  },
});

export const archive = mutation({
  args: { projectId: v.id("desarrollos"), id: v.id("payment_accounts") },
  handler: async (ctx, args) => {
    await assertInvoiceReviewer(ctx);
    const scope = await projectScope(ctx, args.projectId);
    const account = await ctx.db.get(args.id);
    if (!account || account.scope_key !== scope) throw new Error("Cuenta no encontrada.");
    await ctx.db.patch(account._id, { status: "archived", updated_at: Date.now() });
  },
});

export const resolveCandidate = mutation({
  args: { projectId: v.id("desarrollos"), id: v.id("payment_account_candidates"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    providerId: v.optional(v.id("proveedores")), banco: v.optional(v.string()),
    numeroCuenta: v.optional(v.string()), clabe: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertInvoiceReviewer(ctx);
    const scope = await projectScope(ctx, args.projectId);
    const candidate = await ctx.db.get(args.id);
    if (!candidate || candidate.scope_key !== scope || candidate.status !== "pending") throw new Error("Registro pendiente no encontrado.");
    if (args.decision === "reject") {
      await ctx.db.patch(candidate._id, { status: "rejected", updated_at: Date.now() });
      return null;
    }
    const providerId = args.providerId || candidate.provider_id;
    if (!providerId) throw new Error("Selecciona un proveedor para aprobar la cuenta.");
    await assertActiveProvider(ctx, providerId);
    const cleaned = cleanAccount({ banco: args.banco || candidate.banco || "",
      numero_cuenta: args.numeroCuenta ?? candidate.numero_cuenta,
      clabe: args.clabe ?? candidate.clabe });
    const peers = await ctx.db.query("payment_accounts")
      .withIndex("by_scope_provider", q => q.eq("scope_key", scope).eq("provider_id", providerId)).collect();
    const existing = peers.find(account => account.identity_key === cleaned.identity_key);
    if (peers.some(account => account._id !== existing?._id && account.status !== "archived" &&
      (accountsConflict(account, cleaned) ||
        Boolean(account.clabe && cleaned.clabe && account.clabe === cleaned.clabe &&
          normalizeBank(account.banco) === normalizeBank(cleaned.banco))))) {
      throw new Error("La cuenta sigue en conflicto. Corrige los datos antes de aprobar.");
    }
    let accountId: Id<"payment_accounts">;
    if (existing && existing.status === "pending_review") {
      await ctx.db.patch(existing._id, { ...cleaned, status: "active", updated_at: Date.now() });
      accountId = existing._id;
    } else {
      const result = await upsertPaymentAccount(ctx, {
        scopeKey: scope, providerId, input: cleaned, source: "transaction",
      });
      if (result.status === "conflict" || result.status === "archived") throw new Error("La cuenta sigue en conflicto. Corrige los datos antes de aprobar.");
      accountId = result.accountId;
    }
    await ctx.db.patch(candidate._id, { status: "resolved", resolved_account_id: accountId, updated_at: Date.now() });
    if (candidate.source_transaction_id) {
      const transaction = await ctx.db.get(candidate.source_transaction_id);
      const account = await ctx.db.get(accountId);
      const sourceProject = transaction ? await ctx.db.get(transaction.proyecto) : null;
      if (transaction && account && transaction.proveedor_id === providerId &&
        sourceProject && paymentScopeKey(sourceProject) === scope &&
        accountMatchesSnapshot(account, transaction) && !transaction.payment_account_id) {
        await ctx.db.patch(transaction._id, { payment_account_id: accountId });
      }
    }
    return accountId;
  },
});

export type PaymentAccountDoc = Doc<"payment_accounts">;
