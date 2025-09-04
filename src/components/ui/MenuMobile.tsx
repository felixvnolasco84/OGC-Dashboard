"use client";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";


import { MdMenu } from "react-icons/md";
import { NavLink } from "react-router";
import { Button } from "./button";
import { NavigationMenuItem, NavigationMenuList } from "./navigation-menu";

export default function MenuMobile() {
  const scrollToSection = (id: string) => {
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth" });
  };

  const links: { title: string; id: string; href: string }[] = [
    {
      title: "Dashboard",
      id: "dashboard",
      href: "/dashboard",
    },
  ];

  return (
    <Sheet>
      <SheetTrigger className="flex lg:hidden" asChild>
        <Button
          variant={"ghost"}
          size={"icon"}
          className="rounded-md bg-gray-500 text-white"
          aria-label="Open menu"
        >
          <MdMenu className="h-6 w-6" />
        </Button>
      </SheetTrigger>

      <SheetContent side={"left"}>
        <nav className="pl-4" id="mobile-menu-2">
          <ul className="list-inside space-y-4 pl-4">
            <NavLink onClick={() => scrollToSection("dashboard")} to="/dashboard">
              <SheetClose>
                OGC
              </SheetClose>
            </NavLink>

            <NavigationMenuList className="flex w-full flex-col space-y-4">
              {links.map((link) => (
                <NavigationMenuItem className="w-full" key={link.title}>
                  <NavLink
                    onClick={() => scrollToSection(link.id)}
                    to={link.href}
                  >
                    <SheetClose className="text-xl">Dashboard</SheetClose>
                  </NavLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
