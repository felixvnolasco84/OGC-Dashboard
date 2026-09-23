import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  DEFAULT_PROJECT_LOCATIONS,
  validateProjectLocationName,
  type ProjectLocationOption,
} from "../src/lib/project-locations";
import { getCurrentUserOrThrow, hasAdminAccess } from "./permissions";

type CatalogCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function getProjectLocationOptions(
  ctx: CatalogCtx,
): Promise<ProjectLocationOption[]> {
  const records = await ctx.db.query("project_locations").collect();
  const overrides = new Map(
    records
      .filter((record) => record.default_key)
      .map((record) => [record.default_key!, record]),
  );

  const defaults = DEFAULT_PROJECT_LOCATIONS.map((location) => ({
    ...location,
    name: overrides.get(location.key)?.name || location.name,
  }));
  const custom = records
    .filter((record) => !record.default_key)
    .map((record) => ({
      key: String(record._id),
      name: record.name,
      order: record.order,
    }));

  return [...defaults, ...custom].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"),
  );
}

export async function isValidProjectLocationKey(
  ctx: CatalogCtx,
  key: string,
) {
  const locations = await getProjectLocationOptions(ctx);
  return locations.some((location) => location.key === key);
}

async function assertAdmin(ctx: MutationCtx) {
  const user = await getCurrentUserOrThrow(ctx);
  if (!hasAdminAccess(user)) {
    throw new Error("Unauthorized: Admin access required");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => getProjectLocationOptions(ctx),
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const locations = await getProjectLocationOptions(ctx);
    const name = validateProjectLocationName(args.name, locations);
    const nextOrder = locations.reduce(
      (highest, location) => Math.max(highest, location.order),
      -1,
    ) + 1;

    const id = await ctx.db.insert("project_locations", {
      name,
      order: nextOrder,
    });

    return { key: String(id), name, order: nextOrder };
  },
});

export const rename = mutation({
  args: { key: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const locations = await getProjectLocationOptions(ctx);
    const current = locations.find((location) => location.key === args.key);
    if (!current) {
      throw new Error("La ubicación ya no existe");
    }

    const name = validateProjectLocationName(args.name, locations, args.key);
    const defaultLocation = DEFAULT_PROJECT_LOCATIONS.find(
      (location) => location.key === args.key,
    );

    if (defaultLocation) {
      const override = await ctx.db
        .query("project_locations")
        .withIndex("by_default_key", (q) => q.eq("default_key", args.key))
        .first();

      if (override) {
        await ctx.db.patch(override._id, { name });
      } else {
        await ctx.db.insert("project_locations", {
          name,
          order: defaultLocation.order,
          default_key: defaultLocation.key,
        });
      }
    } else {
      const id = ctx.db.normalizeId("project_locations", args.key);
      if (!id) {
        throw new Error("La ubicación ya no existe");
      }
      await ctx.db.patch(id, { name });
    }

    return { key: args.key, name, order: current.order };
  },
});
