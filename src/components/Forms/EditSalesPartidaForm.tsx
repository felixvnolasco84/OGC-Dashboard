"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { Doc } from "../../../convex/_generated/dataModel";
import { DialogFooter } from "../ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";

type RequestFormProps = {
  partida: Doc<"sales_partidas">;
  level?: number; // 0 = partida/unidad, 1 = familia, 2 = sub_partida
  onClose?: () => void;
};

export default function EditSalesPartidaForm({ partida, level = 2, onClose }: RequestFormProps) {

  const update = useMutation(api.sales_partidas.update);

  const FormSchema = z.object({
    nombre: z.string().min(1, "El nombre es requerido"),
    familia: z.string(),
    sub_partida: z.string(),
    unidad: z.string(),
    cantidad: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    precio_unitario: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    presupuesto_original: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    presupuesto_aprobado: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    pagado: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: "onChange", // Validate on change to enable real-time validation
    defaultValues: {
      nombre: partida.nombre,
      familia: partida.familia,
      sub_partida: partida.sub_partida,
      unidad: partida.unidad,
      cantidad: partida.cantidad,
      precio_unitario: partida.precio_unitario,
      presupuesto_original: partida.presupuesto_original,
      presupuesto_aprobado: partida.presupuesto_aprobado,
      pagado: partida.pagado,
    },
  });

  const handleUpdate = (data: z.infer<typeof FormSchema>) => {
    if (!partida.sales_proyecto) {
      toast.error("Error: Proyecto de venta no encontrado");
      return;
    }

    const promise = update({
      id: partida._id,
      nivel: partida.nivel,
      nombre: data.nombre,
      familia: data.familia,
      sub_partida: data.sub_partida,
      partida_nombre: partida.partida_nombre,
      unidad: data.unidad,
      cantidad: data.cantidad,
      precio_unitario: data.precio_unitario,
      presupuesto_original: data.presupuesto_original,
      presupuesto_aprobado: data.presupuesto_aprobado,
      pagado: data.pagado,
      archivo_origen: partida.archivo_origen,
      sales_proyecto: partida.sales_proyecto,
    });

    toast.promise(promise, {
      loading: "Actualizando partida...",
      success: () => {
        onClose?.();
        setIsLoading(false);
        return "Partida actualizada.";
      },
      error: "Error al actualizar la partida.",
    });
  };

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    handleUpdate(data);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-2">
          <div className="grid gap-4 max-h-[60vh] overflow-y-auto pr-2">
            {/* Hierarchy Fields */}
            <div className="space-y-2 mb-2">
              <p className="text-xs text-muted-foreground">
                Editando: <span className="font-medium">{level === 0 ? 'Unidad' : level === 1 ? 'Familia' : 'Sub-partida'}</span>
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <FormField
                control={form.control}
                name="nombre"
                defaultValue={partida.nombre}
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Unidad</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nombre de unidad"
                        className="bg-gray-100"
                        disabled={true}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {
                level >= 1 && (
                  <FormField
                    control={form.control}
                    name="familia"
                    render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Familia</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Familia"
                        className="bg-gray-100"
                        disabled={true}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            </div>

            {
              level === 2 && (
                <FormField
                control={form.control}
                name="sub_partida"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Sub Partida</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Sub partida"
                        className="bg-gray-100"
                        disabled={true}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )
            }



            {/* Quantity and Pricing */}
            {/* <div className="border-t pt-4 mt-2">
              <h3 className="text-sm font-medium mb-3">Información de costos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="unidad"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Unidad</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="m², kg, etc."
                          className={level < 2 ? "bg-gray-100" : "bg-white"}
                          disabled={level < 2 || isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cantidad"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Cantidad</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          type="number"
                          step="0.01"
                          className={level < 2 ? "bg-gray-100" : "bg-white"}
                          disabled={level < 2 || isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="precio_unitario"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Precio Unitario</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          className={level < 2 ? "bg-gray-100" : "bg-white"}
                          disabled={level < 2 || isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div> */}

            {/* Budget Status */}
            <div className="border-t pt-4 mt-2">
              <h3 className="text-sm font-medium mb-3">Estado presupuestal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="presupuesto_original"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Total Ventas</FormLabel>
                      <FormControl>
                        <MoneyInput
                          placeholder="0.00"
                          className="bg-gray-100"
                          disabled={true}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="presupuesto_aprobado"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Vendido</FormLabel>
                      <FormControl>
                        <MoneyInput
                          placeholder="0.00"
                          className="bg-white"
                          disabled={isLoading}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pagado"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Pagado</FormLabel>
                      <FormControl>
                        <MoneyInput
                          placeholder="0.00"
                          className="bg-gray-100"
                          disabled={true}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

          </div>
          <DialogFooter className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
            </DialogClose>
            {isLoading ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <Button 
                type="submit" 
                disabled={isLoading}
              >
                Actualizar
              </Button>
            )}
          </DialogFooter>
        </div>
      </form>
    </Form>
  );
}
