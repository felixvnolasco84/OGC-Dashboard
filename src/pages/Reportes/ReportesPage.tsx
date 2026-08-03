import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  CalendarClock,
  ChevronDown,
  Download,
  FileText,
  Info,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  allowedSectionsForRole,
  profileForRole,
  REPORT_SECTION_LABELS,
  type ReportFrequency,
  type ReportSection,
  type ReportVisibilityProfile,
} from "../../../convex/reportTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ReportTab = "generar" | "programaciones" | "historial";

type ReportRecipient = {
  user_id: Id<"users">;
  name: string;
  email: string;
  role: string;
  profile: ReportVisibilityProfile;
};

const STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  generating: "Generando",
  completed: "Completado",
  warning: "Con advertencias",
  partial: "Parcial",
  failed: "Fallido",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  queued: "#ADADAD",
  generating: "#76AFD9",
  completed: "#50AC66",
  warning: "#ADADAD",
  partial: "#76AFD9",
  failed: "#E75F79",
};

const SECTION_DESCRIPTIONS: Record<ReportSection, string> = {
  executive:
    "KPIs principales, alertas prioritarias, tendencias e iniciativas recomendadas.",
  financial:
    "Presupuesto original y aprobado, gasto, saldo, ingresos, pagos y compromisos.",
  earned_value:
    "Avance físico y planeado, PV, EV, AC, CPI, SPI, EAC, ETC y variación al cierre.",
  cashflow:
    "Curva de gasto real contra proyección semanal y desviación acumulada.",
  variances:
    "Partidas con mayor desviación y concentración del gasto del proyecto.",
  requisitions:
    "Revisión, pago, entrega, vencimientos y montos comprometidos de requisiciones.",
  program:
    "Avance del programa, actividades atrasadas y comparación físico-planeado.",
  logbook:
    "Resumen sanitizado de registros e incidencias de Bitácora dentro del periodo.",
  data_quality:
    "Fechas, ponderaciones, presupuestos, monedas y proyecciones que requieren atención.",
};

const PROFILE_DETAILS: Record<
  ReportVisibilityProfile,
  { label: string; description: string }
> = {
  full: {
    label: "Completo",
    description:
      "Puede incluir presupuesto, control, flujo, valor ganado, requisiciones, programa y Bitácora.",
  },
  viewer: {
    label: "Consulta",
    description:
      "Incluye Presupuesto, Control, Programa y un resumen de Bitácora, sin detalle transaccional.",
  },
  finance: {
    label: "Finanzas",
    description:
      "Incluye requisiciones, pagos y entregas agregadas, sin datos bancarios ni presupuesto global.",
  },
  contractor: {
    label: "Contratista",
    description:
      "Incluye Bitácora y estatus operativo de requisiciones, sin presupuesto global ni datos bancarios.",
  },
};

const TIMEZONE_OPTIONS = [
  {
    value: "America/Mexico_City",
    label: "Ciudad de México",
    detail: "Zona Centro · CDMX, Guadalajara y centro del país",
  },
  {
    value: "America/Monterrey",
    label: "Monterrey",
    detail: "Noreste de México · Nuevo León y zona metropolitana",
  },
  {
    value: "America/Cancun",
    label: "Cancún",
    detail: "Quintana Roo · horario sin cambio estacional",
  },
  {
    value: "America/Merida",
    label: "Mérida",
    detail: "Península de Yucatán",
  },
  {
    value: "America/Chihuahua",
    label: "Chihuahua",
    detail: "Estado de Chihuahua · reglas fronterizas según localidad",
  },
  {
    value: "America/Hermosillo",
    label: "Hermosillo",
    detail: "Sonora · horario sin cambio estacional",
  },
  {
    value: "America/Mazatlan",
    label: "Mazatlán",
    detail: "Zona Pacífico · Sinaloa y Baja California Sur",
  },
  {
    value: "America/Tijuana",
    label: "Tijuana",
    detail: "Frontera noroeste · sincronizada con el Pacífico de EE. UU.",
  },
  {
    value: "America/Bogota",
    label: "Bogotá",
    detail: "Colombia y referencia UTC−05",
  },
  {
    value: "America/New_York",
    label: "Nueva York",
    detail: "Este de Estados Unidos",
  },
  {
    value: "America/Los_Angeles",
    label: "Los Ángeles",
    detail: "Pacífico de Estados Unidos",
  },
  {
    value: "UTC",
    label: "UTC",
    detail: "Tiempo universal coordinado · sin cambios estacionales",
  },
] as const;

const WEEKDAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const CONTROL_CLASS =
  "h-11 rounded-sm border-[#E6E6E6] bg-white px-4 text-sm font-normal text-gray-900 shadow-none focus:ring-[#D1D5DB]";

const OUTLINE_BUTTON_CLASS =
  "rounded-sm border-[#DBDBDB] bg-white font-normal text-[#898982] shadow-none hover:bg-[#FBFBFB] hover:text-gray-900";

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatReportDate(value: string) {
  const date = parseIsoDate(value);
  if (!date) return "Selecciona una fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getTimezoneDetail(
  timezone: string,
  fallbackDetail: string,
) {
  try {
    const now = new Date();
    const offset = new Intl.DateTimeFormat("es-MX", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")
      ?.value.replace("GMT", "UTC");
    const localTime = new Intl.DateTimeFormat("es-MX", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    return `${offset || "UTC"} · ${fallbackDetail} · hora actual ${localTime}`;
  } catch {
    return fallbackDetail;
  }
}

function ReportDatePicker({
  id,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={`${CONTROL_CLASS} w-full justify-between text-left`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#898982]" />
            <span className="truncate">{formatReportDate(value)}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#898982]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto border-[#E6E6E6] bg-white p-0 text-gray-900 shadow-xl"
      >
        <Calendar
          mode="single"
          selected={parseIsoDate(value)}
          onSelect={(date) => {
            if (!date) return;
            const next = localIsoDate(date);
            if ((min && next < min) || (max && next > max)) return;
            onChange(next);
          }}
          disabled={(date) => {
            const candidate = localIsoDate(date);
            return Boolean((min && candidate < min) || (max && candidate > max));
          }}
          classNames={{
            day_button:
              "data-[selected-single=true]:bg-gray-900 data-[selected-single=true]:text-white",
            today: "bg-[#FBFBFB] text-gray-900",
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-2 rounded-sm border-[#E6E6E6] bg-[#FBFBFB] px-2.5 py-1 font-normal text-[#898982]"
    >
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: STATUS_DOT_COLORS[status] || "#ADADAD" }}
      />
      {STATUS_LABELS[status] || status}
    </Badge>
  );
};

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultPeriod() {
  const today = new Date();
  return {
    start: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: localIsoDate(today),
  };
}

function formatCurrency(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTime(timestamp: number, timezone = "America/Mexico_City") {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(timestamp));
}

function SectionSelector({
  available,
  selected,
  onChange,
}: {
  available: ReportSection[];
  selected: ReportSection[];
  onChange: (next: ReportSection[]) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {available.map((section) => (
        <label
          key={section}
          htmlFor={`report-section-${section}`}
          className="flex cursor-pointer items-start gap-3 rounded-sm border border-[#E6E6E6] bg-[#FBFBFB] p-4 transition-colors hover:bg-[#F1F1F1]"
        >
          <Checkbox
            id={`report-section-${section}`}
            checked={selected.includes(section)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...selected, section]
                  : selected.filter((value) => value !== section),
              )
            }
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">
              {REPORT_SECTION_LABELS[section]}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#898982]">
              {SECTION_DESCRIPTIONS[section]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function ReportesPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useQuery(api.users.getCurrentUser);
  const canManageAccount = currentUser?.role === "admin";
  const projectId = proyectoId as Id<"desarrollos"> | undefined;
  const initialPeriod = useMemo(defaultPeriod, []);
  const role = currentUser?.role || "contratista";
  const currentProfile = profileForRole(role);
  const profileDetails = PROFILE_DETAILS[currentProfile];
  const availableSections = useMemo(
    () => allowedSectionsForRole(role),
    [role],
  );
  const requestedSections = useMemo(
    () => (searchParams.get("sections") || "")
      .split(",")
      .filter(Boolean) as ReportSection[],
    [searchParams],
  );
  const [tab, setTab] = useState<ReportTab>(() => {
    const requested = searchParams.get("tab");
    return requested === "programaciones" || requested === "historial"
      ? requested
      : "generar";
  });
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [frequency, setFrequency] = useState<ReportFrequency>("weekly");
  const [localTime, setLocalTime] = useState("08:00");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipientIds, setRecipientIds] = useState<Id<"users">[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (sections.length || !availableSections.length) return;
    const preselected = requestedSections.filter((section) =>
      availableSections.includes(section));
    setSections(preselected.length ? preselected : availableSections);
  }, [availableSections, requestedSections, sections.length]);

  const project = useQuery(
    api.desarrollos.getById,
    projectId ? { id: projectId } : "skip",
  );
  const preview = useQuery(
    api.reportes.getPreview,
    projectId && periodStart && periodEnd && periodEnd >= periodStart
      ? {
        proyecto: projectId,
        period_start: periodStart,
        period_end: periodEnd,
      }
      : "skip",
  );
  const recipients = useQuery(
    api.reportes.listRecipients,
    projectId ? { proyecto: projectId } : "skip",
  ) as ReportRecipient[] | undefined;
  const subscriptions = useQuery(
    api.reportes.listSubscriptions,
    projectId ? { proyecto: projectId } : "skip",
  );
  const runs = useQuery(
    api.reportes.listRuns,
    projectId ? { proyecto: projectId } : "skip",
  );
  const requestManualRun = useMutation(api.reportes.requestManualRun);
  const saveSubscription = useMutation(api.reportes.saveSubscription);
  const setSubscriptionActive = useMutation(api.reportes.setSubscriptionActive);
  const deleteSubscription = useMutation(api.reportes.deleteSubscription);
  const retryRun = useMutation(api.reportes.retryRun);
  const retryInsights = useMutation(api.reportes.retryInsights);

  useEffect(() => {
    if (!recipients?.length || recipientIds.length) return;
    const self = recipients.find((recipient) => recipient.user_id === currentUser?._id);
    if (self) setRecipientIds([self.user_id]);
  }, [currentUser?._id, recipientIds.length, recipients]);

  const changeTab = (value: string) => {
    const next = value as ReportTab;
    setTab(next);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  };

  const generateNow = async () => {
    if (!projectId || !sections.length) return;
    setIsGenerating(true);
    try {
      await requestManualRun({
        proyecto: projectId,
        period_start: periodStart,
        period_end: periodEnd,
        sections,
      });
      toast.success("Reporte en cola. Puedes seguirlo desde Historial.");
      changeTab("historial");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo solicitar el reporte");
    } finally {
      setIsGenerating(false);
    }
  };

  const scheduleReport = async () => {
    if (!projectId || !sections.length || !recipientIds.length) return;
    const [hour, minute] = localTime.split(":").map(Number);
    setIsSaving(true);
    try {
      await saveSubscription({
        proyecto: projectId,
        frequency,
        timezone,
        local_hour: hour,
        local_minute: minute,
        day_of_week: frequency === "weekly" ? dayOfWeek : undefined,
        day_of_month: frequency === "monthly" ? dayOfMonth : undefined,
        sections,
        recipient_user_ids: recipientIds,
      });
      toast.success("Programación guardada");
      changeTab("programaciones");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la programación");
    } finally {
      setIsSaving(false);
    }
  };

  if (!projectId) {
    return <div className="p-8 text-gray-500">Proyecto no válido.</div>;
  }

  return (
    <div className="min-h-screen bg-white text-left">
      <div className="border-b border-gray-200 px-6 py-8 lg:px-16">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-gray-500">Proyecto</p>
            <h1 className="mt-1 text-3xl font-normal text-gray-900">
              Reportes {project?.nombre || "Proyecto"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#898982]">
              Genera y programa reportes financieros con cifras verificables,
              análisis de IA y contenido ajustado a los permisos de cada destinatario.
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Detalles del perfil ${profileDetails.label}`}
                  className="flex h-14 w-fit cursor-help items-center gap-3 rounded-sm border border-[#DBDBDB] bg-white px-5 text-base font-normal text-[#898982] shadow-none outline-none hover:bg-[#FBFBFB] focus-visible:ring-2 focus-visible:ring-[#D1D5DB]"
                >
                  <span className="h-3 w-3 rounded-sm bg-[#50AC66]" />
                  Perfil: {profileDetails.label}
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="end"
                sideOffset={8}
                className="max-w-sm bg-gray-900 px-4 py-3 text-left text-white"
              >
                <p className="font-medium">Alcance de este perfil</p>
                <p className="mt-1 leading-5 text-gray-200">
                  {profileDetails.description}
                </p>
                <p className="mt-2 leading-5 text-gray-200">
                  {canManageAccount
                    ? "Puedes crear reportes y programarlos para otros miembros activos del proyecto."
                    : "Puedes crear reportes y suscripciones para ti; sólo un administrador puede agregar otros destinatarios."}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="space-y-8 px-6 py-8 lg:px-16">
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="flex h-auto w-full justify-start overflow-x-auto rounded-none border-b border-[#E6E6E6] bg-white p-0">
            {[
              { value: "generar", label: "Generar ahora" },
              { value: "programaciones", label: "Programaciones" },
              { value: "historial", label: "Historial" },
            ].map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="min-w-36 rounded-none border-b-2 border-transparent px-1 py-4 text-sm font-normal text-gray-600 shadow-none data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-none"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="generar" className="mt-6 space-y-6">
            <Card className="rounded-sm border-[#E6E6E6] shadow-none">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg font-normal text-gray-900">
                  Periodo y contenido
                </CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-[#898982]">
                  Define el rango del análisis y selecciona los apartados del PDF.
                  Cada opción resume debajo las métricas y hallazgos que incorporará.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="report-period-start">Desde</Label>
                    <ReportDatePicker
                      id="report-period-start"
                      value={periodStart}
                      max={periodEnd}
                      onChange={setPeriodStart}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="report-period-end">Hasta</Label>
                    <ReportDatePicker
                      id="report-period-end"
                      value={periodEnd}
                      min={periodStart}
                      onChange={setPeriodEnd}
                    />
                  </div>
                </div>
                <SectionSelector
                  available={availableSections}
                  selected={sections}
                  onChange={setSections}
                />
              </CardContent>
            </Card>

            <Card className="rounded-sm border-[#E6E6E6] shadow-none">
              <CardHeader>
                <CardTitle className="text-lg font-normal text-gray-900">
                  Vista previa de KPIs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!preview ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Calculando snapshot...
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Gasto del periodo", formatCurrency(preview.financial.period_cost, project?.moneda_principal)],
                      ["Flujo neto", formatCurrency(preview.financial.period_net_cashflow, project?.moneda_principal)],
                      ["CPI", preview.earned_value.cpi?.toFixed(2) || "N/D"],
                      ["SPI", preview.earned_value.spi?.toFixed(2) || "N/D"],
                      ["Avance físico", `${preview.program.physical_progress_percent.toFixed(1)}%`],
                      ["Actividades atrasadas", String(preview.program.delayed_activities)],
                      ["Entregas vencidas", String(preview.requisitions.overdue_deliveries)],
                      ["Calidad de datos", `${preview.data_quality.score}/100`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-sm border border-[#E6E6E6] bg-[#FBFBFB] p-4">
                        <p className="text-xs text-[#898982]">{label}</p>
                        <p className="mt-2 break-words text-xl tabular-nums text-gray-950">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={() => void generateNow()}
                disabled={isGenerating || !sections.length || periodEnd < periodStart}
                variant="outline"
                className={`${OUTLINE_BUTTON_CLASS} h-11 px-5`}
              >
                {isGenerating
                  ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#50AC66]" />
                  : <FileText className="mr-2 h-4 w-4 text-[#50AC66]" />}
                Generar PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => changeTab("programaciones")}
                className={`${OUTLINE_BUTTON_CLASS} h-11 px-5`}
              >
                <CalendarClock className="mr-2 h-4 w-4 text-[#898982]" />
                Programar este reporte
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="programaciones" className="mt-6 space-y-6">
            <Card className="rounded-sm border-[#E6E6E6] shadow-none">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg font-normal text-gray-900">
                  Nueva programación
                </CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-[#898982]">
                  Configura cuándo se genera el reporte y quién puede recibir
                  la variante correspondiente a sus permisos.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="report-frequency">Frecuencia</Label>
                    <Select
                      value={frequency}
                      onValueChange={(value) =>
                        setFrequency(value as ReportFrequency)}
                    >
                      <SelectTrigger id="report-frequency" className={CONTROL_CLASS}>
                        <SelectValue placeholder="Selecciona una frecuencia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diario</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="report-time">Hora local</Label>
                    <Input
                      id="report-time"
                      type="time"
                      value={localTime}
                      onChange={(event) => setLocalTime(event.target.value)}
                      className={CONTROL_CLASS}
                    />
                  </div>
                  {frequency === "weekly" ? (
                    <div className="space-y-2">
                      <Label htmlFor="report-weekday">Día de envío</Label>
                      <Select
                        value={String(dayOfWeek)}
                        onValueChange={(value) => setDayOfWeek(Number(value))}
                      >
                        <SelectTrigger id="report-weekday" className={CONTROL_CLASS}>
                          <SelectValue placeholder="Selecciona un día" />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((label, index) => (
                            <SelectItem key={label} value={String(index + 1)}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {frequency === "monthly" ? (
                    <div className="space-y-2">
                      <Label htmlFor="report-monthday">Día del mes</Label>
                      <Select
                        value={String(dayOfMonth)}
                        onValueChange={(value) => setDayOfMonth(Number(value))}
                      >
                        <SelectTrigger id="report-monthday" className={CONTROL_CLASS}>
                          <SelectValue placeholder="Selecciona un día" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 28 }, (_, index) => index + 1)
                            .map((day) => (
                              <SelectItem key={day} value={String(day)}>
                                Día {day}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="report-timezone">Zona horaria</Label>
                    <Select
                      value={timezone}
                      onValueChange={setTimezone}
                    >
                      <SelectTrigger
                        id="report-timezone"
                        className={`${CONTROL_CLASS} h-auto min-h-11 py-2.5 text-left [&>span]:line-clamp-none`}
                      >
                        <SelectValue placeholder="Selecciona una zona horaria" />
                      </SelectTrigger>
                      <SelectContent
                        position="item-aligned"
                        className="max-h-80 w-[min(36rem,calc(100vw-2rem))] border-[#E6E6E6] bg-white"
                      >
                        {TIMEZONE_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="py-2.5 focus:bg-[#F1F1F1] focus:text-gray-900"
                          >
                            <span className="block pr-4">
                              <span className="block text-sm text-gray-900">
                                {option.label}
                              </span>
                              <span className="mt-0.5 block whitespace-normal text-xs leading-5 text-[#898982]">
                                {getTimezoneDetail(option.value, option.detail)}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-[#898982]">
                      El desfase y la hora mostrados se calculan con las reglas
                      vigentes del navegador para evitar errores por cambios estacionales.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Destinatarios permitidos</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(recipients || []).map((recipient) => (
                      <label
                        key={recipient.user_id}
                        htmlFor={`recipient-${recipient.user_id}`}
                        className="flex items-center gap-3 rounded-sm border border-[#E6E6E6] bg-[#FBFBFB] p-3"
                      >
                        <Checkbox
                          id={`recipient-${recipient.user_id}`}
                          checked={recipientIds.includes(recipient.user_id)}
                          disabled={!canManageAccount && recipient.user_id !== currentUser?._id}
                          onCheckedChange={(checked) =>
                            setRecipientIds(
                              checked
                                ? [...recipientIds, recipient.user_id]
                                : recipientIds.filter((id) => id !== recipient.user_id),
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-gray-900">{recipient.name}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {recipient.email} · {recipient.role}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!canManageAccount ? (
                    <p className="text-xs text-gray-500">
                      Sólo un administrador puede agregar otros miembros del proyecto.
                    </p>
                  ) : null}
                </div>

                <Button
                  onClick={() => void scheduleReport()}
                  disabled={isSaving || !sections.length || !recipientIds.length}
                  variant="outline"
                  className={`${OUTLINE_BUTTON_CLASS} h-11 px-5`}
                >
                  {isSaving
                    ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#50AC66]" />
                    : <Send className="mr-2 h-4 w-4 text-[#50AC66]" />}
                  Guardar programación
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {(subscriptions || []).map((subscription) => (
                <Card key={subscription._id} className="rounded-sm border-[#E6E6E6] shadow-none">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium capitalize">{subscription.frequency}</p>
                        <Badge
                          variant="outline"
                          className="gap-2 rounded-sm border-[#E6E6E6] bg-[#FBFBFB] font-normal text-[#898982]"
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-sm ${
                              subscription.active ? "bg-[#50AC66]" : "bg-[#ADADAD]"
                            }`}
                          />
                          {subscription.active ? "Activa" : "Pausada"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        Próxima ejecución: {formatDateTime(subscription.next_run_at, subscription.timezone)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {subscription.recipients.length} destinatario(s) · {subscription.sections.length} secciones
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className={OUTLINE_BUTTON_CLASS}
                        onClick={() => void setSubscriptionActive({
                          subscription_id: subscription._id,
                          active: !subscription.active,
                        }).then(() => toast.success(subscription.active ? "Programación pausada" : "Programación reactivada"))
                          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "No se pudo actualizar"))}
                      >
                        {subscription.active
                          ? <Pause className="mr-2 h-4 w-4" />
                          : <Play className="mr-2 h-4 w-4" />}
                        {subscription.active ? "Pausar" : "Reactivar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className={OUTLINE_BUTTON_CLASS}
                        aria-label="Eliminar programación"
                        onClick={() => {
                          if (!window.confirm("¿Eliminar esta programación? El historial se conservará.")) return;
                          void deleteSubscription({ subscription_id: subscription._id })
                            .then(() => toast.success("Programación eliminada"))
                            .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "No se pudo eliminar"));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {subscriptions?.length === 0 ? (
                <Card className="rounded-sm border-[#E6E6E6] border-dashed shadow-none">
                  <CardContent className="p-8 text-center text-sm text-gray-500">
                    Aún no hay programaciones para este proyecto.
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="historial" className="mt-6 space-y-3">
            {(runs || []).map((run) => (
              <Card key={run._id} className="rounded-sm border-[#E6E6E6] shadow-none">
                <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-xs uppercase tracking-wide text-gray-500">
                        {run.source === "scheduled" ? "Programado" : "Manual"}
                      </span>
                    </div>
                    <p className="mt-2 font-medium">
                      {run.period_start} a {run.period_end}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Solicitado {formatDateTime(run.created_at)}
                      {" · "}
                      {run.delivery_summary.sent} enviados
                      {run.delivery_summary.failed ? ` · ${run.delivery_summary.failed} fallidos` : ""}
                    </p>
                    {run.warning || run.error ? (
                      <p className="mt-2 max-w-3xl text-xs text-[#E75F79]">
                        {run.warning || run.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {run.artifact?.download_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className={OUTLINE_BUTTON_CLASS}
                        asChild
                      >
                        <a href={run.artifact.download_url} download={run.artifact.file_name}>
                          <Download className="mr-2 h-4 w-4" />
                          Descargar PDF
                        </a>
                      </Button>
                    ) : null}
                    {["failed", "warning", "partial"].includes(run.status) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className={OUTLINE_BUTTON_CLASS}
                        onClick={() => void retryRun({ run_id: run._id })
                          .then(() => toast.success("Reintento en cola"))
                          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "No se pudo reintentar"))}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reintentar
                      </Button>
                    ) : null}
                    {run.artifact && run.warning?.includes("IA") ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className={OUTLINE_BUTTON_CLASS}
                        onClick={() => void retryInsights({ run_id: run._id })
                          .then(() => toast.success("Reintento de insights en cola"))
                          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "No se pudo reintentar la IA"))}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reintentar sólo IA
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!runs ? (
              <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Cargando historial...
              </div>
            ) : null}
            {runs?.length === 0 ? (
              <Card className="rounded-sm border-[#E6E6E6] border-dashed shadow-none">
                <CardContent className="p-8 text-center text-sm text-gray-500">
                  El historial aparecerá aquí después de solicitar el primer reporte.
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
