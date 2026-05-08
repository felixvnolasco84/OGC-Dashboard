import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Shield, User, Eye, DollarSign, UserPlus, Trash2 } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

export default function UserManagementPage() {
  const users = useQuery(api.users.getAllUsers);
  const adminUser = useQuery(api.users.getCurrentUser);
  const desarrollos = useQuery(api.desarrollos.getAll);
  const updatePermissions = useMutation(api.users.updateUserPermissions);
  const removeUser = useMutation(api.users.removeUser);

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("viewer");
  const [selectedDesarrollos, setSelectedDesarrollos] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedUserRecord = users?.find((u) => u._id === selectedUser);
  const isSelectedAdminUser = adminUser?._id === selectedUser;

  // Update form when user selection changes
  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
    const user = users?.find((u) => u._id === userId);
    if (user) {
      setSelectedRole(user.role);
      setSelectedDesarrollos(new Set(user.allowed_desarrollos));
    }
  };

  const handleDesarrolloToggle = (desarrolloId: string) => {
    const newSet = new Set(selectedDesarrollos);
    if (newSet.has(desarrolloId)) {
      newSet.delete(desarrolloId);
    } else {
      newSet.add(desarrolloId);
    }
    setSelectedDesarrollos(newSet);
  };

  const handleSave = async () => {
    if (!selectedUser) {
      toast.error("Por favor selecciona un usuario");
      return;
    }

    setIsSaving(true);
    try {
      await updatePermissions({
        userId: selectedUser as Id<"users">,
        role: selectedRole,
        allowed_desarrollos: Array.from(selectedDesarrollos) as Id<"desarrollos">[],
      });

      toast.success("Permisos actualizados correctamente");
    } catch (error) {
      console.error("Error updating permissions:", error);
      toast.error("Error al actualizar permisos");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveUser = async () => {
    if (!selectedUser) {
      toast.error("Por favor selecciona un usuario");
      return;
    }

    setIsDeleting(true);
    try {
      await removeUser({
        userId: selectedUser as Id<"users">,
      });

      setSelectedUser(null);
      setSelectedRole("viewer");
      setSelectedDesarrollos(new Set());
      toast.success("Usuario quitado correctamente");
    } catch (error) {
      console.error("Error removing user:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al quitar usuario"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="h-4 w-4 text-purple-600" />;
      case "user":
        return <User className="h-4 w-4 text-blue-600" />;
      case "viewer":
        return <Eye className="h-4 w-4 text-gray-600" />;
      case "contratista":
        return <User className="h-4 w-4 text-orange-600" />;
      case "finance":
        return <DollarSign className="h-4 w-4 text-green-600" />;
      default:
        return null;
    }
  };

  if (!users || !desarrollos) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
          <h1 className="text-3xl font-normal text-gray-900 mb-2">
            Gestión de Usuarios
          </h1>
          <p className="text-gray-600">
            Administra roles y permisos de acceso a proyectos
          </p>
          </div>
          <Button asChild className="gap-2">
            <Link to="/usuarios/nuevo">
              <UserPlus className="h-4 w-4" />
              Agregar Usuario
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Usuarios ({users.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map((user) => (
                  <button
                    key={user._id}
                    onClick={() => handleUserSelect(user._id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedUser === user._id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {user.email}
                        </p>
                      </div>
                      <div className="ml-2">{getRoleIcon(user.role)}</div>
                    </div>
                    <div className="mt-1">
                      <span className="text-xs text-gray-600">
                        {user.allowed_desarrollos.length === 0
                          ? "Sin acceso"
                          : `${user.allowed_desarrollos.length} proyecto(s)`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Permission Editor */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <CardTitle>
                  {selectedUserRecord ? `Editar: ${selectedUserRecord.name}` : "Selecciona un usuario"}
                </CardTitle>
                {selectedUserRecord && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isDeleting || isSelectedAdminUser}
                        className="gap-2"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Quitar usuario
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Quitar usuario</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción quitará a {selectedUserRecord.name} de la lista de usuarios y revocará sus permisos guardados en el dashboard. No se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleRemoveUser}
                          disabled={isDeleting}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Quitar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              {isSelectedAdminUser && (
                <p className="text-xs font-normal text-gray-500">
                  No puedes quitar tu propio usuario desde esta pantalla.
                </p>
              )}
            </CardHeader>
            <CardContent>
              {!selectedUserRecord ? (
                <div className="text-center py-12 text-gray-500">
                  Selecciona un usuario de la lista para editar sus permisos
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Role Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="role">Rol</Label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-purple-600" />
                            Administrador (acceso completo)
                          </div>
                        </SelectItem>
                        <SelectItem value="user">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-blue-600" />
                            Usuario (proyectos asignados)
                          </div>
                        </SelectItem>
                        <SelectItem value="contratista">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-orange-600" />
                            Contratista (bitácora, requisiciones y programa de obra)
                          </div>
                        </SelectItem>
                        <SelectItem value="finance">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            Finanzas (solo requisiciones)
                          </div>
                        </SelectItem>
                        <SelectItem value="viewer">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-gray-600" />
                            Visualizador (solo lectura)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedRole === "admin" && (
                      <p className="text-xs text-gray-500">
                        Los administradores tienen acceso a todos los proyectos y pueden gestionar usuarios
                      </p>
                    )}
                    {selectedRole === "contratista" && (
                      <p className="text-xs text-gray-500">
                        Los contratistas tienen acceso a la bitácora y requisiciones en los proyectos asignados
                      </p>
                    )}
                    {selectedRole === "finance" && (
                      <p className="text-xs text-gray-500">
                        El rol de finanzas solo puede ver requisiciones y cambiar estados a Pagado o Cancelado
                      </p>
                    )}
                  </div>

                  {/* Project Access - Show for user, contratista, and viewer roles */}
                  {selectedRole !== "admin" && (
                    <div className="space-y-2">
                      <Label>Proyectos con acceso</Label>
                      <div className="border rounded-lg p-4 max-h-80 overflow-y-auto space-y-3">
                        {desarrollos.length === 0 ? (
                          <p className="text-sm text-gray-500">No hay proyectos disponibles</p>
                        ) : (
                          desarrollos.map((desarrollo) => (
                            <div key={desarrollo._id} className="flex items-center space-x-2">
                              <Checkbox
                                id={desarrollo._id}
                                checked={selectedDesarrollos.has(desarrollo._id)}
                                onCheckedChange={() => handleDesarrolloToggle(desarrollo._id)}
                              />
                              <label
                                htmlFor={desarrollo._id}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                {desarrollo.nombre}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Selecciona los proyectos a los que este usuario puede acceder
                      </p>
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Guardar Cambios
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
