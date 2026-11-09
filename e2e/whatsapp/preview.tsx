import { createRoot } from "react-dom/client";
import { useQuery } from "convex/react";
import { Toaster } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import WhatsappContactSettings from "../../src/components/Whatsapp/WhatsappContactSettings";
import WhatsappProjectSettings from "../../src/components/Whatsapp/WhatsappProjectSettings";
import WhatsappNotificationHistory from "../../src/components/Whatsapp/WhatsappNotificationHistory";
import "../../src/index.css";

const event = {
  _id: "event", _creationTime: 1, proyecto: "project", type: "created", subject: "Nueva requisición - Proyecto de construcción",
  actor_id: "actor", actor_name: "Responsable de obra", channel: "whatsapp", status: "needs_review", created_at: 1793815200000,
  recipient_count: 4, sent_count: 2, failed_count: 0,
  deliveries: [
    { _id: "read", recipient_name: "Administración", recipient_phone: "+525512345678", status: "read", delivered_at: 1793815200000, provider_read_at: 1793815200000 },
    { _id: "accepted", recipient_name: "Finanzas", recipient_phone: "+525512345679", status: "accepted" },
    { _id: "unknown", recipient_name: "Supervisión", status: "unknown", error: "Resultado incierto; revisar en Make antes de reenviar" },
    { _id: "skipped", recipient_name: "Almacén", status: "skipped", error: "Sin autorización vigente" },
  ],
} as unknown as Doc<"notification_events"> & { deliveries: Doc<"notification_deliveries">[] };
function Preview() {
  const user = useQuery(api.users.getCurrentUser);
  return <main className="mx-auto min-h-screen max-w-2xl space-y-6 bg-card p-4 sm:p-8">
    <h1 className="text-xl">WhatsApp de requisiciones</h1>
    {user && <WhatsappContactSettings user={user} />}
    <WhatsappProjectSettings proyecto={"project" as Id<"desarrollos">} />
    <WhatsappNotificationHistory event={event} />
    <Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
