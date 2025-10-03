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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { Doc } from "../../../convex/_generated/dataModel";
import { DialogFooter } from "../ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";

type RequestFormProps = {
  partida: Doc<"partidas">;
  onClose?: () => void;
};

export default function EditPartidaForm({ partida, onClose }: RequestFormProps) {

  console.log(partida);
  
  const update = useMutation(api.partida.update);

  const FormSchema = z.object({
    nombre: z.string(),
    familia: z.string(),
    sub_partida: z.string(),
    Cantidad: z.string(),
    PrecioUnitario: z.string(),
    Subtotal: z.string(),
    Iva: z.string(),
    total: z.string(),
    aprobado: z.string(),
    pagado: z.string(),
    por_liquidar: z.string(),
    actual: z.string(),
    fecha_carga: z.string(),
    archivo_origen: z.string(),
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
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
      fecha_carga: partida.fecha_carga,
      archivo_origen: partida.archivo_origen,
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
      fecha_carga: data.fecha_carga,
      archivo_origen: data.archivo_origen,
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
          <div className="grid gap-4">
            <div className="grid w-full items-center gap-1.5">
              <FormField
                control={form.control}
                name="nombre"
                defaultValue={partida.nombre}
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Nombre</FormLabel>
                    <FormDescription></FormDescription>
                    <FormControl>
                      <Input                      
                        placeholder={field.value}
                        className="resize-none bg-transparent py-0"
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect="off"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid w-full items-center gap-1.5">
              <FormField
                control={form.control}
                name="sub_partida"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Sub Partida</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={field.value}
                        className="resize-none bg-transparent py-0"
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect="off"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid w-full items-center gap-1.5">
              <FormField
                control={form.control}
                name="Cantidad"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={field.value}
                        className="resize-none bg-transparent py-0"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}

              />
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
              <Button type="submit" disabled={isLoading}>Actualizar</Button>
            )}
          </DialogFooter>
        </div>
      </form>
    </Form>
  );
}
