import { Children, Fragment, isValidElement, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function fields(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) => isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? fields(child.props.children) : [child]);
}

/** Editable authorization rows retain their existing controls and mutation handlers. */
export function ResponsiveFields({ labels, summary, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { labels: string[]; summary: number[] }) {
  const [expanded, setExpanded] = useState(false);
  return <div className={cn(className, "responsive-fields")} {...props}>
    {fields(children).map((child, index) => <div key={isValidElement(child) ? child.key ?? index : index} className={cn("responsive-field", !summary.includes(index) && !expanded && "responsive-field-extra")}>
      <span className="responsive-field-label">{labels[index]}</span>
      {child}
    </div>)}
    {labels.some((_, index) => !summary.includes(index)) && <button type="button" className="responsive-field-toggle min-h-11 border-t border-border py-3 text-left text-sm font-medium" aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}>{expanded ? "Ocultar detalle" : "Ver detalle completo"}</button>}
  </div>;
}
