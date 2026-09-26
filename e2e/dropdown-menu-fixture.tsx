import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { RfiDatePicker } from "@/pages/RFIs/RfiDatePicker";
import { RfiAssigneePicker, type RfiAssignableUser } from "@/pages/RFIs/RfiAssigneePicker";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import "@/index.css";

export function Fixture() {
  const [action, setAction] = useState("");
  const [date, setDate] = useState<Date>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [commandValue, setCommandValue] = useState("");
  const [rfiDate, setRfiDate] = useState("");
  const [assignees, setAssignees] = useState<RfiAssignableUser["_id"][]>([]);
  const users = [{ _id: "test-user" as RfiAssignableUser["_id"], name: "Ana López", email: "ana@example.test", role: "Responsable" }];

  return (
    <main className="space-y-4 p-8">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button>Acciones</Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setAction("editado")}>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <output data-testid="action">{action}</output>

      <AlertDialog>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button>Eliminar pago</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem>Confirmar eliminación</DropdownMenuItem>
            </AlertDialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialogContent>
          <AlertDialogTitle>Confirmar pago</AlertDialogTitle>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button>Editar partida</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DialogTrigger asChild><DropdownMenuItem>Abrir formulario</DropdownMenuItem></DialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>
        <DialogContent><DialogTitle>Formulario de partida</DialogTitle></DialogContent>
      </Dialog>

      <DropdownMenu modal={false} open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DropdownMenuTrigger asChild><Button>Fecha</Button></DropdownMenuTrigger>
        <DropdownMenuContent variant="calendar" align="start">
          <Calendar mode="single" selected={date} onSelect={(value) => {
            if (value) { setDate(value); setCalendarOpen(false); }
          }} />
        </DropdownMenuContent>
      </DropdownMenu>
      <output data-testid="date">{date?.toISOString().slice(0, 10)}</output>

      <Dialog>
        <DialogTrigger asChild><Button>Editar registro</Button></DialogTrigger>
        <DialogContent>
          <DialogTitle>Editar fecha</DialogTitle>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild><Button>Fecha del registro</Button></DropdownMenuTrigger>
            <DropdownMenuContent data-square-modal="" variant="calendarLayer">
              <Calendar mode="single" onSelect={(value) => value && setDate(value)} />
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogContent>
      </Dialog>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><Button>Buscar</Button></DropdownMenuTrigger>
        <DropdownMenuContent variant="budgetTargets">
          <input aria-label="Búsqueda" value={query} onChange={(event) => setQuery(event.target.value)} />
          <output data-testid="query">{query}</output>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><Button>Partidas</Button></DropdownMenuTrigger>
        <DropdownMenuContent variant="budgetTargets">
          <Command>
            <CommandInput placeholder="Buscar partida" />
            <CommandList>
              <CommandGroup>
                <CommandItem onSelect={() => setCommandValue("Partida A")}>Partida A</CommandItem>
                <CommandItem onSelect={() => setCommandValue("Partida B")}>Partida B</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DropdownMenuContent>
      </DropdownMenu>
      <output data-testid="command-value">{commandValue}</output>

      <RfiDatePicker placeholder="Fecha RFI" value={rfiDate} onChange={setRfiDate} />
      <output data-testid="rfi-date">{rfiDate}</output>
      <RfiAssigneePicker users={users} value={assignees} onChange={setAssignees} />
      <output data-testid="assignees">{assignees.join(",")}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
