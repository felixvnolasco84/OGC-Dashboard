import React from "react";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { Home, Search } from "lucide-react";

interface SidebarItem {
  id: string;
  label: string;
  path: string;
  icon?: React.ReactNode;
}

const sidebarItems: SidebarItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/",
    icon: <Home className="w-4 h-4" />
  },
  {
    id: "proyectos",
    label: "Proyectos",
    path: "/proyectos",
    icon: <Search className="w-4 h-4" />
  },
  {
    id: "documentos",
    label: "Documentos",
    path: "/dashboard/documentos"
  },
  {
    id: "presupuesto",
    label: "Presupuesto",
    path: "/dashboard/presupuesto"
  },
  // {
  //   id: "control",
  //   label: "Control",
  //   path: "/dashboard/costos"
  // },
  {
    id: "control",
    label: "Control",
    path: "/dashboard/control"
  },
  {
    id: "programa-obra",
    label: "Programa de obra",
    path: "/dashboard/programa-obra"
  }
];

export default function Sidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 h-screen fixed left-0 top-0 z-10">
      <div className="p-6">
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
