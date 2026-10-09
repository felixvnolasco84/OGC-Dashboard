import { Fragment, useCallback, useState, useMemo, useEffect, useRef, type MouseEvent, type KeyboardEvent } from "react";
import { useParams, useSearchParams } from "react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { hasProviderManagementAccess } from "../../../convex/providerRules";
import { getRequisicionStateChange, isRequisicionApproved } from "../../../convex/requisicionStateRules";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, Plus, ArrowUp, ArrowDown, X, Filter, Building2, Loader2, Eye, Edit2, ChevronLeft, Clock, ChevronDown, ChevronUp, CheckCircle, CreditCard, PackageCheck, Mail, Send, ExternalLink, Paperclip, Trash2, UserPlus, Truck, Receipt, MessageSquare, FileUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRequisicionModal } from "@/hooks/nueva-requisicion-modal";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import RequisicionModal from "@/components/modals/RequisicionModal";
import RequisicionHistoryModal from "@/components/modals/RequisicionHistoryModal";
import { useRequisicionHistoryModal } from "@/hooks/requisicion-history-modal";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    canAddRemissionPhotos,
    getRequisicionNotificationConfig,
    isValidRemissionPhoto,
    REQUISICION_NOTIFICATION_MATRIX,
    type RequisicionNotificationType,
} from "@/lib/requisicionNotificationMatrix";
import RequisicionItems from "./RequisicionItems";
import RequisicionContextMenu, { type RequisicionActionGroup } from "./RequisicionContextMenu";
import ProviderFormDialog, { type ProviderWithMeta } from "@/components/providers/ProviderFormDialog";

const responsiveDialogClassName = "grid-cols-[minmax(0,1fr)] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto p-4 [overflow-wrap:anywhere] sm:p-6 [&>div]:min-w-0 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:right-1 [&>button]:top-1 [&_button]:min-h-11";

type PipelineStageKey = "aprobadas" | "pagadas" | "recibidas";
type StatusHistoryDocument = {
    storage_id: Id<"_storage">;
    nombre: string;
    type: string;
    size: number;
};

export default function ProyectoRequisicionesPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();
    const [searchParams] = useSearchParams();
    const openedDeepLinkRef = useRef<string>();
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [requisicionToDelete, setRequisicionToDelete] = useState<Id<"requisiciones"> | null>(null);

    // Advanced search filters
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [tipoFilter, setTipoFilter] = useState<string>("all");
    const [sortField, setSortField] = useState<"fecha_solicitud" | "tipo">("fecha_solicitud");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [showFilters, setShowFilters] = useState(false);
    const [activeTab, setActiveTab] = useState<"por_revisar" | "aprobadas" | "pagadas" | "recibidas">("por_revisar");
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [contextMenu, setContextMenu] = useState<{
        requisicionId: Id<"requisiciones">;
        x: number;
        y: number;
        returnFocus: HTMLElement | null;
    } | null>(null);
    const closeContextMenu = useCallback(() => setContextMenu(null), []);
    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [notificationType, setNotificationType] = useState<RequisicionNotificationType>("created");
    const [selectedNotificationReqId, setSelectedNotificationReqId] = useState<string>("latest");
    const [notificationMessage, setNotificationMessage] = useState("");
    const [isSendingNotification, setIsSendingNotification] = useState(false);
    const [statusHistoryDialogOpen, setStatusHistoryDialogOpen] = useState(false);
    const [onsitePaymentReqId, setOnsitePaymentReqId] = useState<Id<"requisiciones"> | null>(null);
    const [onsitePaymentAmount, setOnsitePaymentAmount] = useState("");
    const [onsitePaymentReason, setOnsitePaymentReason] = useState("");
    const [isRequestingOnsitePayment, setIsRequestingOnsitePayment] = useState(false);
    const [pendingStatusChange, setPendingStatusChange] = useState<{
        requisicionId: Id<"requisiciones">;
        targetStage?: PipelineStageKey;
        paymentStatus?: string;
        deliveryStatus?: string;
        title: string;
        description: string;
    } | null>(null);
    const [statusHistoryComment, setStatusHistoryComment] = useState("");
    const [statusHistoryDocument, setStatusHistoryDocument] = useState<File | null>(null);
    const [isSubmittingStatusHistory, setIsSubmittingStatusHistory] = useState(false);
    const submittingStatusHistoryRef = useRef(false);
    const [remissionReqId, setRemissionReqId] = useState<Id<"requisiciones"> | null>(null);
    const [remissionPhotos, setRemissionPhotos] = useState<File[]>([]);
    const [isUploadingRemission, setIsUploadingRemission] = useState(false);
    const isMarkingAsPaid = pendingStatusChange?.targetStage === "pagadas"
        || pendingStatusChange?.paymentStatus === "Pagado";
    const isReceivingMaterials = pendingStatusChange?.targetStage === "recibidas"
        || pendingStatusChange?.deliveryStatus === "Parcial"
        || pendingStatusChange?.deliveryStatus === "Completo";

    // Inline review state
    const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
    const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);
    const reviewingItemRef = useRef(false);

    // Fetch project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch requisiciones for this project
    const requisiciones = useQuery(api.requisiciones.getByProyecto, proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip");

    const deleteRequisicion = useMutation(api.requisiciones.deleteRequisicion);
    const updateStatus = useMutation(api.requisiciones.updateStatus);
    const updateStatusEntrega = useMutation(api.requisiciones.updateStatusEntrega);
    const updateRequisicionProveedor = useMutation(api.requisiciones.update);
    const reviewSingleItemMutation = useMutation(api.requisiciones.reviewSingleItem);
    const generateRequisicionUploadUrl = useMutation(api.requisiciones.generateUploadUrl);
    const generateRemissionUploadUrl = useMutation(api.requisiciones.generateRemissionUploadUrl);
    const addRemissionPhotos = useMutation(api.requisiciones.addRemissionPhotos);
    const requestOnsitePayment = useMutation(api.requisiciones.requestOnsitePayment);
    const createProveedor = useMutation(api.proveedores.create);

    // Fetch all proveedores
    const proveedores = useQuery(api.proveedores.getAll);

    // Provider dialog state
    const [providerDialogOpen, setProviderDialogOpen] = useState(false);
    const [commonProviderFormOpen, setCommonProviderFormOpen] = useState(false);
    const [commonProviderForEdit, setCommonProviderForEdit] = useState<ProviderWithMeta | null>(null);
    const [selectedRequisicionForProvider, setSelectedRequisicionForProvider] = useState<Id<"requisiciones"> | null>(null);
    const [providerMode, setProviderMode] = useState<"select" | "create">("select");
    const [selectedProviderId, setSelectedProviderId] = useState<string>("");
    const [isSubmittingProvider, setIsSubmittingProvider] = useState(false);
    const [newProviderData, setNewProviderData] = useState({
        razon_social: "",
        rfc: "",
        direccion: "",
        nombre_contacto: "",
        telefono_contacto: "",
        cuenta: "",
        clabe: "",
        banco: "",
    });

    // Provider view/edit state
    const [providerSearchTerm, setProviderSearchTerm] = useState("");
    const [selectedProviderForView, setSelectedProviderForView] = useState<string | null>(null);
    const [isEditingProvider, setIsEditingProvider] = useState(false);
    const [editProviderData, setEditProviderData] = useState({
        razon_social: "",
        rfc: "",
        direccion: "",
        nombre_contacto: "",
        telefono_contacto: "",
        cuenta: "",
        clabe: "",
        banco: "",
    });

    // Get current user info for permission check
    const currentUser = useQuery(api.users.getCurrentUser);
    const canManageProviders = hasProviderManagementAccess(currentUser);
    useEffect(() => {
        if (currentUser?.role === "almacenista") setActiveTab("pagadas");
    }, [currentUser?.role]);
    const updateProveedor = useMutation(api.proveedores.update);
    const unreadRequisiciones = useQuery(api.requisicion_history.getUnreadRequisiciones, proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip");
    const sendEmailNotification = useAction(api.requisiciones.sendEmailNotification);

    const requisicionModal = useRequisicionModal();
    const historyModal = useRequisicionHistoryModal();

    useEffect(() => {
        const requestedId = searchParams.get("requisicion");
        if (!requestedId || openedDeepLinkRef.current === requestedId || !proyectoId || !requisiciones) return;
        const requisicion = requisiciones.find((item) => item._id === requestedId);
        if (!requisicion) return;
        openedDeepLinkRef.current = requestedId;
        requisicionModal.onOpen({
            projectId: proyectoId as Id<"desarrollos">,
            requisicionId: requisicion._id,
        }, "view");
    }, [proyectoId, requisicionModal, requisiciones, searchParams]);

    // Parse date from DD/MM/YYYY format to comparable value
    const parseDateForSort = (dateStr: string): number => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return 0;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day).getTime();
    };

    // Advanced filtering and sorting
    const filteredRequisiciones = useMemo(() => {
        if (!requisiciones) return [];

        const filtered = requisiciones.filter((req) => {
            // Tab filter
            let matchesTab = true;
            switch (activeTab) {
                case "por_revisar":
                    matchesTab = req.status_revision === "Pendiente de revisión";
                    break;
                case "aprobadas":
                    matchesTab = req.status_revision === "Aprobada" || req.status_revision === "Parcialmente Aprobada";
                    break;
                case "pagadas":
                    matchesTab = req.status === "Pagado";
                    break;
                case "recibidas":
                    matchesTab = req.status_entrega === "Completo";
                    break;
            }

            // Text search (solicitante, descripcion, partida, familia)
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm ||
                req.solicitante_nombre?.toLowerCase().includes(searchLower) ||
                req.descripcion?.toLowerCase().includes(searchLower) ||
                req.items?.some(item =>
                    item.familia?.toLowerCase().includes(searchLower) ||
                    item.sub_partida?.toLowerCase().includes(searchLower)
                );

            // Status filter
            const matchesStatus = statusFilter === "all" || req.status === statusFilter;

            // Tipo filter
            const matchesTipo = tipoFilter === "all" || req.tipo === tipoFilter;

            return matchesTab && matchesSearch && matchesStatus && matchesTipo;
        });

        // Sort results
        filtered.sort((a, b) => {
            let comparison = 0;
            if (sortField === "fecha_solicitud") {
                comparison = parseDateForSort(a.fecha_solicitud) - parseDateForSort(b.fecha_solicitud);
            } else if (sortField === "tipo") {
                comparison = a.tipo.localeCompare(b.tipo);
            }
            return sortDirection === "asc" ? comparison : -comparison;
        });

        return filtered;
    }, [requisiciones, searchTerm, statusFilter, tipoFilter, sortField, sortDirection, activeTab]);

    // Clear all filters
    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("all");
        setTipoFilter("all");
        setSortField("fecha_solicitud");
        setSortDirection("desc");
    };

    // Toggle sort
    const toggleSort = (field: "fecha_solicitud" | "tipo") => {
        if (sortField === field) {
            setSortDirection(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    };

    // Check if any filter is active
    const hasActiveFilters = searchTerm || statusFilter !== "all" || tipoFilter !== "all";

    // Tab counts
    const tabCounts = useMemo(() => {
        if (!requisiciones) return { por_revisar: 0, aprobadas: 0, pagadas: 0, recibidas: 0 };
        return {
            por_revisar: requisiciones.filter(r => r.status_revision === "Pendiente de revisión").length,
            aprobadas: requisiciones.filter(r => r.status_revision === "Aprobada" || r.status_revision === "Parcialmente Aprobada").length,
            pagadas: requisiciones.filter(r => r.status === "Pagado").length,
            recibidas: requisiciones.filter(r => r.status_entrega === "Completo").length,
        };
    }, [requisiciones]);

    // Monto total across all requisiciones
    const montoTotal = useMemo(() => {
        if (!requisiciones) return 0;
        return requisiciones.reduce((sum, req) => {
            const reqTotal = req.items?.reduce((s, item) => s + (item.monto || 0), 0) || 0;
            return sum + reqTotal;
        }, 0);
    }, [requisiciones]);

    const selectedNotificationReq = useMemo(() => {
        if (!requisiciones || requisiciones.length === 0) return null;
        if (selectedNotificationReqId !== "latest") {
            return requisiciones.find((req) => req._id === selectedNotificationReqId) ?? requisiciones[0];
        }
        return [...requisiciones].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    }, [requisiciones, selectedNotificationReqId]);

    useEffect(() => {
        if (!requisiciones || selectedNotificationReqId === "latest") return;
        const stillExists = requisiciones.some((req) => req._id === selectedNotificationReqId);
        if (!stillExists) {
            setSelectedNotificationReqId("latest");
        }
    }, [requisiciones, selectedNotificationReqId]);

    const selectedNotificationConfig = getRequisicionNotificationConfig(notificationType);
    const emailRecipients = useQuery(
        api.requisiciones.getEmailRecipients,
        proyectoId && (currentUser?.role === "admin" || currentUser?.role === "finance")
            ? {
                proyecto: proyectoId as Id<"desarrollos">,
                notification_type: notificationType,
                exclude_current_user: true,
                ...(selectedNotificationReq?._id ? { requisicion_id: selectedNotificationReq._id } : {}),
            }
            : "skip"
    );
    const notificationEvents = useQuery(
        api.requisiciones.getNotificationEventsByProyecto,
        proyectoId && (currentUser?.role === "admin" || currentUser?.role === "finance")
            ? {
                proyecto: proyectoId as Id<"desarrollos">,
                limit: 5,
            }
            : "skip"
    );
    const recipientsToNotifyCount = emailRecipients?.length ?? 0;
    const notificationRequiresMissingReq = selectedNotificationConfig.requiresRequisition && !selectedNotificationReq;

    const notificationCopy = useMemo(() => {
        const requisicionTitle = selectedNotificationReq
            ? `${selectedNotificationReq.tipo === "equipo" ? "Equipo" : "Material"} solicitado`
            : "Requisiciones";
        const statusLabel = selectedNotificationReq?.status_revision || selectedNotificationReq?.status || "On Going";
        const message = notificationMessage.trim() || selectedNotificationReq?.descripcion || selectedNotificationConfig.defaultMessage;

        return {
            action: selectedNotificationConfig.actionLabel,
            title: selectedNotificationConfig.subject,
            requisicionTitle,
            statusLabel,
            message,
        };
    }, [notificationMessage, selectedNotificationConfig, selectedNotificationReq]);

    const formatNotificationDate = (timestamp?: number) => {
        if (!timestamp) return "Pendiente";
        return new Date(timestamp).toLocaleString("es-MX", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const handleSendEmailNotification = async () => {
        if (!proyectoId) return;
        if (notificationRequiresMissingReq) {
            toast.error("Selecciona una requisicion para este tipo de notificacion");
            return;
        }
        if (recipientsToNotifyCount === 0) {
            toast.warning("No hay destinatarios para esta notificacion", {
                description: "Revisa la audiencia definida en la matriz BA.",
            });
            return;
        }
        setIsSendingNotification(true);
        try {
            const result = await sendEmailNotification({
                proyecto: proyectoId as Id<"desarrollos">,
                requisicion_id: selectedNotificationReq?._id,
                notification_type: notificationType,
                message: notificationMessage.trim() || undefined,
            });
            if (result.failed > 0) {
                toast.warning("Notificacion enviada parcialmente", {
                    description: `Se envio a ${result.sent} destinatario${result.sent === 1 ? "" : "s"} y fallo ${result.failed}.`,
                });
            } else {
                toast.success("Notificacion enviada", {
                    description: `Se envio a ${result.sent} destinatario${result.sent === 1 ? "" : "s"}.`,
                });
            }
            setEmailDialogOpen(false);
            setNotificationMessage("");
        } catch (error) {
            console.error("Error sending requisicion email notification:", error);
            toast.error("No se pudo enviar el correo", {
                description: error instanceof Error ? error.message : "Revisa la configuracion de correo.",
            });
        } finally {
            setIsSendingNotification(false);
        }
    };

    const handleRequestOnsitePayment = async () => {
        if (!onsitePaymentReqId || isRequestingOnsitePayment) return;
        const importe = Number(onsitePaymentAmount);
        if (!Number.isFinite(importe) || importe <= 0 || !onsitePaymentReason.trim()) {
            toast.error("Ingresa un importe y motivo válidos");
            return;
        }
        setIsRequestingOnsitePayment(true);
        try {
            await requestOnsitePayment({ id: onsitePaymentReqId, importe, motivo: onsitePaymentReason.trim() });
            toast.success("Solicitud de pago en obra enviada");
            setOnsitePaymentReqId(null);
            setOnsitePaymentAmount("");
            setOnsitePaymentReason("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo solicitar el pago");
        } finally {
            setIsRequestingOnsitePayment(false);
        }
    };

    // Toggle card expansion
    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Get approved items count for partial badge
    const getApprovedItemsCount = (req: NonNullable<typeof requisiciones>[number]) => {
        if (!req.items) return { approved: 0, total: 0 };
        const approved = req.items.filter(i => i.status_revision === "aprobado").length;
        return { approved, total: req.items.length };
    };

    const getPipelineStages = (req: NonNullable<typeof requisiciones>[number]) => [
        {
            key: "aprobadas" as const,
            label: req.status_revision === "Parcialmente Aprobada" ? "Aprobación parcial" : isRequisicionApproved(req) ? "Aprobada" : req.status_revision === "Rechazada" ? "Rechazada" : "Por revisar",
            icon: CheckCircle,
            complete: isRequisicionApproved(req),
        },
        {
            key: "pagadas" as const,
            label: "Pagada",
            icon: CreditCard,
            complete: req.status === "Pagado",
        },
        {
            key: "recibidas" as const,
            label: "Recibida",
            icon: PackageCheck,
            complete: req.status_entrega === "Completo",
        },
    ];

    const canUpdatePipelineStage = (
        req: NonNullable<typeof requisiciones>[number],
        stage: PipelineStageKey
    ) => {
        if (!currentUser) return false;
        if (stage === "aprobadas") return currentUser.role === "admin" || currentUser.role === "finance";
        if (stage === "pagadas") return currentUser.role === "admin" || currentUser.role === "finance";
        return currentUser.role === "admin" || currentUser.role === "user" || (currentUser.role === "contratista" && req.solicitante_id === currentUser._id);
    };

    const reviewApproval = (req: NonNullable<typeof requisiciones>[number]) => {
        if (!isReviewUser) return;
        resetStatusHistoryDialog();
        setExpandedCards((current) => new Set(current).add(req._id));
        requestAnimationFrame(() => {
            const materials = Array.from(document.querySelectorAll<HTMLElement>(`[data-requisicion-id="${req._id}"] [data-material-layout]`))
                .find(element => element.offsetHeight > 0);
            materials?.scrollIntoView({ block: "nearest" });
            materials?.querySelector<HTMLInputElement>('input[type="number"]:not([disabled])')?.focus({ preventScroll: true });
        });
        toast.info("Revisa las cantidades y aprueba o rechaza cada material.");
    };

    // Format date from DD/MM/YYYY to readable
    const formatDate = (dateStr: string) => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return dateStr;
        const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return `${day} de ${months[month]} del ${year}`;
    };

    // --- Inline review helpers ---
    const isReviewUser = currentUser?.role === "admin" || currentUser?.role === "finance";

    const handleApproveItem = async (itemId: Id<"requisicion_items">, cantidad?: number) => {
        if (!currentUser || reviewingItemRef.current) return;
        reviewingItemRef.current = true;
        setReviewingItemId(itemId);
        try {
            const result = await reviewSingleItemMutation({
                item_id: itemId,
                status_revision: "aprobado",
                cantidad_aprobada: cantidad,
                reviewer_id: currentUser._id,
                reviewer_name: currentUser.name,
            });
            if (result.allReviewed) {
                const statusMsg =
                    result.status_revision === "Aprobada"
                        ? "Requisición aprobada"
                        : result.status_revision === "Rechazada"
                            ? "Requisición rechazada"
                            : "Requisición parcialmente aprobada";
                toast.success(statusMsg);
            }
        } catch (error) {
            console.error("Error approving item:", error);
            toast.error("Error al aprobar item");
        } finally {
            reviewingItemRef.current = false;
            setReviewingItemId(null);
        }
    };

    const handleRejectItem = async (itemId: Id<"requisicion_items">) => {
        if (!currentUser || reviewingItemRef.current) return;
        reviewingItemRef.current = true;
        setReviewingItemId(itemId);
        try {
            const result = await reviewSingleItemMutation({
                item_id: itemId,
                status_revision: "rechazado",
                reviewer_id: currentUser._id,
                reviewer_name: currentUser.name,
            });
            if (result.allReviewed) {
                const statusMsg =
                    result.status_revision === "Aprobada"
                        ? "Requisición aprobada"
                        : result.status_revision === "Rechazada"
                            ? "Requisición rechazada"
                            : "Requisición parcialmente aprobada";
                toast.success(statusMsg);
            }
        } catch (error) {
            console.error("Error rejecting item:", error);
            toast.error("Error al rechazar item");
        } finally {
            reviewingItemRef.current = false;
            setReviewingItemId(null);
        }
    };

    const updateEditedQty = (itemId: string, qty: number) => {
        setEditedQuantities(prev => ({ ...prev, [itemId]: qty }));
    };

    const handleDelete = async () => {
        if (!requisicionToDelete || !currentUser) return;

        try {
            await deleteRequisicion({
                id: requisicionToDelete,
                changed_by_id: currentUser._id,
                changed_by_name: currentUser.name,
            });
            toast.success("Requisición eliminada", {
                description: "La requisición ha sido eliminada exitosamente.",
            });
            setDeleteDialogOpen(false);
            setRequisicionToDelete(null);
        } catch (error) {
            console.error("Error deleting requisicion:", error);
            toast.error("Error al eliminar", {
                description: error instanceof Error ? error.message : "No se pudo eliminar la requisición.",
            });
        }
    };

    const openDeleteDialog = (requisicionId: Id<"requisiciones">) => {
        setRequisicionToDelete(requisicionId);
        setDeleteDialogOpen(true);
    };

    const handleStatusChange = async (
        requisicionId: Id<"requisiciones">,
        newStatus: string,
        comentario?: string,
        documentos?: StatusHistoryDocument[],
        expectedStatus?: string
    ) => {
        if (!currentUser) return;
        const result = await updateStatus({
            id: requisicionId,
            status: newStatus,
            expected_status: expectedStatus,
            comentario,
            documentos,
            changed_by_id: currentUser._id,
            changed_by_name: currentUser.name,
        });
        if (result.changed) toast.success(`Pago: ${expectedStatus} → ${newStatus}`);
        else toast.info("El pago ya tenía ese estado. No se realizaron cambios.");
    };

    const handleStatusEntregaChange = async (
        requisicionId: Id<"requisiciones">,
        newStatus: string,
        comentario?: string,
        documentos?: StatusHistoryDocument[],
        expectedStatus?: string
    ) => {
        if (!currentUser) return;
        const result = await updateStatusEntrega({
            id: requisicionId,
            status_entrega: newStatus,
            expected_status_entrega: expectedStatus,
            comentario,
            documentos,
            changed_by_id: currentUser._id,
            changed_by_name: currentUser.name,
        });
        if (result.changed) toast.success(`Entrega: ${expectedStatus} → ${newStatus}`);
        else toast.info("La entrega ya tenía ese estado. No se realizaron cambios.");
    };

    const resetStatusHistoryDialog = () => {
        setStatusHistoryDialogOpen(false);
        setPendingStatusChange(null);
        setStatusHistoryComment("");
        setStatusHistoryDocument(null);
    };

    const openPipelineStatusDialog = (
        req: NonNullable<typeof requisiciones>[number],
        targetStage: PipelineStageKey
    ) => {
        if (submittingStatusHistoryRef.current || !canUpdatePipelineStage(req, targetStage)) return;
        if (getPipelineStages(req).find((stage) => stage.key === targetStage)?.complete) {
            toast.info("Esta condición ya está cumplida. No se realizaron cambios.");
            return;
        }
        if (targetStage === "aprobadas") {
            reviewApproval(req);
            return;
        }
        const stageLabel = targetStage === "pagadas"
                ? "Pagada"
                : "Recibida";

        setPendingStatusChange({
            requisicionId: req._id,
            targetStage,
            title: `Cambiar a ${stageLabel}`,
            description: targetStage === "recibidas"
                ? "Registra la recepción de materiales. Puedes tomar o elegir una foto de la nota de remisión."
                : "Registra el motivo del cambio. Puedes adjuntar un comprobante, factura u otro soporte.",
        });
        setStatusHistoryComment("");
        setStatusHistoryDocument(null);
        setStatusHistoryDialogOpen(true);
    };

    const openPaymentStatusDialog = (
        req: NonNullable<typeof requisiciones>[number],
        paymentStatus: string
    ) => {
        if (submittingStatusHistoryRef.current || req.status === paymentStatus) return;
        setPendingStatusChange({
            requisicionId: req._id,
            paymentStatus,
            title: `Cambiar pago a ${paymentStatus}`,
            description: "Agrega un comentario para el historial. El documento es opcional y puede ser factura, comprobante o soporte de pago.",
        });
        setStatusHistoryComment("");
        setStatusHistoryDocument(null);
        setStatusHistoryDialogOpen(true);
    };

    const openDeliveryStatusDialog = (
        req: NonNullable<typeof requisiciones>[number],
        deliveryStatus: string
    ) => {
        if (submittingStatusHistoryRef.current || (req.status_entrega || "Pendiente") === deliveryStatus) return;
        setPendingStatusChange({
            requisicionId: req._id,
            deliveryStatus,
            title: `Cambiar entrega a ${deliveryStatus}`,
            description: deliveryStatus === "Parcial" || deliveryStatus === "Completo"
                ? "Agrega un comentario para el historial. Puedes tomar o elegir una foto de la nota de remisión."
                : "Agrega un comentario para el historial del cambio.",
        });
        setStatusHistoryComment("");
        setStatusHistoryDocument(null);
        setStatusHistoryDialogOpen(true);
    };

    const uploadStatusHistoryDocument = async (): Promise<StatusHistoryDocument[] | undefined> => {
        if (!statusHistoryDocument) return undefined;
        if (isReceivingMaterials && !isValidRemissionPhoto(statusHistoryDocument)) {
            throw new Error("Selecciona una foto de la remisión menor a 10 MB.");
        }

        const uploadUrl = await generateRequisicionUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": statusHistoryDocument.type || "application/octet-stream" },
            body: statusHistoryDocument,
        });

        if (!uploadResult.ok) {
            throw new Error("No se pudo subir el documento.");
        }

        const { storageId } = await uploadResult.json();
        return [{
            storage_id: storageId as Id<"_storage">,
            nombre: statusHistoryDocument.name,
            type: statusHistoryDocument.type || "application/octet-stream",
            size: statusHistoryDocument.size,
        }];
    };

    const closeRemissionDialog = () => {
        setRemissionReqId(null);
        setRemissionPhotos([]);
    };

    const addSelectedRemissionPhotos = (files: FileList | null) => {
        if (!files) return;
        setRemissionPhotos((current) => [...current, ...Array.from(files)]);
    };

    const handleUploadRemissionPhotos = async () => {
        if (!remissionReqId || remissionPhotos.length === 0) return;
        if (remissionPhotos.some((file) => !isValidRemissionPhoto(file))) {
            toast.error("Cada nota de remisión debe ser una imagen menor a 10 MB.");
            return;
        }
        setIsUploadingRemission(true);
        try {
            const documentos: StatusHistoryDocument[] = [];
            for (const file of remissionPhotos) {
                const uploadUrl = await generateRemissionUploadUrl({ id: remissionReqId });
                const response = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": file.type },
                    body: file,
                });
                if (!response.ok) throw new Error("No se pudo subir una de las fotos.");
                const { storageId } = await response.json();
                documentos.push({ storage_id: storageId as Id<"_storage">, nombre: file.name, type: file.type, size: file.size });
            }
            await addRemissionPhotos({ id: remissionReqId, documentos });
            toast.success("Notas de remisión agregadas");
            closeRemissionDialog();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudieron agregar las notas de remisión.");
        } finally {
            setIsUploadingRemission(false);
        }
    };

    const handleConfirmStatusHistory = async () => {
        if (!pendingStatusChange || !currentUser || submittingStatusHistoryRef.current) return;
        const req = requisiciones?.find((item) => item._id === pendingStatusChange.requisicionId);
        if (!req) {
            toast.error("No se encontró la requisición.");
            return;
        }
        const change = {
            paymentStatus: pendingStatusChange.paymentStatus ?? (pendingStatusChange.targetStage === "pagadas" ? "Pagado" : undefined),
            deliveryStatus: pendingStatusChange.deliveryStatus ?? (pendingStatusChange.targetStage === "recibidas" ? "Completo" : undefined),
        };
        const transition = getRequisicionStateChange(req, change);
        if (!transition.changed) {
            toast.info("El estado ya está registrado. No se realizaron cambios.");
            resetStatusHistoryDialog();
            return;
        }
        if (!canUpdatePipelineStage(req, change.paymentStatus ? "pagadas" : "recibidas") || transition.blockedReason) {
            toast.error(transition.blockedReason || "Sin permisos para actualizar este estado");
            return;
        }
        const comment = statusHistoryComment.trim() || undefined;
        if (!comment && !isMarkingAsPaid && !(isReceivingMaterials && statusHistoryDocument)) {
            toast.error(isReceivingMaterials ? "Agrega un comentario o una foto de la remisión." : "Agrega un comentario para registrar el cambio.");
            return;
        }

        submittingStatusHistoryRef.current = true;
        setIsSubmittingStatusHistory(true);
        try {
            const documentos = await uploadStatusHistoryDocument();

            if (change.paymentStatus) {
                await handleStatusChange(req._id, change.paymentStatus, comment, documentos, transition.before);
            } else if (change.deliveryStatus) {
                await handleStatusEntregaChange(req._id, change.deliveryStatus, comment, documentos, transition.before);
            }

            resetStatusHistoryDialog();
        } catch (error) {
            console.error("Error saving status history:", error);
            toast.error("No se pudo actualizar el estado", {
                description: error instanceof Error ? error.message : "No se pudo registrar el cambio.",
            });
        } finally {
            submittingStatusHistoryRef.current = false;
            setIsSubmittingStatusHistory(false);
        }
    };

    // const getStatusColor = (status: string) => {
    //     switch (status) {
    //         case "En proceso": return "bg-blue-50 text-blue-700 border border-blue-200";
    //         case "Cancelado": return "bg-red-50 text-red-700 border border-red-200";
    //         case "Pagado": return "bg-green-50 text-[#5FB473] border border-[#7EC18E]";
    //         default: return " text-foreground border border-border";
    //     }
    // };

    // Open provider dialog
    const openProviderDialog = (requisicionId: Id<"requisiciones">) => {
        setSelectedRequisicionForProvider(requisicionId);
        setProviderDialogOpen(true);
        setProviderMode("select");
        setSelectedProviderId("");
        setNewProviderData({
            razon_social: "",
            rfc: "",
            direccion: "",
            nombre_contacto: "",
            telefono_contacto: "",
            cuenta: "",
            clabe: "",
            banco: "",
        });
    };

    // Handle provider assignment
    const handleAssignProvider = async () => {
        if (!selectedRequisicionForProvider || !selectedProviderId || !currentUser) return;

        setIsSubmittingProvider(true);
        try {
            await updateRequisicionProveedor({
                id: selectedRequisicionForProvider,
                proveedor_id: selectedProviderId as Id<"proveedores">,
                changed_by_id: currentUser._id,
                changed_by_name: currentUser.name,
            });
            toast.success("Proveedor asignado", {
                description: "El proveedor ha sido asignado a la requisición.",
            });
            setProviderDialogOpen(false);
        } catch (error) {
            console.error("Error assigning provider:", error);
            toast.error("Error al asignar proveedor");
        } finally {
            setIsSubmittingProvider(false);
        }
    };

    // Handle create new provider
    const handleCreateProvider = async () => {
        if (!canManageProviders) return;
        if (!selectedRequisicionForProvider || !newProviderData.razon_social || !currentUser) return;

        setIsSubmittingProvider(true);
        try {
            const newProviderId = await createProveedor(newProviderData);
            await updateRequisicionProveedor({
                id: selectedRequisicionForProvider,
                proveedor_id: newProviderId,
                changed_by_id: currentUser._id,
                changed_by_name: currentUser.name,
            });
            toast.success("Proveedor creado y asignado", {
                description: "El nuevo proveedor ha sido creado y asignado a la requisición.",
            });
            setProviderDialogOpen(false);
        } catch (error) {
            console.error("Error creating provider:", error);
            toast.error("Error al crear proveedor");
        } finally {
            setIsSubmittingProvider(false);
        }
    };

    // Filter providers by search term
    const filteredProviders = useMemo(() => {
        if (!proveedores) return [];
        if (!providerSearchTerm) return proveedores;
        const searchLower = providerSearchTerm.toLowerCase();
        return proveedores.filter(p =>
            p.razon_social.toLowerCase().includes(searchLower) ||
            p.rfc?.toLowerCase().includes(searchLower) ||
            p.nombre_contacto?.toLowerCase().includes(searchLower)
        );
    }, [proveedores, providerSearchTerm]);

    // Get selected provider for view/edit
    const viewingProvider = useMemo(() => {
        if (!selectedProviderForView || !proveedores) return null;
        return proveedores.find(p => p._id === selectedProviderForView);
    }, [selectedProviderForView, proveedores]);

    // Only administrators can edit the shared provider catalogue.
    const canEditProvider = (provider: typeof viewingProvider) => {
        return Boolean(provider && canManageProviders);
    };

    // Open provider details view
    const openProviderView = (providerId: string) => {
        const provider = proveedores?.find(p => p._id === providerId);
        if (provider) {
            setSelectedProviderForView(providerId);
            setIsEditingProvider(false);
            setEditProviderData({
                razon_social: provider.razon_social,
                rfc: provider.rfc || "",
                direccion: provider.direccion || "",
                nombre_contacto: provider.nombre_contacto || "",
                telefono_contacto: provider.telefono_contacto || "",
                cuenta: provider.cuenta || "",
                clabe: provider.clabe || "",
                banco: provider.banco || "",
            });
        }
    };

    // Start editing provider
    const startEditingProvider = () => {
        if (viewingProvider && canEditProvider(viewingProvider)) {
            setCommonProviderForEdit(viewingProvider);
            setCommonProviderFormOpen(true);
        }
    };

    const handleCommonProviderSaved = async (providerId: Id<"proveedores">) => {
        if (commonProviderForEdit || !selectedRequisicionForProvider || !currentUser) return;
        try {
            await updateRequisicionProveedor({
                id: selectedRequisicionForProvider,
                proveedor_id: providerId,
                changed_by_id: currentUser._id,
                changed_by_name: currentUser.name,
            });
            toast.success("Proveedor asignado a la requisición");
            setProviderDialogOpen(false);
        } catch (error) {
            toast.error("El proveedor se creó, pero no pudo asignarse", {
                description: error instanceof Error ? error.message : "Error inesperado",
            });
        }
    };

    // Save provider edits
    const handleSaveProviderEdit = async () => {
        if (!selectedProviderForView || !canManageProviders) return;

        setIsSubmittingProvider(true);
        try {
            await updateProveedor({
                id: selectedProviderForView as Id<"proveedores">,
                ...editProviderData,
            });
            toast.success("Proveedor actualizado", {
                description: "Los datos del proveedor han sido actualizados.",
            });
            setIsEditingProvider(false);
        } catch (error) {
            console.error("Error updating provider:", error);
            toast.error("Error al actualizar proveedor");
        } finally {
            setIsSubmittingProvider(false);
        }
    };

    // Go back to provider list from view
    const backToProviderList = () => {
        setSelectedProviderForView(null);
        setIsEditingProvider(false);
    };

    const openRequisicionDetails = (id: Id<"requisiciones">) => {
        if (!proyectoId) return;
        requisicionModal.onOpen({ projectId: proyectoId as Id<"desarrollos">, requisicionId: id }, "view");
    };

    const openRequisicionContextMenu = (event: MouseEvent<HTMLDivElement>, id: Id<"requisiciones">) => {
        if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]")) return;
        event.preventDefault();
        event.stopPropagation();
        const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("button") : null;
        setContextMenu({
            requisicionId: id, x: event.clientX, y: event.clientY,
            returnFocus: target ?? event.currentTarget.querySelector<HTMLElement>("[data-requisicion-title]"),
        });
    };

    const openKeyboardContextMenu = (event: KeyboardEvent<HTMLDivElement>, id: Id<"requisiciones">) => {
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        if (!(event.target instanceof HTMLElement) || event.target.closest("input, textarea, [contenteditable=true]")) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.target.getBoundingClientRect();
        setContextMenu({ requisicionId: id, x: bounds.left, y: bounds.bottom, returnFocus: event.target });
    };

    const getRequisicionActionGroups = (req: NonNullable<typeof requisiciones>[number]): RequisicionActionGroup[] => {
        const canManage = currentUser?.role === "admin" || currentUser?.role === "user"
            || (currentUser?.role === "contratista" && req.solicitante_id === currentUser._id);
        const groups: RequisicionActionGroup[] = [{
            label: "Acciones",
            actions: [
                { label: "Ver detalles", icon: Eye, onSelect: () => openRequisicionDetails(req._id) },
                { label: "Historial", icon: Clock, onSelect: () => historyModal.openSingleHistory(proyectoId as Id<"desarrollos">, req._id) },
            ],
        }];
        const mainActions = groups[0].actions;
        if (currentUser && canAddRemissionPhotos({ role: currentUser.role, status: req.status, hasProjectAccess: true })) {
            mainActions.push({ label: "Agregar nota de remisión", icon: FileUp, onSelect: () => { setRemissionReqId(req._id); setRemissionPhotos([]); } });
        }
        if (canManage && isRequisicionApproved(req) && req.status !== "Pagado" && req.status !== "Cancelado" && req.pago_obra?.estado !== "pendiente") {
            mainActions.push({ label: "Solicitar pago en obra", icon: CreditCard, onSelect: () => { setOnsitePaymentReqId(req._id); setOnsitePaymentAmount(""); setOnsitePaymentReason(""); } });
        }
        if (canManage) {
            mainActions.push(
                { label: "Editar", icon: Edit2, onSelect: () => requisicionModal.onOpen({ projectId: proyectoId as Id<"desarrollos">, requisicionId: req._id }, "edit") },
                { label: "Agregar proveedor", icon: UserPlus, onSelect: () => openProviderDialog(req._id) },
            );
        }
        groups.push({
            label: "Aprobación, pago y entrega", icon: CheckCircle,
            actions: getPipelineStages(req).map((stage) => ({
                label: stage.key === "aprobadas" && !stage.complete ? "Revisar aprobación" : `${stage.complete ? "Estado:" : "Marcar como"} ${stage.label}`, icon: stage.icon, complete: stage.complete,
                busy: isSubmittingStatusHistory && pendingStatusChange?.requisicionId === req._id,
                disabled: isSubmittingStatusHistory || !canUpdatePipelineStage(req, stage.key),
                onSelect: () => openPipelineStatusDialog(req, stage.key),
            })),
        });
        if (currentUser?.role === "admin" || currentUser?.role === "finance") {
            groups.push({
                label: "Estado de pago", icon: Receipt,
                actions: (currentUser.role === "finance" ? ["Pagado", "Cancelado"] : ["En proceso", "Pagado", "Cancelado"]).map((status) => ({
                    label: status, icon: CreditCard, disabled: status === req.status, complete: status === req.status,
                    onSelect: () => openPaymentStatusDialog(req, status),
                })),
            });
        }
        if (canManage) {
            groups.push({
                label: "Estado de entrega", icon: Truck,
                actions: ["Pendiente", "Parcial", "Completo"].map((status) => ({
                    label: status, icon: PackageCheck, disabled: status === (req.status_entrega || "Pendiente"),
                    complete: status === (req.status_entrega || "Pendiente"),
                    onSelect: () => openDeliveryStatusDialog(req, status),
                })),
            });
        }
        if (currentUser?.role === "admin" || (currentUser?.role === "contratista" && req.solicitante_id === currentUser._id)) {
            groups.push({ label: "Eliminar", actions: [{ label: "Eliminar", icon: Trash2, destructive: true, onSelect: () => openDeleteDialog(req._id) }] });
        }
        return groups;
    };

    const contextMenuRequisicion = contextMenu
        ? filteredRequisiciones.find((req) => req._id === contextMenu.requisicionId)
        : undefined;
    useEffect(() => {
        if (contextMenu && !contextMenuRequisicion) closeContextMenu();
    }, [contextMenu, contextMenuRequisicion, closeContextMenu]);

    const pendingRequisicion = requisiciones?.find((req) => req._id === pendingStatusChange?.requisicionId);
    const pendingTransition = pendingRequisicion && pendingStatusChange ? getRequisicionStateChange(pendingRequisicion, {
        paymentStatus: pendingStatusChange.paymentStatus ?? (pendingStatusChange.targetStage === "pagadas" ? "Pagado" : undefined),
        deliveryStatus: pendingStatusChange.deliveryStatus ?? (pendingStatusChange.targetStage === "recibidas" ? "Completo" : undefined),
    }) : undefined;

    if (!proyecto) {
        return (
            <div className="bg-card min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">Cargando...</p>
            </div>
        );
    }

    return (
        <div className="min-w-0 bg-card min-h-screen" data-requisiciones-page>
            <div className="w-full min-w-0 max-w-full mx-auto py-4 text-left md:py-6 xl:py-8">
                <div className="flex min-w-0 flex-col gap-4 px-4 md:px-6 xl:px-12">
                    <div className="mb-2 flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Requisiciones</p>
                            <h1 className="text-2xl text-foreground [overflow-wrap:anywhere]">{proyecto.nombre}</h1>
                        </div>
                        <div className="flex min-w-0 flex-col gap-4 2xl:items-end">
                        <div className="flex flex-wrap gap-2 [&>button]:min-h-11 [&>button]:flex-auto sm:[&>button]:flex-none">
                            {(currentUser?.role === "admin" || currentUser?.role === "finance") && <Button onClick={() => setEmailDialogOpen(true)} variant="outline" className="min-h-11 font-normal">
                                <Mail className="h-4 w-4 mr-2" /> Notificaciones
                            </Button>}
                            {/*<Button
                                onClick={() => setEmailDialogOpen(true)}
                                variant="outline"
                                size="lg"
                                className="flex items-center gap-2 rounded-none text-muted-foreground py-6"
                            >
                                <Mail className="h-5 w-5" />
                                Notificar
                            </Button>*/}
                            {/* History Button */}
                            <Button
                                onClick={() => historyModal.openAllHistory(proyectoId as Id<"desarrollos">)}
                                variant="outline"
                                className="min-h-11 font-normal"
                            >
                                <Clock className="h-5 w-5" />
                                Historial
                            </Button>
                            {/* Nueva Requisición - admin, user, or contratista (contratista can create their own) */}
                            {(currentUser?.role === "admin" || currentUser?.role === "user" || currentUser?.role === "contratista") && (
                                <Button
                                    onClick={() => requisicionModal.onOpen({ projectId: proyectoId as Id<"desarrollos"> }, "create")}
                                    variant="outline"
                                    className="min-h-11 font-normal"
                                >
                                    Nueva Requisición
                                    <Plus className="h-5 w-5" />
                                </Button>
                            )}
                        </div>
                        <dl className="flex min-w-0 flex-wrap gap-x-6 gap-y-2 text-sm">
                            <div className="flex items-baseline gap-2">
                                <dt className="text-muted-foreground">Total:</dt>
                                <dd>{requisiciones?.length || 0}</dd>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                                <dt className="text-muted-foreground">Monto total:</dt>
                                <dd className="[overflow-wrap:anywhere]">${montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                            </div>
                        </dl>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row">
                        <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                        <Input
                            type="text"
                            aria-label="Buscar requisiciones"
                            placeholder="Buscar por solicitante, descripción, familia, material..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 pr-3 rounded-none border-border-strong h-12 text-base md:text-sm"
                        />
                        </div>
                        <div className="flex shrink-0 justify-end gap-2">
                            {hasActiveFilters && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearFilters}
                                    className="h-12 px-3 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    Limpiar
                                </Button>
                            )}
                            <Button
                                variant={showFilters ? "default" : "outline"}
                                size="sm"
                                onClick={() => setShowFilters(!showFilters)}
                                className="h-12 rounded-none"
                                aria-expanded={showFilters}
                                aria-controls="requisicion-filters"
                            >
                                <Filter className="h-4 w-4 mr-1" />
                                Filtros
                            </Button>
                        </div>
                    </div>

                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <div id="requisicion-filters" className="mb-4 min-w-0 p-4 border border-border space-y-4">
                            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                                {/* Status Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm  text-foreground">Estado</label>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="min-w-0 rounded-none h-11 [&>span]:truncate">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="En proceso">En proceso</SelectItem>
                                            <SelectItem value="Cancelado">Cancelado</SelectItem>
                                            <SelectItem value="Pagado">Pagado</SelectItem>
                                            <SelectItem value="Recibido">Recibido</SelectItem>
                                            <SelectItem value="Parcial">Parcial</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Tipo Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm  text-foreground">Tipo</label>
                                    <Select value={tipoFilter} onValueChange={setTipoFilter}>
                                        <SelectTrigger className="min-w-0 rounded-none h-11 [&>span]:truncate">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="material">Material</SelectItem>
                                            <SelectItem value="equipo">Equipo</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Sort Controls */}
                            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border [&>button]:min-h-11">
                                <span className="text-sm  text-foreground">Ordenar por:</span>
                                <Button
                                    variant={sortField === "fecha_solicitud" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleSort("fecha_solicitud")}
                                    className="rounded-none"
                                >
                                    Fecha
                                    {sortField === "fecha_solicitud" && (
                                        sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                    )}
                                </Button>
                                <Button
                                    variant={sortField === "tipo" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleSort("tipo")}
                                    className="rounded-none"
                                >
                                    Tipo
                                    {sortField === "tipo" && (
                                        sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                    )}
                                </Button>
                                <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">
                                    {filteredRequisiciones.length} de {requisiciones?.length || 0} requisiciones
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Tabs */}
                <div className="min-w-0 px-4 md:px-6 xl:px-12 mb-4">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                        <TabsList aria-label="Estado de las requisiciones" className="flex max-w-full overflow-x-auto bg-transparent h-auto p-0 gap-0 border-b border-border w-full justify-start rounded-none [&>button]:shrink-0">
                            <TabsTrigger
                                value="por_revisar"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none min-h-11 px-3 py-3 text-sm font-normal text-muted-foreground data-[state=active]:text-foreground gap-2 md:px-6"
                            >
                                Por revisar
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-muted">{tabCounts.por_revisar}</Badge>
                            </TabsTrigger>
                            <TabsTrigger
                                value="aprobadas"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none min-h-11 px-3 py-3 text-sm font-normal text-muted-foreground data-[state=active]:text-foreground gap-2 md:px-6"
                            >
                                Aprobadas
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-muted">{tabCounts.aprobadas}</Badge>
                            </TabsTrigger>
                            <TabsTrigger
                                value="pagadas"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none min-h-11 px-3 py-3 text-sm font-normal text-muted-foreground data-[state=active]:text-foreground gap-2 md:px-6"
                            >
                                Pagadas
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-muted">{tabCounts.pagadas}</Badge>
                            </TabsTrigger>
                            <TabsTrigger
                                value="recibidas"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none min-h-11 px-3 py-3 text-sm font-normal text-muted-foreground data-[state=active]:text-foreground gap-2 md:px-6"
                            >
                                Recibidas
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-muted">{tabCounts.recibidas}</Badge>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Cards List */}
                <div className="min-w-0 px-4 md:px-6 xl:px-12 space-y-4">
                    {!requisiciones ? (
                        <div className="py-12 text-center text-muted-foreground">
                            Cargando requisiciones...
                        </div>
                    ) : filteredRequisiciones.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            No se encontraron requisiciones
                        </div>
                    ) : (
                        filteredRequisiciones.map((req) => {
                            const isExpanded = expandedCards.has(req._id);
                            const itemCounts = getApprovedItemsCount(req);
                            const reqMontoTotal = req.items?.reduce((s, i) => s + (i.monto || 0), 0) || 0;
                            const familias = [...new Set(req.items?.map(i => i.familia) || [])];
                            const subPartidas = [...new Set(req.items?.map(i => i.sub_partida).filter(Boolean) || [])];
                            const categoryLabel = familias.length > 0
                                ? `${familias[0]?.toUpperCase()}${subPartidas.length > 0 ? ` — ${subPartidas.join(', ').toUpperCase()}` : ''}`
                                : 'SIN CATEGORÍA';
                            const isPartial = req.status_revision === "Parcialmente Aprobada";
                            const materialsBadgeText = isPartial
                                ? `${itemCounts.approved} de ${itemCounts.total} materiales`
                                : `${itemCounts.total} materiales`;
                            const pipelineStages = getPipelineStages(req);
                            const pipelineBusy = isSubmittingStatusHistory && pendingStatusChange?.requisicionId === req._id;
                            const actionGroups = getRequisicionActionGroups(req);

                            return (
                                <div key={req._id} className="min-w-0 border border-border" data-requisicion-id={req._id}
                                    onContextMenu={(event) => openRequisicionContextMenu(event, req._id)}
                                    onKeyDown={(event) => openKeyboardContextMenu(event, req._id)}>
                                    {/* Card Header - Collapsed View */}
                                    <div
                                        className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 p-3 cursor-pointer hover:bg-muted/50 transition-colors border-b md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:p-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,.7fr)_minmax(0,.9fr)_minmax(0,1.2fr)_auto] 2xl:gap-4 2xl:py-6"
                                        onClick={() => toggleCard(req._id)}
                                    >
                                        {/* Avatar + Solicitante */}
                                        <div className="order-1 col-span-2 flex min-w-0 flex-col items-start gap-3 md:flex-row md:items-center 2xl:col-span-1">
                                            <div className="h-10 w-10 rounded-full bg-disabled flex items-center justify-center text-sm  text-muted-foreground flex-shrink-0">
                                                {req.solicitante_nombre?.charAt(0).toUpperCase() || "?"}
                                            </div>
                                            <div className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
                                                <span className="text-sm text-muted-foreground">
                                                    {req.solicitante_nombre || "-"}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    Solicitado el {formatDate(req.fecha_solicitud)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Category + Materials Count */}
                                        <div className="order-3 col-span-2 flex min-w-0 flex-col md:col-span-3 2xl:order-2 2xl:col-span-1">
                                            <button type="button" data-requisicion-title
                                                className="min-h-11 w-full text-left text-sm uppercase [overflow-wrap:anywhere] hover:underline focus-visible:outline focus-visible:outline-2"
                                                aria-label={`Ver detalles de ${categoryLabel}`}
                                                onClick={(event) => { event.stopPropagation(); openRequisicionDetails(req._id); }}>
                                                {categoryLabel}
                                            </button>
                                            <Badge variant="outline" className="w-fit mt-1">
                                                {materialsBadgeText}
                                            </Badge>
                                            {!!unreadRequisiciones?.[req._id] && <Badge className="mt-1 w-fit bg-blue-600 text-white">{unreadRequisiciones[req._id]} sin leer</Badge>}
                                            {req.pago_obra?.estado === "pendiente" && <Badge variant="outline" className="mt-1 max-w-full w-fit whitespace-normal text-left border-amber-500 text-amber-700 [overflow-wrap:anywhere]">Pago en obra pendiente · ${req.pago_obra.importe.toLocaleString("es-MX")}</Badge>}
                                        </div>

                                        {/* Fecha Entrega */}
                                        <div className="order-4 flex min-w-0 flex-col items-start [overflow-wrap:anywhere] md:col-span-1 2xl:order-3">
                                            {req.fecha_entrega ? (
                                                <>
                                                    <span className="text-sm ">{req.fecha_entrega}</span>
                                                    <span className="text-xs text-muted-foreground">Fecha de entrega</span>
                                                </>
                                            ) : (
                                                <span className="text-xs ">Sin fecha de entrega</span>
                                            )}
                                        </div>

                                        {/* Monto Total */}
                                        <div className="order-5 flex min-w-0 flex-col items-end text-right [overflow-wrap:anywhere] md:col-span-2 2xl:order-4 2xl:col-span-1">
                                            <span className="text-xs text-muted-foreground">Monto Total</span>
                                            <span className="text-foreground">
                                                ${reqMontoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        {/* Independent approval, payment and delivery controls */}
                                        <div className="order-6 col-span-2 min-w-0 md:col-span-3 2xl:order-5 2xl:col-span-1" onClick={(e) => e.stopPropagation()}>
                                            <div className="relative grid grid-cols-3 gap-1">
                                                {pipelineStages.map((stage) => {
                                                    const canUpdateStage = canUpdatePipelineStage(req, stage.key);
                                                    return (
                                                        <div key={stage.key} className="relative min-w-0">
                                                            <button type="button"
                                                                disabled={pipelineBusy || !canUpdateStage}
                                                                onClick={() => openPipelineStatusDialog(req, stage.key)}
                                                                aria-label={stage.key === "aprobadas" && !stage.complete ? "Revisar aprobación" : `Cambiar a ${stage.label}`}
                                                                title={!canUpdateStage ? "Sin permisos para actualizar este estado" : stage.complete ? "Condición cumplida" : stage.key === "aprobadas" ? "Revisar materiales" : `Cambiar a ${stage.label}`}
                                                                className={cn("relative z-10 flex min-h-11 w-full flex-col items-center gap-2 rounded-sm py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2", stage.complete ? "text-foreground" : "text-muted-foreground hover:text-foreground", (pipelineBusy || !canUpdateStage) && "cursor-not-allowed opacity-60")}>
                                                                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-card", stage.complete ? "border-[#50AC66] bg-[#50AC66]" : "border-border-strong")}>
                                                                    {pipelineBusy ? <Loader2 className="h-2 w-2 animate-spin" /> : <span className={cn("h-2 w-2 rounded-full", stage.complete ? "bg-[#50AC66]" : "bg-transparent")} />}
                                                                </span>
                                                                <span>{stage.label}</span>
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Actions Menu */}
                                        <div className="absolute right-3 top-3 order-2 flex items-center justify-end gap-1 md:static md:self-start 2xl:order-6 2xl:self-center" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-11 w-11 p-0 hover:bg-muted" aria-label="Acciones de requisición" title="Acciones de requisición">
                                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] border-border p-1 [&_[role=menuitem]]:min-h-11">
                                                    {actionGroups.map((group, groupIndex) => {
                                                        const items = group.actions.map((action) => {
                                                            const Icon = action.busy ? Loader2 : action.icon;
                                                            return (
                                                                <DropdownMenuItem key={action.label} disabled={action.disabled}
                                                                    className={cn("gap-2 focus:bg-muted focus:text-foreground", action.destructive && "text-red-600 focus:bg-red-50 focus:text-red-700")}
                                                                    onClick={action.onSelect}>
                                                                    <Icon className={cn("h-4 w-4", action.busy && "animate-spin", action.complete && "text-[#50AC66]")} />
                                                                    {action.label}
                                                                    {action.complete && <span className="ml-auto h-2 w-2 rounded-full bg-[#50AC66]" />}
                                                                </DropdownMenuItem>
                                                            );
                                                        });
                                                        return (
                                                            <Fragment key={group.label}>
                                                                {groupIndex === 0 && <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal uppercase tracking-wide text-muted-foreground">Acciones</DropdownMenuLabel>}
                                                                {(groupIndex === 1 || group.label === "Eliminar") && <DropdownMenuSeparator className="bg-muted" />}
                                                                {group.icon ? (
                                                                    <DropdownMenuSub>
                                                                        <DropdownMenuSubTrigger className="gap-2 focus:bg-muted data-[state=open]:bg-muted">
                                                                            <group.icon className="h-4 w-4" />{group.label}
                                                                        </DropdownMenuSubTrigger>
                                                                        <DropdownMenuSubContent className="w-56 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto border-border p-1 [&_[role=menuitem]]:min-h-11">
                                                                            {items}
                                                                        </DropdownMenuSubContent>
                                                                    </DropdownMenuSub>
                                                                ) : items}
                                                            </Fragment>
                                                        );
                                                    })}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <button
                                                onClick={() => toggleCard(req._id)}
                                                className="flex h-11 w-11 items-center justify-center hover:bg-muted rounded transition-colors"
                                                aria-label={isExpanded ? "Contraer requisición" : "Expandir requisición"}
                                                title={isExpanded ? "Contraer requisición" : "Expandir requisición"}
                                                aria-expanded={isExpanded}
                                                aria-controls={`requisicion-items-${req._id}`}
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Content */}
                                    {isExpanded && (
                                        <div id={`requisicion-items-${req._id}`} className="min-w-0 px-3 pb-4 pt-4 md:px-4 md:pb-6 md:pt-6">
                                            <RequisicionItems
                                                items={req.items ?? []}
                                                canReview={activeTab === "por_revisar" && isReviewUser}
                                                editedQuantities={editedQuantities}
                                                reviewingItemId={reviewingItemId}
                                                onQuantityChange={updateEditedQty}
                                                onApprove={handleApproveItem}
                                                onReject={handleRejectItem}
                                            />

                                            {/* Nota General */}
                                            <div className="mt-4 border-l-2 border-border pl-3 [overflow-wrap:anywhere] md:ml-4 md:pl-4 xl:ml-12">
                                                <p className="text-xs text-muted-foreground mb-1">Nota General:</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {req.descripcion || <span className="text-muted-foreground italic">Sin notas</span>}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {contextMenu && contextMenuRequisicion && (
                <RequisicionContextMenu
                    position={contextMenu}
                    groups={getRequisicionActionGroups(contextMenuRequisicion)}
                    returnFocus={contextMenu.returnFocus}
                    onClose={closeContextMenu}
                />
            )}

            <Dialog open={remissionReqId !== null} onOpenChange={(open) => { if (!open && !isUploadingRemission) closeRemissionDialog(); }}>
                <DialogContent className={cn(responsiveDialogClassName, "max-w-lg rounded-none")}>
                    <DialogHeader className="min-w-0 pr-10 text-left">
                        <DialogTitle>Agregar nota de remisión</DialogTitle>
                        <DialogDescription>
                            Agrega fotos a esta requisición pagada. El estado de entrega no cambiará.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <label className="cursor-pointer border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground hover:border-[#7EC18E]">
                                Tomar foto
                                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={isUploadingRemission} onChange={(event) => { addSelectedRemissionPhotos(event.target.files); event.target.value = ""; }} />
                            </label>
                            <label className="cursor-pointer border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground hover:border-[#7EC18E]">
                                Elegir fotos
                                <input type="file" accept="image/*" multiple className="hidden" disabled={isUploadingRemission} onChange={(event) => { addSelectedRemissionPhotos(event.target.files); event.target.value = ""; }} />
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground">Solo imágenes de hasta 10 MB por foto.</p>
                        {remissionPhotos.length > 0 && (
                            <ul className="max-h-44 space-y-2 overflow-y-auto text-sm">
                                {remissionPhotos.map((file, index) => (
                                    <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 border border-border px-3 py-2">
                                        <span className="min-w-0 truncate">{file.name}</span>
                                        <button type="button" className="text-red-600 hover:text-red-700" disabled={isUploadingRemission} onClick={() => setRemissionPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Quitar ${file.name}`}>
                                            <X className="h-4 w-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" onClick={closeRemissionDialog} disabled={isUploadingRemission}>Cancelar</Button>
                            <Button type="button" onClick={handleUploadRemissionPhotos} disabled={isUploadingRemission || remissionPhotos.length === 0}>
                                {isUploadingRemission && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar fotos
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={!!onsitePaymentReqId}
                onOpenChange={(open) => {
                    if (!open && !isRequestingOnsitePayment) setOnsitePaymentReqId(null);
                }}
            >
                <DialogContent className={cn(responsiveDialogClassName, "max-w-lg rounded-none")}>
                    <DialogHeader className="min-w-0 pr-10 text-left">
                        <DialogTitle>Solicitar pago en obra</DialogTitle>
                        <DialogDescription>Finanzas y Administración recibirán un aviso vinculado a esta requisición.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="onsite-payment-amount">Importe solicitado (MXN)</Label>
                            <Input id="onsite-payment-amount" type="number" min="0.01" step="0.01" value={onsitePaymentAmount} onChange={(e) => setOnsitePaymentAmount(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="onsite-payment-reason">Motivo</Label>
                            <Textarea id="onsite-payment-reason" maxLength={500} value={onsitePaymentReason} onChange={(e) => setOnsitePaymentReason(e.target.value)} placeholder="Describe el pago que debe hacerse en obra" />
                        </div>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button variant="outline" onClick={() => setOnsitePaymentReqId(null)} disabled={isRequestingOnsitePayment}>Cancelar</Button>
                            <Button onClick={handleRequestOnsitePayment} disabled={isRequestingOnsitePayment || !onsitePaymentReason.trim() || !(Number(onsitePaymentAmount) > 0)}>
                                {isRequestingOnsitePayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Enviar solicitud
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={statusHistoryDialogOpen} onOpenChange={(open) => {
                if (submittingStatusHistoryRef.current) return;
                if (!open) resetStatusHistoryDialog();
                else setStatusHistoryDialogOpen(true);
            }}>
                <DialogContent className={cn(responsiveDialogClassName, "max-w-lg rounded-none")}>
                    <DialogHeader className="min-w-0 pr-10 text-left">
                        <DialogTitle className="text-xl font-normal text-foreground">
                            {pendingStatusChange?.title || "Actualizar estado"}
                        </DialogTitle>
                        <DialogDescription>
                            {pendingTransition?.blockedReason
                                ? "Revisa el requisito pendiente antes de cambiar este estado."
                                : isMarkingAsPaid
                                ? "El comentario y el comprobante de pago son opcionales. El cambio quedará en el historial."
                                : pendingStatusChange?.description || "Registra el motivo del cambio para el historial de la requisición."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">
                        <div className="border border-border px-4 py-3 text-sm" data-status-consequences>
                            <p className="mb-3 font-medium">{pendingTransition?.blockedReason ? "Cambio pendiente" : "Cambios al guardar"}</p>
                            <dl className="space-y-3">
                                {pendingTransition?.rows.map((row) => <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <dt className="text-muted-foreground">{row.label}</dt>
                                    <dd className="text-right">{row.before === row.after
                                        ? <>{row.after} <span className="text-xs text-muted-foreground">· Se conserva</span></>
                                        : <><span className="text-muted-foreground">{row.before}</span> → <strong className="font-medium">{row.after}</strong></>}</dd>
                                </div>)}
                            </dl>
                        </div>
                        {pendingTransition?.blockedReason ? <div className="space-y-3" role="status">
                            <p className="text-sm text-muted-foreground">{pendingTransition.blockedReason}</p>
                            {isReviewUser && pendingRequisicion ? <Button type="button" onClick={() => reviewApproval(pendingRequisicion)}>Revisar materiales</Button>
                                : <p className="text-sm text-muted-foreground">Solicita la revisión a administración o finanzas.</p>}
                            <Button type="button" variant="outline" className="w-full" onClick={resetStatusHistoryDialog}>Cerrar</Button>
                        </div> : <fieldset disabled={isSubmittingStatusHistory} className="min-w-0 space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="status-history-comment" className="flex items-center gap-2 text-foreground">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                {isMarkingAsPaid ? "Comentario opcional" : isReceivingMaterials ? "Comentario (opcional con foto)" : "Comentario *"}
                            </Label>
                            <Textarea
                                id="status-history-comment"
                                value={statusHistoryComment}
                                onChange={(e) => setStatusHistoryComment(e.target.value)}
                                placeholder="Ej. Pago confirmado con transferencia, entrega validada en obra, aprobación autorizada por dirección..."
                                className="min-h-[110px] rounded-none border-border-strong resize-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-foreground">
                                <FileUp className="h-4 w-4 text-muted-foreground" />
                                {isReceivingMaterials ? "Foto de nota de remisión (opcional)" : "Documento opcional"}
                            </Label>
                            {isReceivingMaterials ? <div className="flex flex-wrap gap-2">
                                <label className="cursor-pointer border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground hover:border-[#7EC18E]">
                                    Tomar foto
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { setStatusHistoryDocument(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                                </label>
                                <label className="cursor-pointer border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground hover:border-[#7EC18E]">
                                    Elegir foto
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { setStatusHistoryDocument(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                                </label>
                            </div> : <label className="flex cursor-pointer items-center justify-between gap-3 border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground hover:border-[#7EC18E]">
                                <span className="flex min-w-0 flex-1 items-center gap-2">
                                    <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    <span className="truncate">
                                        {statusHistoryDocument ? statusHistoryDocument.name : "Adjuntar comprobante, factura o evidencia"}
                                    </span>
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">Seleccionar</span>
                                <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => setStatusHistoryDocument(e.target.files?.[0] ?? null)}
                                />
                            </label>}
                            {statusHistoryDocument && <p className="text-xs text-muted-foreground">Archivo seleccionado: {statusHistoryDocument.name}</p>}
                            {statusHistoryDocument && (
                                <button
                                    type="button"
                                    onClick={() => setStatusHistoryDocument(null)}
                                    className="min-h-11 text-xs text-red-600 hover:text-red-700"
                                >
                                    Quitar documento
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-none"
                                onClick={resetStatusHistoryDialog}
                                disabled={isSubmittingStatusHistory}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                className="rounded-none bg-[#50AC66] hover:bg-[#499b5c]"
                                onClick={handleConfirmStatusHistory}
                                disabled={isSubmittingStatusHistory || (!isMarkingAsPaid && !statusHistoryComment.trim() && !(isReceivingMaterials && statusHistoryDocument))}
                            >
                                {isSubmittingStatusHistory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar cambio
                            </Button>
                        </div>
                        </fieldset>}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Email Notification Dialog */}
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogContent className={cn(responsiveDialogClassName, "max-w-5xl rounded-none p-0 sm:p-0 overflow-hidden")}>
                    <div className="grid max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-y-auto lg:grid-cols-[360px_minmax(0,1fr)] lg:overflow-hidden">
                        <div className="space-y-5 border-b border-border p-4 sm:space-y-6 sm:p-6 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
                            <DialogHeader className="min-w-0 pr-10 text-left">
                                <DialogTitle className="flex items-center gap-2 text-xl font-normal text-foreground">
                                    <Mail className="h-5 w-5 text-muted-foreground" />
                                    Notificaciones por correo
                                </DialogTitle>
                                <DialogDescription>
                                    Envía una actualización con plantilla OGC a los usuarios con acceso a este proyecto.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-2">
                                <Label>Tipo de notificación</Label>
                                <Select value={notificationType} onValueChange={(value) => setNotificationType(value as RequisicionNotificationType)}>
                                    <SelectTrigger className="min-w-0 rounded-none h-11 [&>span]:truncate">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REQUISICION_NOTIFICATION_MATRIX.filter(item => item.type !== "onsite_payment_requested").map((item) => (
                                            <SelectItem key={item.type} value={item.type}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="border border-border bg-card p-4 text-sm">
                                <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Audiencia</p>
                                        <p className="mt-1 text-foreground">{selectedNotificationConfig.audienceLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Canal</p>
                                        <p className="mt-1 text-foreground">{selectedNotificationConfig.channelsLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Prioridad</p>
                                        <p className="mt-1 text-foreground">{selectedNotificationConfig.priorityLabel}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">SLA</p>
                                        <p className="mt-1 text-foreground">{selectedNotificationConfig.slaLabel}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Requisición</Label>
                                <Select value={selectedNotificationReqId} onValueChange={setSelectedNotificationReqId}>
                                    <SelectTrigger className="min-w-0 rounded-none h-11 [&>span]:truncate">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="latest">Última requisición</SelectItem>
                                        {requisiciones?.map((req) => (
                                            <SelectItem key={req._id} value={req._id}>
                                                {req.tipo === "equipo" ? "Equipo" : "Material"} · {req.solicitante_nombre}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Mensaje</Label>
                                <textarea
                                    value={notificationMessage}
                                    onChange={(e) => setNotificationMessage(e.target.value)}
                                    placeholder="Ej. Se requiere revisar esta requisición antes de autorizar la compra."
                                    className="min-h-28 w-full resize-none rounded-none border border-border-strong bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-border-strong"
                                />
                            </div>

                            <div className="border border-border bg-card p-4">
                                <p className="text-sm text-muted-foreground">Destinatarios</p>
                                <p className="mt-1 text-2xl text-foreground">{recipientsToNotifyCount}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Usuarios activos que coinciden con la audiencia definida.</p>
                                {notificationRequiresMissingReq && (
                                    <p className="mt-2 text-xs text-red-600">Este tipo requiere seleccionar una requisición.</p>
                                )}
                            </div>

                            <div className="border border-border bg-card p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-foreground">Eventos recientes</p>
                                    <Badge variant="outline" className="text-[10px]">
                                        notification_events
                                    </Badge>
                                </div>
                                <div className="mt-3 space-y-3">
                                    {!notificationEvents ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Cargando eventos...
                                        </div>
                                    ) : notificationEvents.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Aun no hay envios registrados para este proyecto.</p>
                                    ) : (
                                        notificationEvents.map((event) => {
                                            const readCount = event.deliveries.filter((delivery) => Boolean(delivery.read_at)).length;
                                            return (
                                                <div key={event._id} className="border border-border bg-card p-3">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-foreground">{event.subject}</p>
                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                                {event.actor_name} · {formatNotificationDate(event.sent_at || event.created_at)}
                                                            </p>
                                                        </div>
                                                        <Badge variant="secondary" className="shrink-0 rounded-none text-[10px] uppercase">
                                                            {({ pending: "En proceso", sent: "Enviado", partial: "Parcial", failed: "Fallido", no_recipients: "Sin destinatarios" } as Record<string, string>)[event.status] || event.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                                                        <span>Correos enviados: {event.sent_count}</span>
                                                        <span>Correos fallidos: {event.failed_count}</span>
                                                        <span>Leídos en app: {readCount}</span>
                                                    </div>
                                                    {event.deliveries.filter(delivery => delivery.channel === "email" && delivery.status === "failed").map(delivery => (
                                                        <p key={delivery._id} className="mt-2 text-xs text-red-700">{delivery.recipient_email}: {delivery.error || "No se pudo enviar el correo"}</p>
                                                    ))}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                                <Button
                                    variant="outline"
                                    className="w-full rounded-none sm:w-auto"
                                    onClick={() => setEmailDialogOpen(false)}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    className="w-full rounded-none bg-[#20243d] hover:bg-[#2e344f] sm:w-auto"
                                    onClick={handleSendEmailNotification}
                                    disabled={isSendingNotification || !emailRecipients || recipientsToNotifyCount === 0 || notificationRequiresMissingReq}
                                >
                                    {isSendingNotification ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="mr-2 h-4 w-4" />
                                    )}
                                    Enviar
                                </Button>
                            </div>
                        </div>

                        <div className="bg-muted p-4 sm:p-8 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
                            <div className="mx-auto max-w-[680px] overflow-hidden rounded-xl border border-border bg-card">
                                <div className="flex justify-center px-5 py-6 sm:px-8 sm:py-8">
                                    <img
                                        src="https://www.ogc.mx/_next/static/media/Logo.a1dfe6e3.svg"
                                        alt="OGC"
                                        className="h-14 w-auto"
                                    />
                                </div>
                                <div className="h-1 bg-[#20243d]" />
                                <div className="px-5 py-8 sm:px-8 sm:py-14 xl:px-14">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#EEF3F1] text-sm font-medium text-[#20243d]">
                                            {(currentUser?.name || "OGC")
                                                .split(" ")
                                                .filter(Boolean)
                                                .slice(0, 2)
                                                .map((part) => part[0])
                                                .join("")
                                                .toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xl leading-relaxed text-foreground sm:text-2xl">
                                                <span>{currentUser?.name || "Usuario OGC"} </span>
                                                <span className="text-[#0073EA]">{notificationCopy.action}</span>
                                                <span> en </span>
                                                <span className="font-semibold">{notificationCopy.requisicionTitle}</span>
                                            </p>
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
                                                <span className="h-2 w-2 rounded-full bg-[#50AC66]" />
                                                <span>{proyecto.nombre}</span>
                                                <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                                                <span>{notificationCopy.statusLabel}</span>
                                            </div>
                                            <p className="mt-8 text-sm text-muted-foreground">
                                                {new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                            </p>
                                            <p className="mt-6 text-lg leading-relaxed text-foreground">
                                                {notificationCopy.message}
                                            </p>
                                            <div className="mt-8 flex justify-center sm:mt-12">
                                                <Button className="w-full rounded bg-[#0073EA] px-6 py-6 text-base hover:bg-[#0065cf] sm:w-auto sm:px-8">
                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                    Ver requisiciones
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto p-4 [overflow-wrap:anywhere] sm:p-6 [&_button]:min-h-11">
                    <AlertDialogHeader className="text-left">
                        <AlertDialogTitle>¿Eliminar requisición?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará la requisición y sus items operativos,
                            pero se conservará el historial y los documentos asociados como respaldo de auditoría.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Provider Selection Dialog */}
            <Dialog open={providerDialogOpen} onOpenChange={(open) => {
                setProviderDialogOpen(open);
                if (!open) {
                    setSelectedProviderForView(null);
                    setIsEditingProvider(false);
                    setProviderSearchTerm("");
                }
            }}>
                <DialogContent className={cn(responsiveDialogClassName, "max-w-2xl flex flex-col")}>
                    {/* Show provider details/edit view */}
                    {selectedProviderForView && viewingProvider ? (
                        <>
                            <DialogHeader className="min-w-0 pr-10 text-left">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={backToProviderList}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center hover:bg-muted rounded"
                                        aria-label="Volver a proveedores"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <div>
                                        <DialogTitle>
                                            {isEditingProvider ? "Editar Proveedor" : "Detalles del Proveedor"}
                                        </DialogTitle>
                                        <DialogDescription>
                                            {isEditingProvider
                                                ? "Modifica los datos del proveedor"
                                                : viewingProvider.razon_social}
                                        </DialogDescription>
                                    </div>
                                </div>
                            </DialogHeader>

                            {isEditingProvider && canManageProviders ? (
                                <div className="min-w-0 shrink-0 space-y-4">
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Razón Social *</Label>
                                            <Input
                                                value={editProviderData.razon_social}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, razon_social: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>RFC</Label>
                                            <Input
                                                value={editProviderData.rfc}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, rfc: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Dirección</Label>
                                        <Input
                                            value={editProviderData.direccion}
                                            onChange={(e) => setEditProviderData(prev => ({ ...prev, direccion: e.target.value }))}
                                        />
                                    </div>
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Contacto</Label>
                                            <Input
                                                value={editProviderData.nombre_contacto}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, nombre_contacto: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Teléfono</Label>
                                            <Input
                                                value={editProviderData.telefono_contacto}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, telefono_contacto: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label>Banco</Label>
                                            <Input
                                                value={editProviderData.banco}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, banco: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Cuenta</Label>
                                            <Input
                                                value={editProviderData.cuenta}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, cuenta: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>CLABE</Label>
                                            <Input
                                                value={editProviderData.clabe}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, clabe: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
                                        <Button variant="outline" onClick={() => setIsEditingProvider(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleSaveProviderEdit}
                                            disabled={!editProviderData.razon_social || isSubmittingProvider}
                                        >
                                            {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Guardar Cambios
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="min-w-0 shrink-0 space-y-4">
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Razón Social</Label>
                                            <p className="">{viewingProvider.razon_social}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">RFC</Label>
                                            <p className="">{viewingProvider.rfc}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Dirección</Label>
                                        <p>{viewingProvider.direccion || "No especificada"}</p>
                                    </div>
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Contacto</Label>
                                            <p>{viewingProvider.nombre_contacto || "No especificado"}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Teléfono</Label>
                                            <p>{viewingProvider.telefono_contacto || "No especificado"}</p>
                                        </div>
                                    </div>
                                    <div className="border-t pt-4">
                                        <Label className="text-xs text-muted-foreground block mb-2">Información Bancaria</Label>
                                        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Banco</Label>
                                                <p className="text-sm">{viewingProvider.banco || "-"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Cuenta</Label>
                                                <p className="text-sm">{viewingProvider.cuenta || "-"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">CLABE</Label>
                                                <p className="text-sm">{viewingProvider.clabe || "-"}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {viewingProvider.creator_name && (
                                        <div className="border-t pt-4">
                                            <p className="text-xs text-muted-foreground">
                                                Creado por: {viewingProvider.creator_name}
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-between">
                                        <div>
                                            {canEditProvider(viewingProvider) && (
                                                <Button variant="outline" onClick={startEditingProvider}>
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Editar
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                            <Button variant="outline" onClick={backToProviderList}>
                                                Volver
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    setSelectedProviderId(viewingProvider._id);
                                                    handleAssignProvider();
                                                }}
                                                disabled={isSubmittingProvider}
                                            >
                                                {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Asignar este Proveedor
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <DialogHeader className="min-w-0 pr-10 text-left">
                                <DialogTitle>Asignar Proveedor</DialogTitle>
                                <DialogDescription>
                                    {canManageProviders ? "Selecciona un proveedor existente o crea uno nuevo." : "Selecciona un proveedor existente."}
                                </DialogDescription>
                            </DialogHeader>

                            {/* Mode Toggle */}
                            <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row">
                                <Button
                                    variant={providerMode === "select" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setProviderMode("select")}
                                    className="flex-1 rounded-none"
                                >
                                    <Building2 className="h-4 w-4 mr-2" />
                                    Seleccionar existente
                                </Button>
                                {canManageProviders && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setCommonProviderForEdit(null);
                                            setCommonProviderFormOpen(true);
                                        }}
                                        className="flex-1 rounded-none"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Crear nuevo
                                    </Button>
                                )}
                            </div>

                            {providerMode === "select" ? (
                                <div className="min-w-0 shrink-0 space-y-4 flex flex-col">
                                    {/* Search */}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar por nombre, RFC o contacto..."
                                            value={providerSearchTerm}
                                            onChange={(e) => setProviderSearchTerm(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>

                                    {/* Provider List */}
                                    <div className="flex-1 overflow-y-auto border rounded-lg max-h-[300px]">
                                        {filteredProviders.length === 0 ? (
                                            <div className="p-8 text-center text-muted-foreground">
                                                {providerSearchTerm ? "No se encontraron proveedores" : "No hay proveedores registrados"}
                                            </div>
                                        ) : (
                                            <div className="divide-y">
                                                {filteredProviders.map((proveedor) => (
                                                    <div
                                                        key={proveedor._id}
                                                        className={`p-3 hover: cursor-pointer flex items-center justify-between ${selectedProviderId === proveedor._id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                                                            }`}
                                                        onClick={() => setSelectedProviderId(proveedor._id)}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <p className=" text-foreground truncate">{proveedor.razon_social}</p>
                                                            <p className="text-sm text-muted-foreground">{proveedor.rfc}</p>
                                                            {proveedor.nombre_contacto && (
                                                                <p className="text-xs text-muted-foreground">{proveedor.nombre_contacto}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-2">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openProviderView(proveedor._id);
                                                                }}
                                                                className="flex h-11 w-11 items-center justify-center hover:bg-disabled rounded"
                                                                title="Ver detalles"
                                                            >
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            </button>
                                                            {canEditProvider(proveedor) && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setCommonProviderForEdit(proveedor);
                                                                        setCommonProviderFormOpen(true);
                                                                    }}
                                                                    className="flex h-11 w-11 items-center justify-center hover:bg-disabled rounded"
                                                                    title="Editar"
                                                                >
                                                                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
                                        <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleAssignProvider}
                                            disabled={!selectedProviderId || isSubmittingProvider}
                                        >
                                            {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Asignar
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Razón Social *</Label>
                                            <Input
                                                value={newProviderData.razon_social}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, razon_social: e.target.value }))}
                                                placeholder="Nombre de la empresa"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                                <Label>RFC</Label>
                                            <Input
                                                value={newProviderData.rfc}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, rfc: e.target.value }))}
                                                placeholder="RFC"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Dirección</Label>
                                        <Input
                                            value={newProviderData.direccion}
                                            onChange={(e) => setNewProviderData(prev => ({ ...prev, direccion: e.target.value }))}
                                            placeholder="Dirección"
                                        />
                                    </div>
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Contacto</Label>
                                            <Input
                                                value={newProviderData.nombre_contacto}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, nombre_contacto: e.target.value }))}
                                                placeholder="Nombre del contacto"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Teléfono</Label>
                                            <Input
                                                value={newProviderData.telefono_contacto}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, telefono_contacto: e.target.value }))}
                                                placeholder="Teléfono"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label>Banco</Label>
                                            <Input
                                                value={newProviderData.banco}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, banco: e.target.value }))}
                                                placeholder="Banco"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Cuenta</Label>
                                            <Input
                                                value={newProviderData.cuenta}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, cuenta: e.target.value }))}
                                                placeholder="No. Cuenta"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>CLABE</Label>
                                            <Input
                                                value={newProviderData.clabe}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, clabe: e.target.value }))}
                                                placeholder="CLABE"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
                                        <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleCreateProvider}
                                            disabled={!newProviderData.razon_social || isSubmittingProvider}
                                        >
                                            {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Crear y Asignar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <ProviderFormDialog
                open={commonProviderFormOpen}
                onOpenChange={(open) => {
                    setCommonProviderFormOpen(open);
                    if (!open) setCommonProviderForEdit(null);
                }}
                provider={commonProviderForEdit}
                onSaved={handleCommonProviderSaved}
            />

            {/* Requisicion Modal */}
            <RequisicionModal />

            {/* Requisicion History Modal */}
            <RequisicionHistoryModal />

        </div>
    );
}
