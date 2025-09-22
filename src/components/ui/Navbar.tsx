import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { NavLink } from "react-router";
import MenuMobile from "./MenuMobile";

export default function Navbar() {
  
  return (
    <div className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <header className="px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <NavLink to="/">
            <h1 className="text-xl font-bold text-gray-900">OGC</h1>
          </NavLink>
          <NavigationMenu>
            <NavigationMenuList className="hidden lg:flex">
              <NavigationMenuItem className="flex gap-4">
                  {/* <NavLink
                    to="/dashboard"
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Dashboard
                  </NavLink> */}
                  <NavLink
                    to="/"
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Dashboard
                  </NavLink>
                  <NavLink
                    to="/dashboard/costos"
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Costos
                  </NavLink>
                </NavigationMenuItem>
            </NavigationMenuList>
            <MenuMobile />
          </NavigationMenu>
        </div>
      </header>
    </div>
  );
}
