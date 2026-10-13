import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useConvexConnectionState, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import ProgramaObraGanttItem from "../../src/pages/Programa Obra/ProgramaObraGanttItem";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import BitacoraGalleryModal from "../../src/components/Bitacora/BitacoraGalleryModal";
import ProgramaObraComentarios from "../../src/pages/Programa Obra/ProgramaObraComentarios";
import type { ProgramaItem } from "../../src/pages/Programa Obra/programa-obra-types";
import type { Id } from "../../convex/_generated/dataModel";
import "../../src/index.css";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#c8d0d3"/><rect y="620" width="1200" height="180" fill="#8c8271"/><path d="M200 620V170H850V620" fill="#b4ac9d" stroke="#5e6465" stroke-width="14"/><path d="M200 320H850M200 475H850M360 170V620M545 170V620M730 170V620" fill="none" stroke="#6b7171" stroke-width="12"/><rect x="915" y="260" width="20" height="360" fill="#707677"/><path d="M880 280H1000M880 400H1000M880 520H1000" stroke="#707677" stroke-width="12"/><text x="45" y="755" fill="#fff" font-family="sans-serif" font-size="28">Fotografía ilustrativa · datos de prueba</text></svg>`;
const photos = [1, 2].map((n) => ({
  _id: `photo${n}`,
  client_id: `photo${n}`,
  server_id: `photo${n}`,
  nombre: `Estructura · Foto ${n}`,
  descripcion: "Inspección del muro norte · Nivel 2",
  url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
  available_offline: false,
  pending: false,
}));
const item = {
  id: "schedule",
  partida: "Estructura",
  presupuesto: 100000,
  pagado: 20000,
  avanceReal: 35,
  financiero: 20,
  expanded: false,
  level: 0,
  children: [],
  schedule: {
    _id: "schedule",
    fecha_inicio: "01/10/2026",
    fecha_fin: "31/10/2026",
  },
} as unknown as ProgramaItem;
const family = {
  ...item,
  id: "family",
  partida: "Instalaciones ocultas",
  level: 1,
  parentPartidaNombre: "Estructura",
  detalleSchedule: {
    _id: "family",
    fecha_inicio: "01/10/2026",
    fecha_fin: "31/10/2026",
  },
} as unknown as ProgramaItem;
function Preview() {
  const [gallery, setGallery] = useState(false),
    [program, setProgram] = useState<ProgramaItem | null>(null);
  const [photoList, setPhotoList] = useState(photos);
  useEffect(() => {
    Object.assign(window, {
      reorderCommentPhotos: () => setPhotoList((list) => [...list].reverse()),
    });
  }, []);
  const comments = useQuery(api.programa_obra.getComentariosByProyecto, {
    proyecto_id: "project" as Id<"desarrollos">,
  });
  const online = useConvexConnectionState().isWebSocketConnected;
  return (
    <main className="min-h-screen bg-background p-5 text-foreground">
      <div className="mx-auto max-w-5xl space-y-5">
        <p className="text-xs text-muted-foreground">
          OGC · VALIDACIÓN LOCAL CON DATOS SIMULADOS
        </p>
        <h1 className="text-2xl">Comentarios de Bitácora y Programa</h1>
        <p>Revisar, publicar y eliminar comentarios con su contexto.</p>
        <div className="flex flex-wrap gap-3">
          <button
            className="border border-border p-3"
            onClick={() => setGallery(true)}
          >
            Abrir fotografías
          </button>
          <button
            className="border border-border p-3"
            onClick={() => setProgram(item)}
          >
            Comentarios de partida
          </button>
          <button
            className="border border-border p-3"
            onClick={() => setProgram(family)}
          >
            Comentarios de familia
          </button>
        </div>
      </div>
      <section
        className="mx-auto mt-10 max-w-5xl overflow-x-auto border border-border p-4"
        aria-label="Gantt de prueba"
      >
        <h2 className="mb-4">Estructura · Octubre 2026</h2>
        <div className="relative h-14 min-w-[700px]">
          <TooltipProvider>
            <ProgramaObraGanttItem
              item={{
                ...item,
                comentarios: comments?.filter(
                  (c) => c.parent_id === "schedule",
                ),
              }}
              columnWidth={140}
              timelineMonths={[
                { label: "Octubre", month: 9, year: 2026, weeks: 5 },
              ]}
              currentTime={Date.UTC(2026, 9, 13)}
            />
          </TooltipProvider>
        </div>
      </section>
      <BitacoraGalleryModal
        isOpen={gallery}
        onClose={() => setGallery(false)}
        photos={photoList}
        logTitle="Inspección de estructura"
        logDate="13/10/2026"
        logResponsable="Ana López"
        online={online}
      />
      {program && (
        <ProgramaObraComentarios
          key={program.id}
          item={program}
          proyectoId={"project" as Id<"desarrollos">}
          onClose={() => setProgram(null)}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
