import { useState } from "react";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatRfiDate } from "./rfiUi";

function parseDateString(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function RfiDatePicker({
  id,
  value,
  disabled = false,
  placeholder = "Sin fecha",
  className,
  onChange,
}: {
  id?: string;
  value?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateString(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-10 w-full min-w-0 justify-start rounded-sm border border-border bg-card px-3 text-left text-sm font-normal text-foreground shadow-none hover:bg-background",
            !value && "text-disabled-foreground",
            className,
          )}
        >
          {value ? formatRfiDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto border-border bg-card p-0 text-foreground shadow-xl"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          locale={es}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateInputValue(date));
            setOpen(false);
          }}
          buttonVariant="ghost"
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Limpiar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(toDateInputValue(new Date()));
              setOpen(false);
            }}
          >
            Hoy
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
