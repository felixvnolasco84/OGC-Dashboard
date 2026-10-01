import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = NonNullable<FunctionReturnType<typeof api.requisiciones.getByProyecto>[number]["items"]>[number];

type Props = {
    items: Item[];
    canReview: boolean;
    editedQuantities: Record<string, number>;
    reviewingItemId: string | null;
    onQuantityChange: (id: string, quantity: number) => void;
    onApprove: (id: Id<"requisicion_items">, quantity: number) => void;
    onReject: (id: Id<"requisicion_items">) => void;
};

const columns = ["Partida / Subpartida", "Unidad", "Cantidad", "Precio Unitario", "Ejercido", "Solicitado", "Aprobado", "Monto", "Estado / Acciones"];

export default function RequisicionItems({ items, canReview, editedQuantities, reviewingItemId, onQuantityChange, onApprove, onReject }: Props) {
    // Both layouts use the same values and review controls; edited state stays in the page.
    const rows = items.map((item) => {
        const approved = item.status_revision === "aprobado";
        const rejected = item.status_revision === "rechazado";
        const pending = !item.status_revision || item.status_revision === "pendiente";
        const showReview = canReview && pending;
        const busy = reviewingItemId === item._id;
        const quantity = editedQuantities[item._id] ?? item.cantidad;
        const budget = item.presupuesto_aprobado ?? 0;
        const spent = budget > 0 ? Math.round(((item.pagado ?? 0) / budget) * 100) : 0;
        const name = item.sub_partida || item.familia;
        const modified = approved && item.cantidad_aprobada !== undefined && item.cantidad_aprobada !== item.cantidad;
        let approvedQuantity: ReactNode;
        if (showReview) {
            approvedQuantity = <div className="flex flex-wrap items-center gap-2 md:justify-center">
                <input type="number" min={1} value={quantity} aria-label={`Cantidad aprobada de ${name}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onQuantityChange(item._id, Number(event.target.value))}
                    className="h-11 w-20 rounded-sm border border-border-strong bg-card px-2 text-center text-base text-foreground md:text-sm" />
                <span className="text-xs text-muted-foreground">{item.unidad}</span>
            </div>;
        } else if (modified) {
            approvedQuantity = <div className="flex flex-wrap items-center gap-1 md:justify-center">
                <span className="text-muted-foreground line-through">{item.cantidad}</span>
                <span className="font-medium">{item.cantidad_aprobada}</span><span>{item.unidad}</span>
            </div>;
        } else {
            approvedQuantity = <span className={cn("inline-flex max-w-full flex-wrap items-center rounded-sm border px-2.5 py-1", approved ? "border-border-strong bg-card" : "border-border text-muted-foreground")}>
                {item.cantidad_aprobada ?? item.cantidad} {item.unidad}
            </span>;
        }
        const actions = showReview ? <div className="flex items-center gap-2 md:justify-center" aria-live="polite">
            {busy ? <span role="status" aria-label={`Revisando ${name}`} className="flex h-11 items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></span> : <>
                <button type="button" title="Aprobar" aria-label={`Aprobar ${name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-green-600 focus-visible:outline focus-visible:outline-2"
                    onClick={(event) => { event.stopPropagation(); onApprove(item._id, quantity); }}><CheckCircle className="h-5 w-5" /></button>
                <button type="button" title="Rechazar" aria-label={`Rechazar ${name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-red-500 focus-visible:outline focus-visible:outline-2"
                    onClick={(event) => { event.stopPropagation(); onReject(item._id); }}><XCircle className="h-5 w-5" /></button>
            </>}
        </div> : approved ? <span className="inline-flex items-center gap-2 text-green-600"><CheckCircle className="h-4 w-4 shrink-0" /><span className="md:sr-only">Aprobado</span></span>
            : rejected ? <span className="inline-flex items-center gap-2 text-red-500"><XCircle className="h-4 w-4 shrink-0" /><span className="md:sr-only">Rechazado</span></span> : null;
        return {
            id: item._id,
            className: cn("border border-border bg-card", rejected && "opacity-40 bg-[#CD56364A] border-[#FBE8E0]", approved && "border-green-200"),
            cells: [name, item.unidad, item.cantidad.toLocaleString("es-MX"), `$${(item.precio_unitario ?? 0).toLocaleString("es-MX")}`,
                `${spent}%`,
                `${item.cantidad} ${item.unidad}`, approvedQuantity,
                `$${(item.monto || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, actions],
        };
    });

    return <>
        <div className="space-y-3 md:hidden" data-material-layout="mobile">
            {rows.map((row) => <article key={row.id} className={cn("min-w-0 rounded-sm p-3", row.className)}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-4">
                    {row.cells.map((cell, index) => <div key={columns[index]} className={cn("min-w-0", (index === 0 || index === 6 || index === 8) && "col-span-2")}>
                        <dt className="mb-1 text-xs text-muted-foreground">{columns[index]}</dt>
                        <dd className={cn("text-sm text-foreground [overflow-wrap:anywhere]", index === 0 && "uppercase")}>{cell}</dd>
                    </div>)}
                </dl>
            </article>)}
        </div>
        <div className="relative hidden max-w-full overflow-x-auto rounded-sm md:block" data-material-layout="table" role="region" aria-label="Materiales de la requisición" tabIndex={0}>
            <table className="w-full min-w-[1000px] border-separate border-spacing-y-2">
                <caption className="sr-only">Materiales y revisión de la requisición</caption>
                <thead><tr>{columns.map((column, index) => <th key={column} scope="col" className={cn("px-3 py-3 text-left text-xs font-normal text-muted-foreground", [2, 3, 4, 7].includes(index) && "text-right", [5, 6, 8].includes(index) && "text-center")}>
                    {column}
                </th>)}</tr></thead>
                <tbody>{rows.map((row) => <tr key={row.id} className={row.className}>
                    {row.cells.map((cell, index) => <td key={columns[index]} className={cn("px-3 py-3 text-sm text-foreground", index === 0 ? "min-w-48 max-w-80 uppercase [overflow-wrap:anywhere]" : "whitespace-nowrap", [2, 3, 4, 7].includes(index) && "text-right", [5, 6, 8].includes(index) && "text-center")}>{cell}</td>)}
                </tr>)}</tbody>
            </table>
        </div>
    </>;
}
