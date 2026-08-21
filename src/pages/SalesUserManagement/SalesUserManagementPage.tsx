import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
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
import { toast } from "sonner";
import { Loader2, Shield, User, Eye } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

export default function SalesUserManagementPage() {
  const users = useQuery(api.users.getAllUsers);
  const salesProjects = useQuery(api.sales_projects.getAll);
  const updatePermissions = useMutation(api.users.updateUserPermissions);

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("viewer");
  const [selectedSalesProjects, setSelectedSalesProjects] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const currentUser = users?.find((u) => u._id === selectedUser);

  // Update form when user selection changes
  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
    const user = users?.find((u) => u._id === userId);
    if (user) {
      setSelectedRole(user.role);
      setSelectedSalesProjects(new Set(user.allowed_sales_projects || []));
    }
  };

  const handleSalesProjectToggle = (projectId: string) => {
    const newSet = new Set(selectedSalesProjects);
    if (newSet.has(projectId)) {
      newSet.delete(projectId);
    } else {
      newSet.add(projectId);
    }
    setSelectedSalesProjects(newSet);
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
        allowed_sales_projects: Array.from(selectedSalesProjects) as Id<"sales_projects">[],
      });

      toast.success("Permisos de ventas actualizados correctamente");
    } catch (error) {
      console.error("Error updating permissions:", error);
      toast.error("Error al actualizar permisos");
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="h-4 w-4 text-purple-600" />;
      case "user":
        return <User className="h-4 w-4 text-blue-600" />;
      case "viewer":
        return <Eye className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  if (!users || !salesProjects) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-disabled-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-card min-h-screen">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-normal text-foreground mb-2">
            Gestión de Acceso a Proyectos de Ventas
          </h1>
          <p className="text-muted-foreground">
            Administra permisos de acceso a proyectos de ventas para cada usuario
          </p>
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
                        : "border-border hover:border-border-strong"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {user.name}
                        </p>
                        <p className="text-xs text-subtle-foreground truncate">
                          {user.email}
                        </p>
                      </div>
                      <div className="ml-2">{getRoleIcon(user.role)}</div>
                    </div>
                    <div className="mt-1">
                      <span className="text-xs text-muted-foreground">
                        {(user.allowed_sales_projects?.length || 0) === 0
                          ? "Sin acceso a ventas"
                          : `${user.allowed_sales_projects?.length || 0} proyecto(s) de ventas`}
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
              <CardTitle>
                {currentUser ? `Editar: ${currentUser.name}` : "Selecciona un usuario"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!currentUser ? (
                <div className="text-center py-12 text-subtle-foreground">
                  Selecciona un usuario de la lista para editar sus permisos de ventas
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
                        <SelectItem value="viewer">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            Visualizador (solo lectura)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedRole === "admin" && (
                      <p className="text-xs text-subtle-foreground">
                        Los administradores tienen acceso a los proyectos de ventas de su organización
                      </p>
                    )}
                  </div>

                  {/* Sales Project Access */}
                  {selectedRole !== "admin" && (
                    <div className="space-y-2">
                      <Label>Proyectos de Ventas con acceso</Label>
                      <div className="border rounded-lg p-4 max-h-80 overflow-y-auto space-y-3">
                        {salesProjects.length === 0 ? (
                          <p className="text-sm text-subtle-foreground">No hay proyectos de ventas disponibles</p>
                        ) : (
                          salesProjects.map((project) => (
                            <div key={project._id} className="flex items-center space-x-2">
                              <Checkbox
                                id={project._id}
                                checked={selectedSalesProjects.has(project._id)}
                                onCheckedChange={() => handleSalesProjectToggle(project._id)}
                              />
                              <label
                                htmlFor={project._id}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                {project.nombre}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-xs text-subtle-foreground">
                        Selecciona los proyectos de ventas a los que este usuario puede acceder
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
