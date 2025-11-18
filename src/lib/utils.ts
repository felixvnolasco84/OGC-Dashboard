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


export type partida = {
  _id: Id<"partidas">;
  nombre: string;
  familia: string;
  sub_partida: string;
  partida_nombre: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  presupuesto_aprobado: number;
  presupuesto_original: number;
  pagado: number;
}


export function formatNumber(number: number, proyectoId?: string) {
  // Legacy function - kept for backward compatibility
  // Uses MXN as default, except for specific sales project
  const isSalesProject = proyectoId === "jh7c61q0zx890z88wz52gejtxx7vcm66";
  return formatCurrency(number, isSalesProject ? "MXN" : "MXN");
}

export function formatCurrency(amount: number, currency: string = "MXN") {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyCompact(amount: number, currency: string = "MXN") {

  if (currency === "USD") {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } else {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}
