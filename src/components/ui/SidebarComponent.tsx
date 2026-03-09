import { Link, useLocation, useParams, useNavigate } from "react-router";
import { Unauthenticated, useQuery, useConvexAuth } from "convex/react";
import { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import LOGO from '../../../public/OGC-LOGO.svg'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/Sidebar"
import {
  Folder,
  // CreditCard,
  // Users,
  Bookmark,
  // LockKeyhole,
  // User,
  // FileText,
  Tag,
  // TrendingUp,
  ChevronsUpDown,
  TagIcon,
  LucideProps,
  ChartBar,
  ChartArea,
  ChartGantt,
  BookCheck,
  BookDashed,
  File,
  LogOut,
  Home,
  Upload,
  Users,
  // Settings,
} from "lucide-react";
import { useUser, useClerk, SignInButton } from "@clerk/clerk-react";
import { ForwardRefExoticComponent, RefAttributes } from "react";




interface ProjectMenuItem {
  id: string;
  label: string;
  path: string;
  disabled: boolean;
  icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
}


const projectMenuItems: ProjectMenuItem[] = [
  { id: "presupuesto", label: "Presupuesto", path: "presupuesto", disabled: false, icon: ChartBar },
  { id: "control", label: "Control", path: "control", disabled: false, icon: ChartArea },
  { id: "programa", label: "Programa", path: "programa", disabled: false, icon: ChartGantt },
  // { id: "flujo", label: "Flujo", path: "flujo", disabled: false },
  { id: "bitacora", label: "Bitácora", path: "bitacora", disabled: false, icon: BookCheck },
  { id: "requisiciones", label: "Requisiciones", path: "requisiciones", disabled: false, icon: BookDashed },
  { id: "documentos", label: "Documentos", path: "documentos", disabled: false, icon: File },
  { id: "transacciones", label: "Transacciones", path: "transacciones", disabled: false, icon: BookDashed },
  // { id: "proveedores", label: "Proveedores", path: "proveedores", disabled: false },
];

// Restricted menu items for contratista role (Bitacora + Requisiciones)
const contratistaMenuItems: ProjectMenuItem[] = [
  { id: "bitacora", label: "Bit\u00e1cora", path: "bitacora", disabled: false, icon: Bookmark },
  { id: "requisiciones", label: "Requisiciones", path: "requisiciones", disabled: false, icon: Bookmark },
];

// Restricted menu items for finance role (only Requisiciones)
const financeMenuItems: ProjectMenuItem[] = [
  { id: "requisiciones", label: "Requisiciones", path: "requisiciones", disabled: false, icon: Bookmark },
];

const salesProjectMenuItems: ProjectMenuItem[] = [
  { id: "presupuesto", label: "Presupuesto", path: "presupuesto", disabled: false, icon: TagIcon },
  { id: "control", label: "Control", path: "control", disabled: false, icon: Folder },
  // { id: "flujo", label: "Flujo", path: "flujo", disabled: false },
  { id: "documentos", label: "Documentos", path: "documentos", disabled: false, icon: Bookmark },
  { id: "transacciones", label: "Transacciones", path: "transacciones", disabled: false, icon: Bookmark },
];

// const bottomProjectMenuItems = [
//   { id: "proyectos", label: "Proyectos", path: "/proyectos", icon: Bookmark },
//   // { id: "transacciones", label: "Transacciones", path: "/transacciones", icon: CreditCard },
//   // { id: "proveedores", label: "Proveedores", path: "/proveedores", icon: Users },
//   { id: "flujo", label: "Flujo", path: "/admin/flujo", icon: TrendingUp },
//   // { id: "documentos", label: "Documentos", path: "/documentos", icon: FileText },
//   // { id: "admin", label: "Admin", path: "/admin", icon: LockKeyhole },
//   { id: "usuarios", label: "Usuarios", path: "/usuarios", icon: User },
// ];

// const bottomSalesMenuItems = [
//   { id: "sales-proyectos", label: "Proyectos Ventas", path: "/sales-proyectos", icon: Bookmark },
//   // { id: "sales-transacciones", label: "Transacciones", path: "/sales-transacciones", icon: CreditCard },
//   { id: "sales-flujo", label: "Flujo ", path: "/admin/sales-flujo", icon: TrendingUp },
//   // { id: "sales-documentos", label: "Documentos", path: "/sales-documentos", icon: FileText },
//   // { id: "sales-gestion", label: "Gestión Proyectos", path: "/sales-gestion", icon: Settings },
//   { id: "sales-usuarios", label: "Acceso Usuarios", path: "/sales-usuarios", icon: User },
// ];


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

function SidebarUserCard({ role }: { role?: string }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const isAdmin = role === "admin";

  const displayName = user?.fullName || user?.firstName || "Usuario";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const avatarUrl = user?.imageUrl;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="w-full data-[state=open]:bg-gray-100"
        >
          <div className="h-8 w-8 rounded-lg bg-gray-200 overflow-hidden shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs font-medium text-gray-600">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0.5 leading-none text-left">
            <span className="font-semibold text-sm truncate">{displayName}</span>
            <span className="text-xs text-gray-500 truncate">{email}</span>
          </div>
          {/* <ChevronsUpDown className="ml-auto w-4 h-4 text-gray-400" /> */}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      {/* Dropdown menu user profile */}
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        side="top"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <div className="h-8 w-8 rounded-lg bg-gray-200 overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs font-medium text-gray-600">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-semibold text-sm">{displayName}</span>
              <span className="text-xs text-gray-500">{email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate("/")} className="gap-2">
          <Home className="w-4 h-4" />
          Inicio
        </DropdownMenuItem>

        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">
              Proyectos de Obra
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate("/proyectos")} className="gap-2">
              <Bookmark className="w-4 h-4" />
              Ver proyectos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/admin/flujo")} className="gap-2">
              <Upload className="w-4 h-4" />
              Cargar flujo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/usuarios")} className="gap-2">
              <Users className="w-4 h-4" />
              Gestionar usuarios
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">
              Proyectos de Ventas
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate("/sales-proyectos")} className="gap-2">
              <Bookmark className="w-4 h-4" />
              Ver proyectos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/admin/sales-flujo")} className="gap-2">
              <Upload className="w-4 h-4" />
              Cargar flujo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/sales-usuarios")} className="gap-2">
              <Users className="w-4 h-4" />
              Gestionar usuarios
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ redirectUrl: "/" })}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function SidebarComponent() {
  const location = useLocation();
  const { proyectoId, salesProyectoId } = useParams<{ proyectoId?: string; salesProyectoId?: string }>();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const desarrollos = useQuery(api.desarrollos.getAll);
  const salesProjects = useQuery(api.sales_projects.getAll);
  const currentUser = useQuery(api.users.getCurrentUser);

  const navigate = useNavigate();

  // Filter projects based on user access
  const filteredProjects = (desarrollos || []).filter((proyecto) => {
    if (currentUser?.role === "admin") return true;
    if (currentUser?.role === "user" || currentUser?.role === "contratista" || currentUser?.role === "finance") {
      return (currentUser?.allowed_desarrollos || []).includes(proyecto._id);
    }
    if (currentUser?.role === "viewer") {
      return (currentUser?.allowed_desarrollos || []).includes(proyecto._id);
    }
    return true;
  });

  // Filter sales projects based on user access
  const filteredSalesProjects = (salesProjects || []).filter((proyecto) => {
    if (currentUser?.role === "admin") return true;
    return (currentUser?.allowed_sales_projects || []).includes(proyecto._id);
  });

  // Derive current project from URL params
  const currentProject = filteredProjects.find(p => p._id === proyectoId);
  const currentSalesProject = filteredSalesProjects.find(p => p._id === salesProyectoId);
  const activeProject = currentProject || currentSalesProject;
  const activeProjectType: "proyecto" | "sales" | null = currentProject
    ? "proyecto"
    : currentSalesProject
      ? "sales"
      : null;

  // Get role-appropriate menu items for regular projects
  const currentProjectMenuItems = currentUser?.role === "contratista"
    ? contratistaMenuItems
    : currentUser?.role === "finance"
      ? financeMenuItems
      : projectMenuItems;

  const getFirstMenuItem = (type: "proyecto" | "sales") => {
    if (type === "proyecto") {
      if (currentUser?.role === "contratista") return "bitacora";
      if (currentUser?.role === "finance") return "requisiciones";
      return "presupuesto";
    }
    return "presupuesto";
  };

  const handleProjectSelect = (id: string, type: "proyecto" | "sales") => {
    const firstItem = getFirstMenuItem(type);
    if (type === "proyecto") {
      navigate(`/proyecto/${id}/${firstItem}`);
    } else {
      navigate(`/sales-proyecto/${id}/${firstItem}`);
    }
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
    <Sidebar collapsible="icon" className="bg-white border-r border-gray-200">
      {/* Header */}
      <SidebarHeader className="p-4 gap-3 group-data-[collapsible=icon]:p-2">

      <div className="flex space-x-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:space-x-0 group-data-[collapsible=icon]:space-y-2 group-data-[collapsible=icon]:items-center">

        {/* LOGO */}
        <img src={LOGO} className="w-4" alt="Logo" />

        {/* MENU */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="w-full data-[state=open]:bg-gray-100"
                >
                  {activeProjectType === "sales" ? (
                    <Tag className="w-4 h-4 text-gray-500 flex-shrink-0 group-data-[collapsible=icon]:w-full" />
                  ) : (
                    <Folder className="w-4 h-4 text-gray-500 flex-shrink-0 group-data-[collapsible=icon]:w-full" />
                  )}
                  <div className="flex flex-col gap-0.5 leading-none text-left group-data-[collapsible=icon]:hidden">
                    <span className="font-semibold truncate text-sm ">
                      {activeProject?.nombre || "Seleccionar Proyecto"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {activeProjectType === "sales"
                        ? "Ventas"
                        : activeProjectType === "proyecto"
                          ? "Proyecto"
                          : ""}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto w-4 h-4 text-gray-400 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="bottom"
                align="start"
                sideOffset={4}
              >
                {filteredProjects.length > 0 && (
                  <>
                    <DropdownMenuLabel>Proyectos</DropdownMenuLabel>
                    {filteredProjects.map((p) => (
                      <DropdownMenuItem
                        key={p._id}
                        onClick={() => handleProjectSelect(p._id, "proyecto")}
                        className="gap-2 p-2"
                      >
                        <Folder className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{p.nombre}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {filteredSalesProjects.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Proyectos de Ventas</DropdownMenuLabel>
                    {filteredSalesProjects.map((p) => (
                      <DropdownMenuItem
                        key={p._id}
                        onClick={() => handleProjectSelect(p._id, "sales")}
                        className="gap-2 p-2"
                      >
                        <Tag className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{p.nombre}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
        {/* Project Selector */}
        
      </SidebarHeader>

      {/* Current Project Menu Items */}
      <SidebarContent>
        {currentProject && (
          <SidebarGroup className="text-left">
            {/* <SidebarGroupLabel className="text-xs font-medium text-gray-400 px-3">
              {currentProject.nombre.toUpperCase()}
            </SidebarGroupLabel> */}
            <SidebarGroupContent>
              <SidebarMenu>
                {currentProjectMenuItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      className={cn(
                        "px-3 py-2 text-sm transition-colors",
                        item.disabled ? "text-gray-400 cursor-not-allowed" : "",
                        isActive(`/proyecto/${currentProject._id}/${item.path}`)
                          ? "text-gray-900 bg-gray-100 font-medium"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      <Link to={`/proyecto/${currentProject._id}/${item.path}`}>
                        <item.icon className="w-4 h-4" />
                        <span className="flex items-center justify-between w-full">
                          {item.label}
                          {item.id === "requisiciones" && (
                            <RequisicionNotificationDot
                              proyectoId={currentProject._id}
                              userId={currentUser?._id}
                              userRole={currentUser?.role}
                            />
                          )}
                        </span>

                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {currentSalesProject && (
          <SidebarGroup className="text-left">
            <SidebarGroupLabel className="text-xs font-medium text-gray-400 px-3">
              {currentSalesProject.nombre.toUpperCase()}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {salesProjectMenuItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      className={cn(
                        "px-3 py-2 text-sm transition-colors",
                        item.disabled ? "text-gray-400 cursor-not-allowed" : "",
                        isActive(`/sales-proyecto/${currentSalesProject._id}/${item.path}`)
                          ? "text-gray-900 bg-gray-100 font-medium"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      <Link to={`/sales-proyecto/${currentSalesProject._id}/${item.path}`}>
                        <item.icon className="w-4 h-4" />
                        <span className="flex items-center justify-between w-full">
                          {item.label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Bottom Menu - Only show for authenticated admin users */}
      {isAuthenticated && !authLoading && currentUser?.role === "admin" && (
        <SidebarFooter className="border-t border-gray-200 p-2 mt-6">
          {/* <SidebarMenu className="space-y-1">
            {bottomProjectMenuItems.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.label}
                    className={cn(
                      "px-3 py-2 text-sm rounded-lg transition-colors",
                      isActive(item.path)
                        ? "text-gray-900 bg-gray-100 font-medium"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Link to={item.path}>
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          <SidebarSeparator />
          <SidebarMenu className="space-y-1">
            {bottomSalesMenuItems.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.label}
                    className={cn(
                      "px-3 py-2 text-sm rounded-lg transition-colors",
                      isActive(item.path)
                        ? "text-gray-900 bg-gray-100 font-medium"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Link to={item.path}>
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>

          <SidebarSeparator /> */}

          {/* User card with dropdown */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarUserCard role={currentUser?.role} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}

      {/* Footer for non-admin authenticated users — just user card */}
      {isAuthenticated && !authLoading && currentUser?.role !== "admin" && (
        <SidebarFooter className="border-t border-gray-200 p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarUserCard role={currentUser?.role} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}

      {/* Unauthenticated footer */}
      {!isAuthenticated && !authLoading && (
        <SidebarFooter className="border-t border-gray-200 p-4">
          <Unauthenticated>
            <SignInButton mode="modal" />
          </Unauthenticated>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
