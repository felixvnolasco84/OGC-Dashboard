import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Id } from "convex/_generated/dataModel";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const desarrollos = [
  {
    id: "torre-i",
    nombre: 'Torre I',
  },
  {
    id: "torre-h",
    nombre: 'Torre H',
  },
  {
    id: "torre-j",
    nombre: 'Torre J',
  },
]

export const families: string[] = [
  'ACERO',
  'AGREGADOS',
  'AIRE_ACONDICIONADO',
  'CANCELERÍA',
  'CARPINTERÍA',
  'CEMENTANTES',
  'CIMBRA',
  'COCINA',
  'CONCRETOS',
  'CONSUMIBLES'
 ]
  

 export type  partida = {
  _id: Id<"partidas">;
  nombre: string;
  familia: string;
  sub_partida: string;
  Cantidad: string;
  PrecioUnitario: string;
  Subtotal: string;
  Iva: string;
  total: string;
  aprobado: string;
  pagado: string;
  por_liquidar: string;
  actual: string;
  fecha_carga: string;
  archivo_origen: string;
 }
