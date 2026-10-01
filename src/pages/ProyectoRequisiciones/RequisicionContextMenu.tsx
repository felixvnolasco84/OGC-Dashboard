import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, type LucideIcon } from "lucide-react";
import { Command, CommandGroup, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";

export type RequisicionMenuAction = {
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    disabled?: boolean;
    complete?: boolean;
    busy?: boolean;
    destructive?: boolean;
};

export type RequisicionActionGroup = {
    label: string;
    icon?: LucideIcon;
    actions: RequisicionMenuAction[];
};

type Props = {
    position: { x: number; y: number };
    groups: RequisicionActionGroup[];
    returnFocus: HTMLElement | null;
    onClose: () => void;
};

export default function RequisicionContextMenu({ position, groups, returnFocus, onClose }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const commandRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const placeMenu = () => {
            const bounds = container.getBoundingClientRect();
            container.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - bounds.width - 8))}px`;
            container.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - bounds.height - 8))}px`;
        };
        placeMenu();
        const observer = new ResizeObserver(placeMenu);
        observer.observe(container);
        commandRef.current?.focus({ preventScroll: true });
        return () => observer.disconnect();
    }, [position.x, position.y]);

    useEffect(() => {
        const isInside = (target: EventTarget | null) => target instanceof Node && containerRef.current?.contains(target);
        const onPointerDown = (event: PointerEvent) => { if (!isInside(event.target)) onClose(); };
        const onScroll = (event: Event) => { if (!isInside(event.target)) onClose(); };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                returnFocus?.focus({ preventScroll: true });
            } else if (event.key === "Tab") {
                onClose();
            }
        };
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", onClose);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", onClose);
        };
    }, [onClose, returnFocus]);

    return createPortal(
        <div ref={containerRef} data-requisicion-context-menu className="fixed z-50 w-72 max-w-[calc(100vw-1rem)] overflow-hidden border border-border bg-card shadow-lg"
            style={{ left: position.x, top: position.y }}
            onContextMenu={(event) => event.preventDefault()}>
            <Command ref={commandRef} tabIndex={0} aria-label="Acciones de requisición" className="h-auto rounded-none">
                <CommandList className="max-h-[min(480px,calc(100dvh-1rem))]">
                    {groups.map((group, index) => <div key={group.label}>
                        {index > 0 && <CommandSeparator />}
                        <CommandGroup heading={group.label}>
                            {group.actions.map((action) => <CommandItem key={action.label} value={`${group.label}:${action.label}`}
                                disabled={action.disabled} variant={action.destructive ? "destructive" : "default"}
                                className="min-h-11 whitespace-normal"
                                onSelect={() => { onClose(); action.onSelect(); }}>
                                {action.busy ? <Loader2 className="animate-spin" /> : <action.icon />}
                                <span className="min-w-0 flex-1">{action.label}</span>
                                {action.complete && <span className="h-2 w-2 shrink-0 rounded-full bg-[#50AC66]" />}
                            </CommandItem>)}
                        </CommandGroup>
                    </div>)}
                </CommandList>
            </Command>
        </div>, document.body,
    );
}
