import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function TableColumnPicker<T extends string>({
    columns,
    isVisible,
    onToggle,
    className,
}: {
    columns: readonly { id: T; label: string }[];
    isVisible: (id: T) => boolean;
    onToggle: (id: T) => void;
    className?: string;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 shrink-0 rounded-none", className)}
                >
                    <Columns3 className="mr-1 h-4 w-4" />
                    Columnas
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-none">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Columnas adicionales
                </DropdownMenuLabel>
                {columns.map((column) => (
                    <DropdownMenuCheckboxItem
                        key={column.id}
                        className="rounded-none"
                        checked={isVisible(column.id)}
                        onCheckedChange={() => onToggle(column.id)}
                        onSelect={(event) => event.preventDefault()}
                    >
                        {column.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
