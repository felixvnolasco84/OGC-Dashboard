import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { NavLink } from "react-router";
import MenuMobile from "./MenuMobile";

export default function Navbar() {
  
  return (
    <div className="sticky top-0 z-40 grid">
      <header className="bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <NavLink to="/">
            <h1>OGC</h1>
          </NavLink>
          <NavigationMenu>
            <NavigationMenuList className="hidden lg:flex">
              <NavigationMenuItem>
                  <NavLink
                    to="/dashboard"
                  >
                    Dashboard
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
