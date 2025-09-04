import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";

const ContactSection = () => {
  const form = useForm({
    defaultValues: {
      nombre: "",
      apellidos: "",
      email: "",
      telefono: "",
      residencia: "para_mis_papas", // Opción por defecto
      mensaje: "",
    },
  });
  
const onSubmit = async (dataValues: {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  residencia: string;
  mensaje: string;
}) => {
  const response = await fetch(
    "http://localhost:5069/api/send-email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataValues),
    }
  );
  const data = await response.json();
  alert(data.message);
};
  return (
    <section
      id="contacto"
      className="mx-auto w-full max-w-7xl px-4 py-16 md:px-8 md:py-24 lg:px-14"
    >
      {/* Encabezado y Título */}
      <div className="mb-12 text-center md:mb-16">
        <h3 className="poppins mb-6 text-sm font-semibold uppercase tracking-wider text-[#6D6D6D]">
          Contacto
        </h3>
        <h2 className="mb-4 text-3xl font-light text-blue-800 md:text-4xl lg:text-6xl">
          Vivir plenamente
          <br />
          es saber que nunca estás solo.
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-lg text-[#6D6D6D] lg:mt-4">
          Próxima apertura en enero 2026.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[#6D6D6D] lg:mt-4">
          Si estás interesado en formar parte de nuestra comunidad, <br />{" "}
          déjanos tus datos y en breve nos pondremos en contacto contigo.
        </p>
      </div>

      {/* Formulario */}
      <div className="mx-auto max-w-7xl">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2"
          >
            {/* Columna izquierda */}
            <div className="space-y-6 text-left">
              {/* Nombre */}
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="poppins text-sm font-semibold uppercase tracking-wider text-[#6D6D6D]">
                      Nombre
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="rounded-none border-b border-l-0 border-r-0 border-t-0 border-gray-300 px-0 focus-visible:border-blue-800 focus-visible:ring-0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Apellidos */}
              <FormField
                control={form.control}
                name="apellidos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="poppins text-sm font-semibold uppercase tracking-wider text-[#6D6D6D]">
                      Apellidos
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="rounded-none border-b border-l-0 border-r-0 border-t-0 border-gray-300 px-0 focus-visible:border-blue-800 focus-visible:ring-0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Correo Electrónico */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="poppins text-sm font-semibold uppercase tracking-wider text-[#6D6D6D]">
                      Correo Electrónico
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        className="rounded-none border-b border-l-0 border-r-0 border-t-0 border-gray-300 px-0 focus-visible:border-blue-800 focus-visible:ring-0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Teléfono */}
              <FormField
                control={form.control}
                name="telefono"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="poppins text-sm font-semibold uppercase tracking-wider text-[#6D6D6D]">
                      Teléfono
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        className="rounded-none border-b border-l-0 border-r-0 border-t-0 border-gray-300 px-0 shadow-none focus-visible:border-blue-800 focus-visible:ring-0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Columna derecha */}
            <div className="space-y-6 text-left">
              {/* Opciones de Residencia */}
              <div>
                <h4 className="poppins mb-4 text-sm font-semibold uppercase tracking-wider text-[#6D6D6D]">
                  Residencia
                </h4>
                <FormField
                  control={form.control}
                  name="residencia"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1 sm:flex-row sm:space-x-6 sm:space-y-0"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem
                                value="para_mi"
                                id="para_mi"
                                className="h-6 w-6 border border-[#C6C6C6] text-blue-800"
                              />
                            </FormControl>
                            <Label htmlFor="para_mi" className="font-normal">
                              Para mí
                            </Label>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem
                                value="para_mis_papas"
                                id="para_mis_papas"
                                className="h-6 w-6 border border-[#C6C6C6] text-blue-800"
                              />
                            </FormControl>
                            <Label
                              htmlFor="para_mis_papas"
                              className="font-normal"
                            >
                              Para mis papás
                            </Label>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem
                                value="otros"
                                id="otros"
                                className="h-6 w-6 border border-[#C6C6C6] text-blue-800"
                              />
                            </FormControl>
                            <Label htmlFor="otros" className="font-normal">
                              Otros
                            </Label>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Mensaje */}
              <FormField
                control={form.control}
                name="mensaje"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="poppins text-sm font-semibold uppercase tracking-wider text-[#6D6D6D]">
                      Mensaje
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={8}
                        className="resize-none rounded-md border focus-visible:border-blue-800 focus-visible:ring-0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Botón Enviar - Span en ambas columnas en móvil */}
            <div className="mt-4 flex justify-center md:col-span-2">
              <Button
                type="submit"
                className="w-full rounded-full bg-blue-800 px-12 py-3 text-sm font-medium uppercase tracking-wider text-white transition-colors duration-300 hover:bg-blue-900 lg:w-fit"
              >
                Enviar
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </section>
  );
};

export default ContactSection;
