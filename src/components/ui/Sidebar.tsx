import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import Logo from "../../../public/OGC-LOGO.svg";

import {
  Search,
  Folder,
  ChevronDown,
  ChevronRight,
  Paperclip,
  ChartArea,
  ChartBar,
  File,
  Building,
  IdCard,
  Car
} from "lucide-react";
import { useDesarrolloStore } from "@/hooks/use-desarrollo-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


interface SidebarItem {
  id: string;
  label: string;
  path: string;
  icon?: React.ReactNode;
  isDisabled?: boolean;
}

const aloneItems: SidebarItem[] = [
  {
    id: "dashboard",
    label: "Proyectos",
    path: "/proyectos-tabla",
    icon: <Building className="w-4 h-4" />,
    isDisabled: false
  },
  {
    id: "pagos",
    label: "Pagos",
    path: "/pagos",
    icon: <IdCard className="w-4 h-4" />,
    isDisabled: false
  },
  {
    id: "proveedores",
    label: "Proveedores",
    path: "/proveedores",
    icon: <Car className="w-4 h-4" />,
    isDisabled: false
  }
];

const sidebarItems: SidebarItem[] = [
  {
    id: "presupuesto",
    label: "Presupuesto",
    path: "/dashboard/presupuesto",
    icon: <Paperclip className="w-4 h-4" />
  },
  {
    id: "documentos",
    label: "Documentos",
    path: "/dashboard/documentos",
    icon: <File className="w-4 h-4" />,
    isDisabled: false
  },

  {
    id: "control",
    label: "Control",
    path: "/dashboard/control",
    icon: <ChartArea className="w-4 h-4" />,
    isDisabled: true
  },
  {
    id: "programa-obra",
    label: "Programa",
    path: "/dashboard/programa-obra",
    icon: <ChartBar className="w-4 h-4" />,
    isDisabled: true
  },
];



export default function Sidebar() {
  const location = useLocation();
  const { selectedDesarrollo, setSelectedDesarrollo } = useDesarrolloStore();
  const desarrollos = useQuery(api.desarrollos.getAll);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isProjectExpanded, setIsProjectExpanded] = useState(true);

  // Filter navigation items based on search query
  const filteredItems = sidebarItems.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter projects based on search query
  const filteredProjects = desarrollos?.filter((proyecto) =>
    proyecto.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Auto-expand project section when searching
  useEffect(() => {
    if (searchQuery.trim() !== "" && filteredItems.length > 0) {
      setIsProjectExpanded(true);
    }
  }, [searchQuery, filteredItems.length]);

  // Auto-select first desarrollo if none is selected
  useEffect(() => {
    if (desarrollos && desarrollos.length > 0 && !selectedDesarrollo) {
      setSelectedDesarrollo(desarrollos[0]);
    }
  }, [desarrollos, selectedDesarrollo, setSelectedDesarrollo]);

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 z-10 flex flex-col items-start">
      {/* Header with collapse toggle */}
      <div className="pl-4 pt-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-10 h-10 p-0"
        >
          <img src={Logo} alt="Logo" className="w-10 h-10" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto w-full">
        {/* Search Bar */}
        <div className="p-4 pb-0 pl-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-none text-sm h-10 shadow-none focus-visible:ring-gray-100"
            />
          </div>
        </div>

        {/* Project Selector with Collapsible Section */}
        <div className="px-2 pb-4">
          {/* Search Results for Projects - shown when searching */}
          {searchQuery.trim() !== "" && filteredProjects.length > 0 && filteredProjects.length !== desarrollos?.length && (
            <div className="mt-3   mb-3 space-y-2">
              <div className="text-sm font-medium text-gray-500 px-2 text-left">Proyectos</div>
              {filteredProjects.map((proyecto) => (
                <button
                  key={proyecto._id}
                  onClick={() => {
                    setSelectedDesarrollo(proyecto);
                    setSearchQuery("");
                    setIsProjectExpanded(true);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-3 rounded-sm text-left text-sm transition-colors",
                    selectedDesarrollo?._id === proyecto._id
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{proyecto.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {/* Collapsible Project Section */}
          <div className="bg-gray-100 rounded-sm">
            <div className="px-2 pt-1.5 pb-2">
              <Button
                onClick={() => setIsProjectExpanded(!isProjectExpanded)}
                size={"sm"}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-200  transition-colors bg-white  shadow-none rounded-sm m-0"
              >
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-medium text-gray-900 truncate text-wrap">
                    {selectedDesarrollo?.nombre.slice(0, 20) + "..." || "Seleccionar proyecto"}
                  </span>
                </div>
                {isProjectExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
                )}
              </Button>
            </div>


            {/* Navigation Items - Nested under project */}
            {isProjectExpanded && selectedDesarrollo && (
              <nav className="px-2 pb-2 space-y-1">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    item.isDisabled ? (
                      <div
                        key={item.id}
                        className="flex items-center space-x-2 px-3 py-2 text-sm font-normal transition-colors rounded text-gray-400"
                      >
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <Link
                        key={item.id}
                        to={item.path}
                        className={cn(
                          "flex items-center space-x-2 px-3 py-2 text-sm font-normal transition-colors rounded",
                          isActive(item.path)
                            ? "text-gray-900 font-medium"
                            : "text-gray-400 hover:text-gray-600"
                        )}
                      >
                        <span>{item.label}</span>
                      </Link>
                    )
                  ))
                ) : searchQuery.trim() !== "" ? (
                  <div className="px-3 py-2 text-sm text-gray-400 text-center">
                    Sin resultados
                  </div>
                ) : null}
              </nav>
            )}

          </div>
          {
            aloneItems.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={cn(
                  "flex items-center space-x-2 px-3 py-2 text-sm font-normal transition-colors rounded",
                  isActive(item.path)
                    ? "text-gray-900 font-medium"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                <span>{item.label}</span>
              </Link>
            ))
          }
        </div>
      </div>
    </div>
  );
}
