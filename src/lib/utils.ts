import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
  