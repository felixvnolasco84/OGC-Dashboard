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
  partida: Doc<"partidas">;
  level?: number; // 0 = partida, 1 = familia, 2 = sub_partida
  onClose?: () => void;
};

export default function EditPartidaForm({ partida, level = 2, onClose }: RequestFormProps) {


  const update = useMutation(api.partida.update);

  const FormSchema = z.object({
    nombre: z.string().min(1, "El nombre es requerido"),
    familia: z.string(),
    sub_partida: z.string(),
    Cantidad: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    PrecioUnitario: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    Subtotal: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    Iva: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    total: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    aprobado: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    pagado: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    por_liquidar: z.number().refine((val) => !isNaN(Number(val)) && Number(val) != 0, {
      message: "Debe ser un número válido mayor o igual a 0",
    }),
    actual: z.number().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
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
      Cantidad: partida.Cantidad,
      PrecioUnitario: partida.PrecioUnitario,
      Subtotal: partida.Subtotal,
      Iva: partida.Iva,
      total: partida.total,
      aprobado: partida.aprobado,
      pagado: partida.pagado,
      por_liquidar: partida.por_liquidar,
      actual: partida.actual,
    },
  });

  const handleUpdate = (data: z.infer<typeof FormSchema>) => {
    const promise = update({
      id: partida._id,
      nombre: data.nombre,
      familia: data.familia,
      sub_partida: data.sub_partida,
      Cantidad: data.Cantidad,
      PrecioUnitario: data.PrecioUnitario,
      Subtotal: data.Subtotal,
      Iva: data.Iva,
      total: data.total,
      aprobado: data.aprobado,
      pagado: data.pagado,
      por_liquidar: data.por_liquidar,
      actual: data.actual,
      fecha_carga: partida.fecha_carga,
      archivo_origen: partida.archivo_origen,
    });

    toast.promise(promise, {
      loading: "Actualizando partida...",
      success: () => {
        onClose?.();
        setIsLoading(false);
        return "Partida actualizada.";
      },
      error: "Error al actualizar el costo.",
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
                Editando: <span className="font-medium">{level === 0 ? 'Partida' : level === 1 ? 'Familia' : 'Sub-partida'}</span>
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <FormField
                control={form.control}
                name="nombre"
                defaultValue={partida.nombre}
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Partida</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nombre de partida"
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
            <div className="border-t pt-4 mt-2">
              <h3 className="text-sm font-medium mb-3">Información de costos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="Cantidad"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Cantidad</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          type="text"
                          inputMode="decimal"
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
                  name="PrecioUnitario"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Precio Unitario</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0.00"
                          type="text"
                          inputMode="decimal"
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
                  name="Subtotal"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Subtotal</FormLabel>
                      <FormControl>
                        <MoneyInput
                          placeholder="0.00"
                          className={level < 2 ? "bg-gray-100" : "bg-white"}
                          disabled={level < 2 || isLoading}
                          value={field.value}
                          onChange={(value) => field.onChange(value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="Iva"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>IVA</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0.00"
                          type="text"
                          inputMode="decimal"
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
                  name="total"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Total</FormLabel>
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
              </div>
            </div>

            {/* Budget Status */}
            <div className="border-t pt-4 mt-2">
              <h3 className="text-sm font-medium mb-3">Estado presupuestal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="aprobado"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Presupuesto Aprobado</FormLabel>
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

                <FormField
                  control={form.control}
                  name="por_liquidar"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Por Liquidar</FormLabel>
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
                  name="actual"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel>Actual</FormLabel>
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
