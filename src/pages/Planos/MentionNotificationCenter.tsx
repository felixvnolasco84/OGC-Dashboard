import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Bell, Check, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanoMentionNotification } from "./planosTypes";

const COLORS = {
  green: "#50AC66",
  surface: "#FBFBFB",
  border: "#E6E6E6",
  borderStrong: "#DBDBDB",
  textSoft: "#898982",
  muted: "#A3A39E",
};

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function MentionNotificationCenter({
  projectId,
  compact,
  iconOnly,
}: {
  projectId?: Id<"desarrollos">;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const markAttemptedRef = useRef(false);
  const notifications = useQuery(
    api.planos.getMentionNotifications,
    projectId ? { proyecto: projectId, limit: 60 } : { limit: 60 },
  ) as PlanoMentionNotification[] | undefined;
  const unreadCount = useQuery(
    api.planos.getUnreadMentionCount,
    projectId ? { proyecto: projectId } : {},
  );
  const markRead = useMutation(api.planos.markMentionNotificationsRead);

  useEffect(() => {
    if (!open) {
      markAttemptedRef.current = false;
      setMarkingRead(false);
      return;
    }
    if (unreadCount === undefined || unreadCount === 0 || markAttemptedRef.current) {
      return;
    }

    markAttemptedRef.current = true;
    setMarkingRead(true);
    void (async () => {
      let hasMore = true;
      let batches = 0;
      while (hasMore && batches < 20) {
        const result = await markRead(projectId ? { proyecto: projectId } : {});
        hasMore = result.has_more;
        batches += 1;
      }
      if (hasMore) {
        toast.info(
          "Se marcaron las menciones más recientes; todavía existe historial pendiente.",
        );
      }
    })()
      .catch((error: unknown) => {
        markAttemptedRef.current = false;
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible marcar las menciones como leídas",
        );
      })
      .finally(() => setMarkingRead(false));
  }, [markRead, open, projectId, unreadCount]);

  const openNotification = (notification: PlanoMentionNotification) => {
    if (notification.is_unread) {
      void markRead(
        projectId
          ? { proyecto: projectId, notification_ids: [notification._id] }
          : { notification_ids: [notification._id] },
      ).catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible marcar la mención como leída",
        );
      });
    }
    const params = notification.anotacion_id
      ? `?annotation=${notification.anotacion_id}`
      : "?tab=comments";
    setOpen(false);
    navigate(
      `/proyecto/${notification.proyecto}/planos/${notification.plano_id}${params}`,
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn(
          "relative gap-2 rounded-sm bg-white font-normal shadow-none",
          iconOnly
            ? "h-8 w-8 p-0"
            : compact
              ? "h-11 px-4"
              : "h-14 px-5 text-base",
        )}
        style={{ borderColor: COLORS.borderStrong, color: COLORS.textSoft }}
        data-viewer-readonly-allow="true"
        aria-label={iconOnly ? "Menciones en planos" : undefined}
        title={iconOnly ? "Menciones en planos" : undefined}
      >
        <Bell className="h-4 w-4" />
        {!iconOnly && "Menciones"}
        {(unreadCount || 0) > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-sm px-1.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: COLORS.green }}
          >
            {(unreadCount || 0) > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div>
                <SheetTitle>Menciones en planos</SheetTitle>
                <SheetDescription>
                  Observaciones y comentarios donde otros integrantes te etiquetaron.
                </SheetDescription>
              </div>
              {markingRead && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs"
                  style={{ backgroundColor: COLORS.surface, color: COLORS.textSoft }}
                >
                  <Check className="h-3 w-3" />
                  Marcando como leídas
                </span>
              )}
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {notifications === undefined ? (
              <div className="py-10 text-center text-sm" style={{ color: COLORS.muted }}>
                Cargando menciones...
              </div>
            ) : notifications.length === 0 ? (
              <div
                className="border border-dashed p-8 text-center"
                style={{ borderColor: COLORS.border }}
              >
                <MessageSquare className="mx-auto h-7 w-7" style={{ color: COLORS.muted }} />
                <p className="mt-3 text-sm font-medium text-gray-900">Sin menciones</p>
                <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>
                  Las etiquetas que recibas aparecerán aquí.
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification._id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className="w-full border bg-white p-4 text-left hover:bg-[#FBFBFB]"
                  style={{ borderColor: COLORS.border }}
                  data-viewer-readonly-allow="true"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: notification.is_unread
                          ? COLORS.green
                          : COLORS.borderStrong,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-900">
                        <strong>{notification.actor_name}</strong> te mencionó en{" "}
                        <strong>{notification.plano_titulo}</strong>
                      </span>
                      <span className="mt-1 block line-clamp-3 text-sm leading-5 text-gray-600">
                        {notification.comment_excerpt}
                      </span>
                      <span className="mt-2 block text-xs" style={{ color: COLORS.muted }}>
                        {!projectId && `${notification.proyecto_nombre} · `}
                        {notification.pagina && `Página ${notification.pagina} · `}
                        {formatDateTime(notification.created_at)}
                      </span>
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
