"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAggregatedDetailsModal } from "@/hooks/aggregated-details-modal";
import { cn, formatCurrency } from "@/lib/utils";

const DANGER = "#802424";

function percentOf(part: number, whole: number) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null;
  return (part / whole) * 100;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedCurrency(amount: number) {
  const formatted = formatCurrency(Math.abs(amount));
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `−${formatted}`;
  return formatted;
}

function MetricRow({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-subtle-foreground">{hint}</p>
        ) : null}
      </div>
      <p
        className={cn(
          "text-right text-sm tabular-nums",
          tone === "danger" ? "text-[#802424]" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function AggregatedDetailsModal() {
  const context = useAggregatedDetailsModal((state) => state.context);
  const isOpen = useAggregatedDetailsModal((state) => state.isOpen);
  const onClose = useAggregatedDetailsModal((state) => state.onClose);

  const presupuestoOriginal = context?.presupuestoOriginal ?? 0;
  const presupuestoAprobado = context?.presupuestoAprobado ?? 0;
  const pagado = context?.pagado ?? 0;
  const avance = context?.avance ?? 0;
  const porEjercer = presupuestoAprobado - pagado;
  const isOverspent = porEjercer < -0.01;

  const paidShare = percentOf(pagado, presupuestoAprobado);
  const variation = presupuestoAprobado - presupuestoOriginal;
  const variationShare = percentOf(variation, presupuestoOriginal);

  const variationHint =
    variation === 0
      ? undefined
      : variationShare === null
        ? formatSignedCurrency(variation)
        : `${formatSignedCurrency(variation)} · ${formatPercent(Math.abs(variationShare))}`;

  const paidHint =
    paidShare === null ? undefined : `${formatPercent(paidShare)} del aprobado`;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent data-square-modal="" className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
          <SheetTitle className="truncate text-base">
            {context?.name ?? "Resumen"}
          </SheetTitle>
          <SheetDescription>{context?.levelLabel ?? "Detalle agregado"}</SheetDescription>
        </SheetHeader>

        {context ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">Avance</span>
                <span
                  className={cn(
                    "text-2xl tabular-nums leading-none",
                    avance > 100 ? "text-[#802424]" : "text-foreground"
                  )}
                >
                  {formatPercent(avance)}
                </span>
              </div>
              <div className="h-1 w-full bg-muted">
                <div
                  className="h-full bg-foreground"
                  style={{
                    width: `${Math.min(Math.max(avance, 0), 100)}%`,
                    backgroundColor: avance > 100 ? DANGER : undefined,
                  }}
                />
              </div>
            </div>

            <div className="mt-6 divide-y divide-border border-y border-border">
              <MetricRow
                label="Presupuesto original"
                value={formatCurrency(presupuestoOriginal)}
              />
              <MetricRow
                label="Presupuesto aprobado"
                value={formatCurrency(presupuestoAprobado)}
                hint={variationHint}
              />
              <MetricRow
                label="Pagado"
                value={formatCurrency(pagado)}
                hint={paidHint}
                tone={paidShare !== null && paidShare > 100 ? "danger" : "default"}
              />
              <MetricRow
                label={isOverspent ? "Sobrepago" : "Por ejercer"}
                value={formatCurrency(Math.abs(porEjercer))}
                tone={isOverspent ? "danger" : "default"}
              />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
