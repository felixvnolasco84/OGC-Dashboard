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
  cost: Doc<"costos">;
  onClose?: () => void;
};

export default function EditCostForm({ cost, onClose }: RequestFormProps) {
  const update = useMutation(api.costos.update);

  const FormSchema = z.object({
    administracion: z.string(),
    familia: z.string(),
    partida: z.string(),
    sub_partida: z.string(),
    monto: z.string(),
    fecha: z.string(),
    codigo_referencia: z.string(),
    factura: z.string(),
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      administracion: cost.administracion,
      familia: cost.familia,
      partida: cost.partida,
      sub_partida: cost.sub_partida,
      monto: cost.monto,
      fecha: cost.fecha,
      codigo_referencia: cost.codigo_referencia,
      factura: cost.factura,
    },
  });

  const handleUpdate = (data: z.infer<typeof FormSchema>) => {
    const promise = update({
      id: cost._id,
      administracion: data.administracion,
      familia: data.familia,
      partida: data.partida,
      sub_partida: data.sub_partida,
      monto: data.monto,
      fecha: data.fecha,
      codigo_referencia: data.codigo_referencia,
      factura: data.factura,
    });

    toast.promise(promise, {
      loading: "Actualizando costo...",
      success: () => {
        onClose?.();
        setIsLoading(false);
        return "Costo actualizado.";
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

            {/* <div className="grid w-full items-center gap-1.5">
              <FormField
                control={form.control}
                name="administracion"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Administración</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="jhon@doe.com"
                        className="resize-none bg-transparent py-0"
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect="off"
                        disabled={isLoading}
                        {...field}
                      ></Input>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div> */}
            <div className="grid w-full items-center gap-1.5">
              <FormField
                control={form.control}
                name="familia"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Familia</FormLabel>
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
                name="monto"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Monto</FormLabel>
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
