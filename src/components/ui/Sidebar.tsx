import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Authenticated, Unauthenticated, useQuery, useConvexAuth } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import LOGO from '../../../public/OGC-LOGO.svg'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"


import {
  Search,
  Folder,
  CreditCard,
  Users,
  Bookmark,
  // LockKeyhole,
  User,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { UserButton, SignInButton } from "@clerk/clerk-react";



interface ProjectMenuItem {
  id: string;
  label: string;
  path: string;
  disabled: boolean;
}


const projectMenuItems: ProjectMenuItem[] = [
  { id: "presupuesto", label: "Presupuesto", path: "presupuesto", disabled: false },
  { id: "control", label: "Control", path: "control", disabled: false },
  // { id: "programa", label: "Programa", path: "programa", disabled: true },
  { id: "documentos", label: "Documentos", path: "documentos", disabled: false },
  { id: "transacciones", label: "Transacciones", path: "transacciones", disabled: false },
  { id: "proveedores", label: "Proveedores", path: "proveedores", disabled: false },
];

const bottomMenuItems = [
  { id: "proyectos", label: "Proyectos", path: "/proyectos", icon: Bookmark },
  { id: "transacciones", label: "Transacciones", path: "/transacciones", icon: CreditCard },
  { id: "proveedores", label: "Proveedores", path: "/proveedores", icon: Users },
  { id: "documentos", label: "Documentos", path: "/documentos", icon: FileText },
  // { id: "admin", label: "Admin", path: "/admin", icon: LockKeyhole },
  { id: "usuarios", label: "Usuarios", path: "/usuarios", icon: User },
];





export default function Sidebar() {
  const location = useLocation();
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const desarrollos = useQuery(api.desarrollos.getAll);
  const currentUser = useQuery(api.users.getCurrentUser);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Filter projects based on search query
  const filteredProjects = desarrollos?.filter((proyecto) =>
    proyecto.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Toggle project expansion
  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 z-10 flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <Link to="/">
          <img src={LOGO} alt="Logo" className="w-8" />
        </Link>
        <Authenticated>
          <UserButton />
        </Authenticated>
        <Unauthenticated>
          <SignInButton />
        </Unauthenticated>
      </div>



      {/* Search Bar */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-sm h-10 focus-visible:ring-0 border-none shadow-none "
          />
        </div>
      </div>

      {/* Projects List */}
      <Accordion type="multiple" className="overflow-y-auto px-4 space-y-2">
        {filteredProjects.map((proyecto) => {

          const isCurrentProject = proyectoId === proyecto._id;
          return (
            <AccordionItem value={proyecto._id} key={proyecto._id} className="space-y-1 border-b-0">
              {/* Project Header */}
              <AccordionTrigger
                disabled={!isAuthenticated}
                onClick={() => toggleProject(proyecto._id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors",
                  isCurrentProject ? "bg-gray-100" : "hover:bg-gray-50"
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Folder className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 truncate">
                    {proyecto.nombre}
                  </span>
                </div>

              </AccordionTrigger>

              {/* Project Sub-menu */}
              <AccordionContent className="space-y-0.5 bg-gray-50 rounded-lg py-2 text-left">
                {projectMenuItems.map((item) => (
                  <Link
                    key={item.id}
                    to={`/proyecto/${proyecto._id}/${item.path}`}
                    className={cn(
                      "block px-3 py-2 text-sm rounded transition-colors m-1",
                      item.disabled ? "text-gray-400 cursor-not-allowed" : "",
                      isActive(`/proyecto/${proyecto._id}/${item.path}`)
                        ? "text-gray-900 bg-white font-medium"
                        : "text-gray-600 hover:text-gray-900 hover:bg-white"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Bottom Menu - Only show for authenticated admin users */}
      {isAuthenticated && !authLoading && (
        <div className="border-t border-gray-200 p-4 space-y-1 mt-6">
          {currentUser?.role === "admin" ? (
            bottomMenuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                    isActive(item.path)
                      ? "text-gray-900 bg-gray-100 font-medium"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })
          ) : (
            <div className="px-3 py-2 text-xs text-gray-400 text-center">
              Menú de administrador no disponible
            </div>
          )}
        </div>
      )}
    </div>
  );
}
