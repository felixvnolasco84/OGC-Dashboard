import { FormEvent, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, MailPlus, Shield, User, Eye } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewUserPage() {
  const desarrollos = useQuery(api.desarrollos.getAll);
  const inviteUser = useAction(api.users.inviteUser);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [selectedDesarrollos, setSelectedDesarrollos] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCount = selectedDesarrollos.size;
  const roleDescription = useMemo(() => {
    if (role === "admin") return "Puede administrar usuarios y proyectos dentro de su organización.";
    if (role === "user") return "Puede trabajar en los proyectos asignados.";
    return "Solo puede consultar Presupuesto, Control, Programa y Bitácora.";
  }, [role]);

  const handleDesarrolloToggle = (desarrolloId: string) => {
    const nextSelected = new Set(selectedDesarrollos);
    if (nextSelected.has(desarrolloId)) {
      nextSelected.delete(desarrolloId);
    } else {
      nextSelected.add(desarrolloId);
    }
    setSelectedDesarrollos(nextSelected);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!name.trim() || !email.trim()) {
      toast.error("Agrega nombre y correo");
      return;
    }

    if (role !== "admin" && selectedDesarrollos.size === 0) {
      toast.error("Selecciona al menos un proyecto");
      return;
    }

    setIsSubmitting(true);
    try {
      await inviteUser({
        name: name.trim(),
        email: email.trim(),
        role,
        allowed_desarrollos: Array.from(selectedDesarrollos) as Id<"desarrollos">[],
      });
      toast.success("Usuario invitado correctamente");
      setName("");
      setEmail("");
      setRole("viewer");
      setSelectedDesarrollos(new Set());
    } catch (error) {
      console.error("Error inviting user:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo enviar la invitación");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!desarrollos) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-4 gap-2 px-0">
              <Link to="/usuarios">
                <ArrowLeft className="h-4 w-4" />
                Usuarios
              </Link>
            </Button>
            <h1 className="text-3xl font-normal text-gray-900">Agregar Usuario</h1>
            <p className="mt-2 text-gray-600">
              Crea el acceso, asigna proyectos y envía el correo de bienvenida.
            </p>
          </div>
          <div className="hidden rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 sm:block">
            {selectedCount} proyecto(s) seleccionado(s)
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailPlus className="h-5 w-5 text-gray-700" />
                Invitación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Nombre del usuario"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="usuario@empresa.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rol</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-gray-600" />
                        Viewer (solo lectura)
                      </div>
                    </SelectItem>
                    <SelectItem value="user">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-600" />
                        Usuario
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-purple-600" />
                        Administrador
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">{roleDescription}</p>
              </div>

              {role !== "admin" && (
                <div className="space-y-2">
                  <Label>Proyectos asignados</Label>
                  <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border p-4">
                    {desarrollos.length === 0 ? (
                      <p className="text-sm text-gray-500">No hay proyectos disponibles</p>
                    ) : (
                      desarrollos.map((desarrollo) => (
                        <div key={desarrollo._id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`new-${desarrollo._id}`}
                            checked={selectedDesarrollos.has(desarrollo._id)}
                            onCheckedChange={() => handleDesarrolloToggle(desarrollo._id)}
                          />
                          <label
                            htmlFor={`new-${desarrollo._id}`}
                            className="cursor-pointer text-sm font-medium leading-none"
                          >
                            {desarrollo.nombre}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end border-t pt-4">
                <Button type="submit" disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MailPlus className="h-4 w-4" />
                  )}
                  Enviar Invitación
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
