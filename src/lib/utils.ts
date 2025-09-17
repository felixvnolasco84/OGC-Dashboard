import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Doc, Id } from "convex/_generated/dataModel";

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


export type costo = {
  _id: Id<"costos">;
  administracion: string;
  partida: string;
  familia: string;
  sub_partida: string;
  monto: string;
  fecha: string;
  codigo_referencia: string;
  factura: string;
}

export const informacion_facturacion_pago: Doc<"informacion_facturacion_pago">[] = [
  {
    _id: "payment_1" as Id<"informacion_facturacion_pago">,
    _creationTime: Date.now(),
    calle: "3199 Wayback Lane",
    colonia: "Huntington Station",
    municipio: "Huntington Station",
    estado: "New York",
    codigo_postal: "11746",
    rfc: "RFC 1",
    razon_social: "Razon Social 1",
    telefono: "1234567890",
    correo: "correo@correo.com",
  },
  {
    _id: "payment_2" as Id<"informacion_facturacion_pago">,
    _creationTime: Date.now(),
    calle: "3199 Wayback Lane",
    colonia: "Huntington Station",
    municipio: "Huntington Station",
    estado: "New York",
    codigo_postal: "11746",
    rfc: "RFC 2",
    razon_social: "Razon Social 2",
    telefono: "1234567890",
    correo: "correo@correo.com",
  },
  {
    _id: "payment_3" as Id<"informacion_facturacion_pago">,
    _creationTime: Date.now(),
    calle: "3199 Wayback Lane",
    colonia: "Huntington Station",
    municipio: "Huntington Station",
    estado: "New York",
    codigo_postal: "11746",
    rfc: "RFC 3",
    razon_social: "Razon Social 3",
    telefono: "1234567890",
    correo: "correo@correo.com",
  },
]