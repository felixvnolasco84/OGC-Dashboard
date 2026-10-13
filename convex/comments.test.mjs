import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  addPhotoComment,
  editPhotoComment,
  deletePhotoComment,
  getPhotoComments,
  getPhotoCommentContext,
} from "./bitacora";
import {
  addComentario,
  updateComentario,
  deleteComentario,
  getComentarioContext,
} from "./programa_obra";

// Execute the real handlers and trigger wrapper against transactional, isolated data.
function fixture(role = "user") {
  let tables = {
    users: [
      {
        _id: "actor",
        clerkId: "session",
        role,
        name: "Ana",
        email: "ana@example.test",
        organization_id: "org",
        allowed_desarrollos: ["project"],
      },
    ],
    desarrollos: [
      { _id: "project", organization_id: "org" },
      { _id: "other-project", organization_id: "other" },
    ],
    bitacora: [
      {
        _id: "log",
        proyecto: "project",
        comentarios: "Incidencia original",
        revision: 4,
      },
    ],
    documentos: [
      {
        _id: "photo",
        proyecto: "project",
        bitacora_id: "log",
        type: "bitacora_foto",
        descripcion: "Descripción original",
      },
      {
        _id: "photo2",
        proyecto: "project",
        bitacora_id: "log",
        type: "bitacora_foto",
      },
    ],
    photo_comments: [
      {
        _id: "photo-comment",
        photo_id: "photo",
        user_id: "actor",
        user_name: "Ana",
        comment: "Original",
        created_at: 1,
      },
      {
        _id: "other-comment",
        photo_id: "photo",
        user_id: "other-author",
        user_name: "Luis",
        comment: "Otro autor",
        created_at: 2,
      },
    ],
    programa_obra: [
      {
        _id: "schedule",
        proyecto: "project",
        partida_id: "budget",
        fecha_inicio: "01/10/2026",
        fecha_fin: "31/10/2026",
        peso: 20,
      },
      { _id: "schedule2", proyecto: "project", partida_id: "budget2" },
    ],
    programa_obra_detalle: [
      {
        _id: "family",
        proyecto: "project",
        programa_obra_id: "schedule",
        nivel: 2,
        avance_porcentaje: 35,
      },
    ],
    programa_obra_comentarios: [
      {
        _id: "program-comment",
        proyecto: "project",
        parent_type: "partida",
        parent_id: "schedule",
        comentario: "Original",
        fecha_inicio: "01/10/2026",
        fecha_fin: "02/10/2026",
        created_by_id: "other-author",
        created_at: 1,
      },
    ],
    comment_operation_receipts: [],
    pagos: [{ _id: "payment", monto: 200 }],
    programa_obra_config: [{ _id: "config", version: 2 }],
    programa_obra_events: [],
  };
  let sequence = 0;
  const list = (table) => (tables[table] ||= []);
  const get = (id) =>
    Object.values(tables)
      .flat()
      .find((row) => row._id === id);
  const writes = [];
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "session" }) },
    db: {
      normalizeId: (table, id) =>
        list(table).some((row) => row._id === id) ? id : null,
      get: async (id) => structuredClone(get(id) || null),
      query(table) {
        const predicates = [];
        const builder = {
          eq(key, value) {
            predicates.push((row) => row[key] === value);
            return builder;
          },
        };
        const query = {
          withIndex(_name, fn) {
            fn(builder);
            return query;
          },
          collect: async () =>
            structuredClone(
              list(table).filter((row) => predicates.every((fn) => fn(row))),
            ),
          first: async () => (await query.collect())[0] || null,
          unique: async () => (await query.collect())[0] || null,
        };
        return query;
      },
      insert: async (table, fields) => {
        const id = `${table}-${++sequence}`;
        writes.push(["insert", table]);
        list(table).push({
          _id: id,
          _creationTime: sequence,
          ...structuredClone(fields),
        });
        return id;
      },
      patch: async (id, fields) => {
        writes.push(["patch", id]);
        Object.assign(get(id), structuredClone(fields));
      },
      delete: async (id) => {
        writes.push(["delete", id]);
        for (const table of Object.keys(tables))
          tables[table] = list(table).filter((row) => row._id !== id);
      },
    },
  };
  const call = async (handler, args) => {
    const before = structuredClone(tables),
      count = writes.length;
    try {
      return await handler._handler(ctx, args);
    } catch (error) {
      tables = before;
      writes.splice(count);
      throw error;
    }
  };
  const photoArgs = (operationId = "photo-operation-1") => ({
    photoId: "photo",
    commentId: "photo-comment",
    expectedRevision: 1,
    operationId,
  });
  const programArgs = (operation_id = "program-operation-1") => ({
    proyecto: "project",
    parent_type: "partida",
    parent_id: "schedule",
    comentario_id: "program-comment",
    expected_revision: 1,
    operation_id,
  });
  const invariants = () =>
    structuredClone([
      get("log"),
      get("photo"),
      list("programa_obra"),
      list("programa_obra_detalle"),
      list("pagos"),
      list("programa_obra_config"),
      list("programa_obra_events"),
    ]);
  return { get, list, call, writes, photoArgs, programArgs, invariants };
}

describe("comments: permissions, reviewed persistence and retry receipts", () => {
  it("runs the existing Bitácora and report regression assertions with the bundler resolver", async () => {
    await import("../scripts/test-bitacora-rules.mjs");
    await import("../scripts/test-reporting-rules.mjs");
  });
  it("validates real API arguments and persists retries transactionally with the actual schema", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await t.run(async (ctx) => {
      const project = await ctx.db.insert("desarrollos", {
        nombre: "Proyecto",
        descripcion: "Prueba",
        image: "",
        organization_id: "org",
      });
      const actor = await ctx.db.insert("users", {
        clerkId: "session",
        role: "user",
        name: "Ana",
        email: "ana@example.test",
        organization_id: "org",
        allowed_desarrollos: [project],
        created_at: 1,
      });
      const budget = await ctx.db.insert("partidas", {
        nivel: 1,
        nombre: "Estructura",
        familia: "",
        sub_partida: "",
        unidad: "m2",
        cantidad: 1,
        precio_unitario: 100,
        presupuesto_original: 100,
        presupuesto_aprobado: 100,
        pagado: 0,
        archivo_origen: "fixture",
        proyecto: project,
      });
      const log = await ctx.db.insert("bitacora", {
        proyecto: project,
        categoria: "Estructura",
        partida_id: budget,
        familias_tags: [],
        responsable: "Ana",
        fecha: "13/10/2026",
        avance_dia: "Inspección",
        uploaded_at: 1,
      });
      const photo = await ctx.db.insert("documentos", {
        nombre: "Foto",
        descripcion: "Descripción",
        type: "bitacora_foto",
        proyecto: project,
        bitacora_id: log,
      });
      const schedule = await ctx.db.insert("programa_obra", {
        proyecto: project,
        partida_id: budget,
      });
      return { project, actor, photo, schedule };
    });
    const actor = t.withIdentity({ subject: "session" });
    const photoArgs = {
      photoId: ids.photo,
      comment: "Publicado",
      operationId: "api-photo-add-1",
    };
    const photoId = await actor.mutation(
      api.bitacora.addPhotoComment,
      photoArgs,
    );
    expect(await actor.mutation(api.bitacora.addPhotoComment, photoArgs)).toBe(
      photoId,
    );
    const programArgs = {
      proyecto: ids.project,
      parent_type: "partida",
      parent_id: ids.schedule,
      comentario: "Programa",
      fecha_inicio: "2026-10-13",
      fecha_fin: "2026-10-14",
      operation_id: "api-program-add-1",
    };
    const programId = await actor.mutation(
      api.programa_obra.addComentario,
      programArgs,
    );
    expect(
      await actor.mutation(api.programa_obra.addComentario, programArgs),
    ).toBe(programId);
    await expect(
      actor.mutation(api.bitacora.deletePhotoComment, { commentId: photoId }),
    ).rejects.toThrow();
    const deleteArgs = {
      commentId: photoId,
      photoId: ids.photo,
      expectedRevision: 1,
      operationId: "api-photo-delete-1",
    };
    await actor.mutation(api.bitacora.deletePhotoComment, deleteArgs);
    await actor.mutation(api.bitacora.deletePhotoComment, deleteArgs);
    expect(
      await t.run((ctx) => ctx.db.query("photo_comments").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("programa_obra_comentarios").collect()),
    ).toHaveLength(1);
    expect(
      await t.run((ctx) =>
        ctx.db.query("comment_operation_receipts").collect(),
      ),
    ).toHaveLength(3);
  });
  it.each(["admin", "user", "finance", "contratista"])(
    "allows photo publication for %s, trims and deduplicates retries",
    async (role) => {
      const f = fixture(role),
        before = f.invariants();
      const args = {
        photoId: "photo",
        comment: "  Publicado  ",
        operationId: "publish-photo-1",
      };
      const id = await f.call(addPhotoComment, args);
      expect(await f.call(addPhotoComment, args)).toBe(id);
      expect(f.get(id)).toMatchObject({
        comment: "Publicado",
        revision: 1,
        user_id: "actor",
      });
      expect(f.list("photo_comments")).toHaveLength(3);
      expect(f.invariants()).toEqual(before);
      expect(f.list("comment_operation_receipts")[0].fingerprint).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(
        JSON.stringify(f.list("comment_operation_receipts")),
      ).not.toContain("Publicado");
    },
  );
  it.each(["viewer", "almacenista", "unknown"])(
    "rejects photo creation for %s",
    async (role) => {
      const f = fixture(role);
      await expect(
        f.call(addPhotoComment, {
          photoId: "photo",
          comment: "Texto",
          operationId: "publish-photo-1",
        }),
      ).rejects.toThrow();
      expect(f.writes).toHaveLength(0);
    },
  );
  it("only allows photo author or role admin to edit/delete and exposes the same UI capability", async () => {
    const f = fixture(),
      before = f.invariants();
    expect(
      (await f.call(getPhotoComments, { photoId: "photo" })).map(
        (c) => c.can_manage,
      ),
    ).toEqual([true, false]);
    await expect(
      f.call(editPhotoComment, {
        ...f.photoArgs(),
        commentId: "other-comment",
        comment: "Propuesto",
      }),
    ).rejects.toThrow(/autor/);
    await expect(
      f.call(deletePhotoComment, {
        ...f.photoArgs(),
        commentId: "other-comment",
      }),
    ).rejects.toThrow(/autor/);
    await f.call(editPhotoComment, { ...f.photoArgs(), comment: "Propuesto" });
    expect(f.get("photo-comment")).toMatchObject({
      comment: "Propuesto",
      revision: 2,
    });
    expect(f.invariants()).toEqual(before);
    f.get("actor").role = "admin";
    await f.call(deletePhotoComment, {
      ...f.photoArgs("admin-delete-1"),
      commentId: "other-comment",
    });
    expect(f.get("other-comment")).toBeUndefined();
  });
  it("rejects stale photo edit/delete and changed destinations without writes", async () => {
    const f = fixture();
    f.get("photo-comment").revision = 2;
    await expect(
      f.call(editPhotoComment, { ...f.photoArgs(), comment: "Texto" }),
    ).rejects.toThrow(/cambió/);
    await expect(f.call(deletePhotoComment, f.photoArgs())).rejects.toThrow(
      /cambió/,
    );
    await expect(
      f.call(deletePhotoComment, { ...f.photoArgs(), photoId: "photo2" }),
    ).rejects.toThrow(/otra fotografía/);
    expect(f.writes).toHaveLength(0);
  });
  it.each(["photo", "log"])(
    "rejects tombstoned %s and returns unavailable without exposing comments",
    async (id) => {
      const f = fixture();
      f.get(id).deleted_at = 1;
      await expect(
        f.call(addPhotoComment, {
          photoId: "photo",
          comment: "Texto",
          operationId: "publish-photo-1",
        }),
      ).rejects.toThrow(/disponibles/);
      await expect(f.call(deletePhotoComment, f.photoArgs())).rejects.toThrow(
        /disponibles/,
      );
      expect(await f.call(getPhotoComments, { photoId: "photo" })).toEqual([]);
      expect(
        await f.call(getPhotoCommentContext, { photoId: "photo" }),
      ).toEqual({ available: false, canCreate: false });
      expect(f.writes).toHaveLength(0);
    },
  );
  it("rejects empty and oversized text in both modules", async () => {
    for (const text of ["  ", "x".repeat(5001)]) {
      const f = fixture();
      await expect(
        f.call(addPhotoComment, {
          photoId: "photo",
          comment: text,
          operationId: "invalid-photo-1",
        }),
      ).rejects.toThrow();
      await expect(
        f.call(editPhotoComment, { ...f.photoArgs(), comment: text }),
      ).rejects.toThrow();
      await expect(
        f.call(addComentario, {
          ...f.programArgs(),
          comentario: text,
          fecha_inicio: "01/10/2026",
          fecha_fin: "02/10/2026",
        }),
      ).rejects.toThrow();
      await expect(
        f.call(updateComentario, { ...f.programArgs(), comentario: text }),
      ).rejects.toThrow();
      expect(f.writes).toHaveLength(0);
    }
  });
  it("preserves shared program authorship permissions and future ranges, normalizing dates", async () => {
    const f = fixture(),
      before = f.invariants();
    const args = {
      ...f.programArgs(),
      comentario: "  Nuevo  ",
      fecha_inicio: "2028-01-01",
      fecha_fin: "2028-01-01",
    };
    const id = await f.call(addComentario, args);
    expect(await f.call(addComentario, args)).toBe(id);
    expect(f.get(id)).toMatchObject({
      comentario: "Nuevo",
      fecha_inicio: "01/01/2028",
      fecha_fin: "01/01/2028",
      revision: 1,
    });
    await f.call(updateComentario, {
      ...f.programArgs("program-edit-1"),
      comentario: "Edición por otra persona",
    });
    expect(f.get("program-comment")).toMatchObject({
      revision: 2,
      comentario: "Edición por otra persona",
    });
    expect(f.invariants()).toEqual(before);
  });
  it.each(["viewer", "almacenista"])(
    "rejects every program write for %s",
    async (role) => {
      const f = fixture(role);
      await expect(
        f.call(addComentario, {
          ...f.programArgs(),
          comentario: "Texto",
          fecha_inicio: "01/10/2026",
          fecha_fin: "02/10/2026",
        }),
      ).rejects.toThrow();
      await expect(
        f.call(updateComentario, { ...f.programArgs(), comentario: "Texto" }),
      ).rejects.toThrow();
      await expect(f.call(deleteComentario, f.programArgs())).rejects.toThrow();
      expect(await f.call(getComentarioContext, f.programArgs())).toMatchObject(
        { available: true, canWrite: false },
      );
      expect(f.writes).toHaveLength(0);
    },
  );
  it.each([
    ["31/02/2026", "01/03/2026"],
    ["2026-10-03", "2026-10-01"],
    ["1/10/2026", "02/10/2026"],
  ])("rejects invalid date range %s — %s", async (start, finish) => {
    const f = fixture();
    await expect(
      f.call(addComentario, {
        ...f.programArgs(),
        comentario: "Texto",
        fecha_inicio: start,
        fecha_fin: finish,
      }),
    ).rejects.toThrow();
    await expect(
      f.call(updateComentario, {
        ...f.programArgs(),
        fecha_inicio: start,
        fecha_fin: finish,
      }),
    ).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  });
  it("rejects stale program revisions, different parents and archived family destinations", async () => {
    const f = fixture();
    f.get("program-comment").revision = 2;
    await expect(
      f.call(updateComentario, { ...f.programArgs(), comentario: "Texto" }),
    ).rejects.toThrow(/cambió/);
    await expect(f.call(deleteComentario, f.programArgs())).rejects.toThrow(
      /cambió/,
    );
    await expect(
      f.call(deleteComentario, { ...f.programArgs(), parent_id: "schedule2" }),
    ).rejects.toThrow(/otra partida/);
    f.get("schedule").archived = true;
    await expect(
      f.call(addComentario, {
        ...f.programArgs(),
        parent_type: "familia",
        parent_id: "family",
        comentario: "Texto",
        fecha_inicio: "01/10/2026",
        fecha_fin: "02/10/2026",
      }),
    ).rejects.toThrow(/disponible/);
    expect(f.writes).toHaveLength(0);
  });
  it("deduplicates delete after physical removal and edit after revision increment", async () => {
    const f = fixture();
    const photo = { ...f.photoArgs(), comment: "Propuesto" };
    await f.call(editPhotoComment, photo);
    await f.call(editPhotoComment, photo);
    expect(f.get("photo-comment").revision).toBe(2);
    const remove = { ...f.photoArgs("delete-photo-1"), expectedRevision: 2 };
    await f.call(deletePhotoComment, remove);
    await f.call(deletePhotoComment, remove);
    const program = f.programArgs();
    await f.call(deleteComentario, program);
    await f.call(deleteComentario, program);
    expect(f.writes.filter(([op]) => op === "delete")).toHaveLength(2);
    expect(f.list("comment_operation_receipts")).toHaveLength(3);
  });
  it("rejects token reuse for a different payload and rechecks permissions on retry", async () => {
    const f = fixture(),
      args = {
        photoId: "photo",
        comment: "Texto",
        operationId: "same-operation-1",
      };
    await f.call(addPhotoComment, args);
    await expect(
      f.call(addPhotoComment, { ...args, comment: "Diferente" }),
    ).rejects.toThrow(/otra solicitud/);
    f.get("actor").role = "viewer";
    await expect(f.call(addPhotoComment, args)).rejects.toThrow();
    expect(f.list("photo_comments")).toHaveLength(3);
  });
  it("rechecks project access, hides inaccessible queries and keeps unrelated records", async () => {
    const f = fixture();
    f.get("actor").allowed_desarrollos = [];
    f.get("actor").organization_id = "different";
    await expect(f.call(deletePhotoComment, f.photoArgs())).rejects.toThrow();
    await expect(f.call(deleteComentario, f.programArgs())).rejects.toThrow();
    expect(
      await f.call(getPhotoCommentContext, { photoId: "photo" }),
    ).toMatchObject({ available: false });
    expect(await f.call(getComentarioContext, f.programArgs())).toMatchObject({
      available: false,
    });
    expect(f.writes).toHaveLength(0);
  });
  it("does not patch or increment a revision for unchanged saves", async () => {
    const f = fixture();
    await f.call(editPhotoComment, { ...f.photoArgs(), comment: " Original " });
    await f.call(updateComentario, {
      ...f.programArgs(),
      comentario: "Original",
      fecha_inicio: "2026-10-01",
      fecha_fin: "2026-10-02",
    });
    expect(f.writes.filter(([op]) => op === "patch")).toHaveLength(0);
  });
});
