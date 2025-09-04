"use client";

import { useSearch } from "@/hooks/use-search";
import { Search } from "lucide-react";

export default function SearchInput() {
  const toggle = useSearch((store) => store.toggle);
  return (
    <Search className="transistion-all mr-4 cursor-pointer duration-300 hover:text-gray-600 lg:mr-0" onClick={() => toggle()} />
    // <Input
    //   className="focus-visible:ring-transparent"
    //   onClick={() => toggle()}
    //   placeholder="Buscar Proyectos..."
    // ></Input>
  );
}
