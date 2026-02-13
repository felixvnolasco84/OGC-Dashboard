import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Authenticated, Unauthenticated, useQuery, useConvexAuth } from "convex/react";
import { Id } from "../../../convex/_generated/dataModel";
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
  // CreditCard,
  // Users,
  Bookmark,
  // LockKeyhole,
  User,
  // FileText,
  Tag,
  TrendingUp,
  // Settings,
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
  { id: "programa", label: "Programa", path: "programa", disabled: true },
  // { id: "flujo", label: "Flujo", path: "flujo", disabled: false },
  { id: "bitacora", label: "Bitácora", path: "bitacora", disabled: false },
  { id: "requisiciones", label: "Requisiciones", path: "requisiciones", disabled: false },
  { id: "documentos", label: "Documentos", path: "documentos", disabled: false },
  { id: "transacciones", label: "Transacciones", path: "transacciones", disabled: false },
  // { id: "proveedores", label: "Proveedores", path: "proveedores", disabled: false },
];

// Restricted menu items for contratista role (Bitacora + Requisiciones)
const contratistaMenuItems: ProjectMenuItem[] = [
  { id: "bitacora", label: "Bit\u00e1cora", path: "bitacora", disabled: false },
  { id: "requisiciones", label: "Requisiciones", path: "requisiciones", disabled: false },
];

// Restricted menu items for finance role (only Requisiciones)
const financeMenuItems: ProjectMenuItem[] = [
  { id: "requisiciones", label: "Requisiciones", path: "requisiciones", disabled: false },
];

const salesProjectMenuItems: ProjectMenuItem[] = [
  { id: "presupuesto", label: "Presupuesto", path: "presupuesto", disabled: false },
  { id: "control", label: "Control", path: "control", disabled: false },
  // { id: "flujo", label: "Flujo", path: "flujo", disabled: false },
  { id: "documentos", label: "Documentos", path: "documentos", disabled: false },
  { id: "transacciones", label: "Transacciones", path: "transacciones", disabled: false },
];

const bottomProjectMenuItems = [
  { id: "proyectos", label: "Proyectos", path: "/proyectos", icon: Bookmark },
  // { id: "transacciones", label: "Transacciones", path: "/transacciones", icon: CreditCard },
  // { id: "proveedores", label: "Proveedores", path: "/proveedores", icon: Users },
  { id: "flujo", label: "Flujo", path: "/admin/flujo", icon: TrendingUp },
  // { id: "documentos", label: "Documentos", path: "/documentos", icon: FileText },
  // { id: "admin", label: "Admin", path: "/admin", icon: LockKeyhole },
  { id: "usuarios", label: "Usuarios", path: "/usuarios", icon: User },
];

const bottomSalesMenuItems = [
  { id: "sales-proyectos", label: "Proyectos Ventas", path: "/sales-proyectos", icon: Bookmark },
  // { id: "sales-transacciones", label: "Transacciones", path: "/sales-transacciones", icon: CreditCard },
  { id: "sales-flujo", label: "Flujo ", path: "/admin/sales-flujo", icon: TrendingUp },
  // { id: "sales-documentos", label: "Documentos", path: "/sales-documentos", icon: FileText },
  // { id: "sales-gestion", label: "Gestión Proyectos", path: "/sales-gestion", icon: Settings },
  { id: "sales-usuarios", label: "Acceso Usuarios", path: "/sales-usuarios", icon: User },
];


// Notification dot component for requisiciones
function RequisicionNotificationDot({ 
  proyectoId, 
  userId, 
  userRole 
}: { 
  proyectoId: Id<"desarrollos">; 
  userId?: Id<"users">; 
  userRole?: string;
}) {
  const unreadSummary = useQuery(
    api.requisicion_history.getUnreadSummary,
    userId ? { user_id: userId, proyecto: proyectoId, user_role: userRole } : "skip"
  );

  if (!unreadSummary || unreadSummary.total === 0) {
    return null;
  }

  // Green for new requisiciones (priority), blue for updates only
  const dotColor = unreadSummary.hasNew 
    ? "bg-green-500" 
    : unreadSummary.hasUpdated 
      ? "bg-blue-500" 
      : "bg-gray-400";

  return (
    <span 
      className={cn(
        "w-2 h-2 rounded-full",
        dotColor
      )}
      title={`${unreadSummary.total} cambio${unreadSummary.total > 1 ? 's' : ''} sin leer`}
    />
  );
}

export default function SidebarComponent() {
  const location = useLocation();
  const { proyectoId, salesProyectoId } = useParams<{ proyectoId?: string; salesProyectoId?: string }>();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const desarrollos = useQuery(api.desarrollos.getAll);
  const salesProjects = useQuery(api.sales_projects.getAll);
  const currentUser = useQuery(api.users.getCurrentUser);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Filter projects based on search query and user access
  const filteredProjects = (desarrollos || []).filter((proyecto) => {
    const matchesSearch = proyecto.nombre.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Admins can see all projects
    if (currentUser?.role === "admin") {
      return matchesSearch;
    }
    
    // Users, contratistas, and finance: only projects explicitly allowed
    if (currentUser?.role === "user" || currentUser?.role === "contratista" || currentUser?.role === "finance") {
      const allowedProjects = currentUser?.allowed_desarrollos || [];
      const hasAccess = allowedProjects.includes(proyecto._id);
      return matchesSearch && hasAccess;
    }
    
    // Viewers: only projects explicitly allowed
    if (currentUser?.role === "viewer") {
      const allowedProjects = currentUser?.allowed_desarrollos || [];
      const hasAccess = allowedProjects.includes(proyecto._id);
      return matchesSearch && hasAccess;
    }
    
    return matchesSearch;
  });

  // Filter sales projects based on user access and search query
  const filteredSalesProjects = (salesProjects || []).filter((proyecto) => {
    const matchesSearch = proyecto.nombre
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    // Admins can see all sales projects
    if (currentUser?.role === "admin") {
      return matchesSearch;
    }

    // Non-admin users: only projects explicitly allowed
    const allowedSalesProjects = currentUser?.allowed_sales_projects || [];
    const hasAccess = allowedSalesProjects.includes(proyecto._id);

    return matchesSearch && hasAccess;
  });

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

  // Don't render sidebar if not authenticated
  if (!isAuthenticated && !authLoading) {
    return null;
  }

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
          <SignInButton mode="modal" />
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
        {/* Regular Projects Section */}
        {filteredProjects.length > 0 && (
          <div className="mb-4 text-left">
            <p className="text-xs font-medium text-gray-400 px-3 mb-2">PROYECTOS</p>
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
                    {(currentUser?.role === "contratista" 
                        ? contratistaMenuItems 
                        : currentUser?.role === "finance" 
                          ? financeMenuItems 
                          : projectMenuItems
                      ).map((item) => (
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
                        <span className="flex items-center justify-between">
                          {item.label}
                          {item.id === "requisiciones" && (
                            <RequisicionNotificationDot 
                              proyectoId={proyecto._id} 
                              userId={currentUser?._id}
                              userRole={currentUser?.role}
                            />
                          )}
                        </span>
                      </Link>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </div>
        )}

        {/* Sales Projects Section */}
        {filteredSalesProjects.length > 0 && (
          <div className="text-left">
            <p className="text-xs font-medium text-gray-400 px-3 mb-2">PROYECTOS DE VENTAS</p>
            {filteredSalesProjects.map((salesProyecto) => {
              const isCurrentSalesProject = salesProyectoId === salesProyecto._id;
              return (
                <AccordionItem value={salesProyecto._id} key={salesProyecto._id} className="space-y-1 border-b-0">
                  <AccordionTrigger
                    disabled={!isAuthenticated}
                    onClick={() => toggleProject(salesProyecto._id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors",
                      isCurrentSalesProject ? "bg-gray-100" : "hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Tag className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="text-sm text-gray-900 truncate">
                        {salesProyecto.nombre}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="space-y-0.5 bg-gray-50 rounded-lg py-2 text-left">
                    {salesProjectMenuItems.map((item) => (
                      <Link
                        key={item.id}
                        to={`/sales-proyecto/${salesProyecto._id}/${item.path}`}
                        className={cn(
                          "block px-3 py-2 text-sm rounded transition-colors m-1",
                          item.disabled ? "text-gray-400 cursor-not-allowed" : "",
                          isActive(`/sales-proyecto/${salesProyecto._id}/${item.path}`)
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
          </div>
        )}
      </Accordion>

      {/* Bottom Menu - Only show for authenticated admin users */}
      {isAuthenticated && !authLoading && currentUser?.role === "admin" && (
        <div className="border-t border-gray-200 p-4 space-y-1 mt-6">
          {(
            bottomProjectMenuItems.map((item) => {
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
          )}
        </div>
      )}

      {
        isAuthenticated && !authLoading && currentUser?.role === "admin" && (
          <div className="border-t border-gray-200 p-4 space-y-1 mt-6">
            {(
              bottomSalesMenuItems.map((item) => {
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
            )}
          </div>
        )
      }
    </div>
  );
}
