import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Search, FolderOpen, Calendar, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useAddProjectModal } from "@/hooks/add-project-modal";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router";

export default function ProjectsPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const projects = useQuery(api.desarrollos.getAll);
    const addProjectModal = useAddProjectModal();

    const filteredProjects = projects?.filter(project =>
        project.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className=" mx-auto px-12 py-6">
                    <div className="flex items-center justify-between">
                        <div className="text-left">
                            <h1 className="text-3xl  text-gray-900">Proyectos</h1>
                            <p className="text-gray-600 mt-1">
                                Gestiona y consulta todos tus proyectos de construcción
                            </p>
                        </div>
                        <Button
                            onClick={() => addProjectModal.onOpen()}
                            size="lg"
                            className="flex items-center gap-2 rounded-none"
                            variant={"outline"}
                        >
                            <Plus className="h-5 w-5" />
                            Nuevo Proyecto
                        </Button>
                    </div>

                    {/* Search Bar */}
                    <div className="mt-6 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                        <Input
                            type="text"
                            placeholder="Buscar proyectos por nombre o descripción..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 rounded-none"
                        />
                    </div>
                </div>
            </div>

            {/* Stats Section */}
            <div className=" mx-auto px-12 py-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="rounded-none">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Total Proyectos</p>
                                    <p className="text-3xl  text-gray-900 mt-2">
                                        {projects?.length || 0}
                                    </p>
                                </div>
                                <div className="h-12 w-12 bg-blue-100  flex items-center justify-center">
                                    <FolderOpen className="h-6 w-6 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-none">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Activos</p>
                                    <p className="text-3xl  text-green-600 mt-2">
                                        {projects?.length || 0}
                                    </p>
                                </div>
                                <div className="h-12 w-12 bg-green-100  flex items-center justify-center">
                                    <Calendar className="h-6 w-6 text-green-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-none">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">En desarrollo</p>
                                    <p className="text-3xl  text-orange-600 mt-2">
                                        {projects?.length || 0}
                                    </p>
                                </div>
                                <div className="h-12 w-12 bg-orange-100  flex items-center justify-center">
                                    <FolderOpen className="h-6 w-6 text-orange-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Projects Grid */}
                {!projects ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Cargando proyectos...</p>
                    </div>
                ) : filteredProjects && filteredProjects.length === 0 ? (
                    <div className="text-center py-12">
                        <FolderOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            {searchTerm ? "No se encontraron proyectos" : "No hay proyectos"}
                        </h3>
                        <p className="text-gray-600 mb-6">
                            {searchTerm
                                ? "Intenta con otros términos de búsqueda"
                                : "Comienza creando tu primer proyecto"}
                        </p>
                        {!searchTerm && (
                            <Button className="rounded-none" onClick={() => addProjectModal.onOpen()}>
                                <Plus className="h-4 w-4 mr-2" />
                                Crear Primer Proyecto
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects?.map((project) => (
                            <Card
                                key={project._id}
                                className="hover:shadow-lg transition-shadow cursor-pointer group"
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <CardTitle className="text-xl mb-1 flex items-center gap-2">
                                                <Link
                                                    to={`/dashboard`}
                                                    className="hover:text-blue-600 transition-colors"
                                                >
                                                    {project.nombre}
                                                </Link>
                                                <Badge variant="outline" className="text-xs">
                                                    Activo
                                                </Badge>
                                            </CardTitle>
                                            <CardDescription className="line-clamp-2">
                                                {project.descripcion}
                                            </CardDescription>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600">
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Eliminar
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent className="rounded-none">
                                    {project.image && (
                                        <div className="mb-4">
                                            <img
                                                src={project.image}
                                                alt={project.nombre}
                                                className="w-full h-48 object-cover "
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-sm text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            <span>
                                                {new Date(project._creationTime).toLocaleDateString('es-MX')}
                                            </span>
                                        </div>
                                        <Link
                                            to={`/dashboard`}
                                            className="text-blue-600 hover:text-blue-700 font-medium"
                                        >
                                            Ver detalles →
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
