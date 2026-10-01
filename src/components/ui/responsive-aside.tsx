import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";

export function ResponsiveAside({ title, children }: { title: string; children: ReactNode }) {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width:1279px)").matches);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width:1279px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!compact) return <aside className="min-w-0 bg-card">{children}</aside>;
  return <div className="min-w-0 border-t border-border p-4">
    <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>{title}</Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 overflow-hidden p-0">
        <SheetHeader className="border-b border-border px-4 py-4"><SheetTitle>{title}</SheetTitle></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  </div>;
}
