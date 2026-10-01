import * as React from "react";
import { cn } from "@/lib/utils";

type NodeProps = {
  id?: string;
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
  role?: string;
};
type Node = React.ReactElement<NodeProps>;

function kind(node: Node) {
  if (typeof node.type === "string") return node.type;
  return (node.type as { displayName?: string }).displayName;
}

function flatten(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) =>
    React.isValidElement<NodeProps>(child) && child.type === React.Fragment
      ? flatten(child.props.children)
      : [child],
  );
}

function text(children: React.ReactNode): string {
  return flatten(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    return React.isValidElement<NodeProps>(child) ? text(child.props.children) : "";
  }).join(" ").trim();
}

function headers(children: React.ReactNode): string[] {
  const result: string[] = [];
  function visit(nodes: React.ReactNode) {
    flatten(nodes).forEach((child) => {
      if (!React.isValidElement<NodeProps>(child)) return;
      if (["th", "TableHead"].includes(kind(child) ?? "")) {
        result.push(text(child.props.children));
      } else if (!["tbody", "TableBody", "tfoot", "TableFooter"].includes(kind(child) ?? "")) {
        visit(child.props.children);
      }
    });
  }
  visit(children);
  return result;
}

function RecordRow({ row, labels, summary }: { row: Node; labels: string[]; summary: number[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const generatedId = React.useId();
  const detailId = row.props.id ?? generatedId;
  const cells = flatten(row.props.children).filter(React.isValidElement<NodeProps>);
  // Full-width empty, loading and section rows keep their original content.
  const fullWidth = cells.length === 1 && (cells[0].props.colSpan ?? 1) > 1;
  const visible = summary.length ? summary : labels.map((label, index) =>
    index === 0 || /^(proyecto|proveedor|cliente|unidad|fecha|factura|concepto|descripci[oó]n|importe|monto|total|status|estado|acciones)\b/i.test(label.trim()) || !label ? index : -1,
  ).filter((index) => index >= 0);
  const hasDetail = !fullWidth && cells.some((_, index) => !visible.includes(index));
  const content = cells.map((cell, index) => React.cloneElement(cell, {
    key: cell.key ?? index,
    role: cell.props.role ?? "cell",
    className: cn(cell.props.className, "responsive-record-cell", !fullWidth && !visible.includes(index) && !expanded && "responsive-record-extra"),
    children: fullWidth ? cell.props.children : <>
      <span className="responsive-record-label">{labels[index] || (index === 0 ? "Selección" : "Acciones")}</span>
      <div className="responsive-record-value">{cell.props.children}</div>
    </>,
  }));
  if (hasDetail) content.push(<td key="responsive-detail" className="responsive-record-toggle" colSpan={labels.length || cells.length}>
    <button type="button" aria-expanded={expanded} aria-controls={detailId} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => {
      event.stopPropagation();
      setExpanded((value) => !value);
    }} className="min-h-11 w-full border-t border-border px-4 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      {expanded ? "Ocultar detalle" : "Ver detalle completo"}
    </button>
  </td>);
  return React.cloneElement(row, { className: cn(row.props.className, "responsive-record"), role: row.props.role ?? "row", children: content, ...{ id: detailId } });
}

/** Keeps the existing cells, events, IDs and calculations in both presentations. */
export function responsiveTableChildren(children: React.ReactNode, summary: number[]) {
  const labels = headers(children);
  function visit(nodes: React.ReactNode, inBody = false): React.ReactNode {
    return React.Children.map(nodes, (child) => {
      if (!React.isValidElement<NodeProps>(child)) return child;
      const nodeKind = kind(child);
      if (inBody && ["tr", "TableRow"].includes(nodeKind ?? "")) {
        return <RecordRow row={child} labels={labels} summary={summary} />;
      }
      if (child.props.children === undefined) return child;
      return React.cloneElement(child, { children: visit(child.props.children, inBody || ["tbody", "TableBody"].includes(nodeKind ?? "")) });
    });
  }
  return visit(children);
}

export function responsiveTableControls(children: React.ReactNode): React.ReactNode[] {
  const controls: React.ReactNode[] = [];
  function visit(nodes: React.ReactNode, label = "") {
    flatten(nodes).forEach((child) => {
      if (!React.isValidElement<NodeProps>(child)) return;
      const nodeKind = kind(child);
      if (["tbody", "TableBody", "tfoot", "TableFooter"].includes(nodeKind ?? "")) return;
      if (["input", "Checkbox", "button", "Button"].includes(nodeKind ?? "")) {
        controls.push(<div key={controls.length} className="flex min-h-11 items-center gap-2 text-sm">{label || "Seleccionar registros visibles"}{child}</div>);
      } else visit(child.props.children, ["th", "TableHead"].includes(nodeKind ?? "") ? text(child.props.children) : label);
    });
  }
  visit(children);
  return controls;
}
