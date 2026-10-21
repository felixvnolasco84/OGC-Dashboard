// Synthetic regression data. Only the October 6-8 progress matches the supplied screenshots.
export function reportLogbookFixture(photosPerDay = 2) {
  const project = { _id: "project", nombre: "Torre H - datos de prueba", moneda_principal: "MXN" };
  const progress = [
    "TORRE H:\nCOLOCACIÓN DE LOSETA EN LAVANDERÍAS",
    "TORRE H:\nRESANE EN BASES DE BARANDALES\nARMADO DE MURO PARA TERRAZA EN PB",
    "TORRE H:\nARMADO DE MURO PARA TERRAZA DE PB",
    "TORRE H:\nARMADO DE MURO PARA TERRAZA EN PB\nARMADO DE LOSA PARA CUARTO DE MÁQUINAS",
    "", // The only progress this day is in photo notes.
    "TORRE H:\nCIERRE DE TRABAJOS DE LA SEMANA",
  ];
  const logs = progress.map((avance_dia, index) => ({
    _id: `log-${index}`, _creationTime: index, uploaded_at: index,
    proyecto: project._id, categoria: "Estructura", partida_id: "partida", familias_tags: ["ALBAÑILERÍAS"],
    fecha: `${index + 5}/10/2026`, responsable: "Sergio Sánchez", avance_dia, status: "Sin problemas",
  }));
  const photos = logs.flatMap((log, index) => Array.from({ length: photosPerDay }, (_, photoIndex) => ({
    _id: `photo-${index}-${photoIndex}`, _creationTime: photoIndex, uploaded_at: photoIndex,
    nombre: `Evidencia ${index}-${photoIndex}`, proyecto: project._id, bitacora_id: log._id,
    type: "bitacora_foto", storage_id: `storage-${index}-${photoIndex}`,
    descripcion: `Avance en fotografía del día ${index + 5}, evidencia ${photoIndex + 1}.`,
  })));
  const comments = photos.map((photo, index) => ({
    _id: `comment-${index}`, photo_id: photo._id, user_id: "user", user_name: "Sergio Sánchez", created_at: index,
    comment: index % photosPerDay === 0 ? photo.descripcion : `Detalle adicional exclusivo del comentario ${index}.`,
  }));
  const tables = { desarrollos: [project], bitacora: logs, documentos: photos, photo_comments: comments };
  const photoReads = [];
  const ctx = {
    db: {
      get: async (id) => structuredClone(Object.values(tables).flat().find((row) => row._id === id) ?? null),
      query: (table) => {
        const filters = [];
        const rows = () => (tables[table] || []).filter((row) => filters.every(([key, value]) => row[key] === value));
        const query = {
          withIndex: (_name, predicate) => {
            const q = { eq: (key, value) => { filters.push([key, value]); return q; } };
            predicate(q);
            if (table === "photo_comments") photoReads.push(filters.find(([key]) => key === "photo_id")[1]);
            return query;
          },
          collect: async () => structuredClone(rows()),
          first: async () => structuredClone(rows()[0] ?? null),
          unique: async () => structuredClone(rows()[0] ?? null),
        };
        return query;
      },
    },
    storage: { getUrl: async () => null },
  };
  return { ctx, logs, photos, comments, tables, photoReads };
}

export const reportLogbookArgs = {
  proyecto: "project", periodStart: "2026-10-05", periodEnd: "2026-10-10",
  periodKey: "weekly:2026-10-05:2026-10-10", profile: "full",
};
