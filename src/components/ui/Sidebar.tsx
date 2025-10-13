import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  // Home,
  // Search,
  Building2,
  Paperclip,
  ChartArea,
  ChartBar,
  File,
  Building
} from "lucide-react";
import { useDesarrolloStore } from "@/hooks/use-desarrollo-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SidebarItem {
  id: string;
  label: string;
  path: string;
  icon?: React.ReactNode;
}

const sidebarItems: SidebarItem[] = [
  // {
  //   id: "dashboard",
  //   label: "Dashboard",
  //   path: "/",
  //   icon: <Home className="w-4 h-4" />
  // },
  {
    id: "presupuesto",
    label: "Presupuesto",
    path: "/dashboard/presupuesto",
    icon: <Paperclip className="w-4 h-4" />
  },
  {
    id: "control",
    label: "Control",
    path: "/dashboard/control",
    icon: <ChartArea className="w-4 h-4" />
  },
  {
    id: "programa-obra",
    label: "Programa de obra",
    path: "/dashboard/programa-obra",
    icon: <ChartBar className="w-4 h-4" />
  },
  {
    id: "documentos",
    label: "Documentos",
    path: "/dashboard/documentos",
    icon: <File className="w-4 h-4" />
  },
  {
    id: "proyectos",
    label: "Proyectos",
    path: "/proyectos",
    icon: <Building className="w-4 h-4" />
  },
];



export default function Sidebar() {
  const location = useLocation();
  const { selectedDesarrollo, setSelectedDesarrollo } = useDesarrolloStore();
  const desarrollos = useQuery(api.desarrollos.getAll);

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
    <div className="w-64 bg-gray-50 border-r border-gray-200 h-screen fixed left-0 top-0 z-10">
      <div className="p-6">
        {/* Proyecto Selector */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <Building2 className="w-3 h-3" />
            <span>Proyecto</span>
          </div>
          <Select
            value={selectedDesarrollo?._id}
            onValueChange={(value) => {
              const desarrollo = desarrollos?.find((d) => d._id === value);
              if (desarrollo) {
                setSelectedDesarrollo(desarrollo);
              }
            }}
          >
            <SelectTrigger className="w-full bg-white border-gray-300 text-sm">
              <SelectValue placeholder="Seleccionar proyecto">
                {selectedDesarrollo ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {selectedDesarrollo.nombre}
                    </span>
                  </div>
                ) : (
                  "Seleccionar proyecto"
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {desarrollos?.map((desarrollo) => (
                <SelectItem key={desarrollo._id} value={desarrollo._id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{desarrollo.nombre}</span>
                    <span className="text-xs text-gray-500 truncate">
                      {desarrollo.descripcion}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Navigation */}
        <nav className="space-y-2">
          {sidebarItems.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                "flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive(item.path)
                  ? "bg-gray-200 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {item.icon && (
                <span className="text-gray-500">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
