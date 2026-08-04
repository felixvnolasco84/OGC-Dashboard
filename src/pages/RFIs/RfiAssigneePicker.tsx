import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Bell,
  CheckCircle2,
  Loader2,
  Search,
  X,
} from "lucide-react";

export type RfiAssignableUser = {
  _id: Id<"users">;
  name: string;
  email: string;
  role: string;
};

function userInitials(user: RfiAssignableUser) {
  const source = user.name || user.email;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : source.slice(0, 2)
  ).toUpperCase();
}

export function RfiAssigneePicker({
  users,
  value,
  disabled = false,
  className,
  onChange,
}: {
  users?: RfiAssignableUser[];
  value: Id<"users">[];
  disabled?: boolean;
  className?: string;
  onChange: (value: Id<"users">[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const selectedIds = useMemo(() => new Set(value), [value]);
  const usersById = useMemo(
    () => new Map((users || []).map((user) => [user._id, user])),
    [users],
  );
  const selectedUsers = useMemo(
    () =>
      value
        .map((id) => usersById.get(id))
        .filter((user): user is RfiAssignableUser => Boolean(user)),
    [usersById, value],
  );
  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return users || [];
    return (users || []).filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term),
    );
  }, [searchTerm, users]);

  const toggleUser = (userId: Id<"users">) => {
    onChange(
      selectedIds.has(userId)
        ? value.filter((id) => id !== userId)
        : [...value, userId],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full min-w-0 items-center gap-2 rounded-sm border border-gray-200 bg-white px-3 text-left hover:bg-gray-50",
            disabled && "cursor-not-allowed opacity-70",
            className,
          )}
        >
          {selectedUsers.length > 0 ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-[#DDDCD8] bg-[#DDDCD8] text-xs font-medium text-[#898982]">
                {userInitials(selectedUsers[0])}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[#A3A39E]">
                {selectedUsers.map((user) => user.name || user.email).join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-[#E0E0E0] text-xs font-medium text-[#898982]">
                -
              </span>
              <span className="text-sm text-[#A3A39E]">Sin asignar</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-gray-200 bg-white p-0 text-gray-900 shadow-xl"
      >
        <div className="border-b border-gray-100 p-3">
          <div className="flex flex-wrap gap-1.5">
            {selectedUsers.length > 0 ? (
              selectedUsers.map((user) => (
                <button
                  key={user._id}
                  type="button"
                  onClick={() => toggleUser(user._id)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-gray-100 px-2 text-xs text-gray-700 hover:bg-gray-200"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-gray-200 bg-white text-[10px] font-medium text-gray-500">
                    {userInitials(user)}
                  </span>
                  <span className="max-w-36 truncate">
                    {user.name || user.email}
                  </span>
                  <X className="h-3 w-3" />
                </button>
              ))
            ) : (
              <span className="text-sm text-gray-400">
                Selecciona responsables
              </span>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar nombres, roles o equipos"
              className="h-9 pl-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-medium text-gray-500">
            Personas sugeridas
          </p>
          {!users && (
            <div className="flex h-24 items-center justify-center text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {users && filteredUsers.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-gray-500">
              No hay usuarios con esa búsqueda.
            </div>
          )}
          {filteredUsers.map((user) => {
            const selected = selectedIds.has(user._id);
            return (
              <button
                key={user._id}
                type="button"
                onClick={() => toggleUser(user._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-gray-100",
                  selected && "bg-gray-100",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gray-200 bg-gray-100 text-xs font-medium text-gray-500">
                  {userInitials(user)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-800">
                    {user.name || user.email}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {user.role}
                  </span>
                </span>
                {selected && (
                  <CheckCircle2 className="h-4 w-4 text-gray-600" />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <Bell className="h-4 w-4" />
          Se notificará a los responsables
        </div>
      </PopoverContent>
    </Popover>
  );
}
