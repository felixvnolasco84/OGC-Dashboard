import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, Plus, ArrowUp, ArrowDown, X, Filter, Building2, Loader2, Eye, Edit2, ChevronLeft, Clock, ChevronDown, ChevronUp, XCircle, CheckCircle, CreditCard, PackageCheck, Mail, Send, ExternalLink, Paperclip, Trash2, UserPlus, Truck, Receipt, MessageSquare, FileUp } from "lucide-react";
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

type PipelineStageKey = "aprobadas" | "pagadas" | "recibidas";
type StatusHistoryDocument = {
    storage_id: Id<"_storage">;
    nombre: string;
    type: string;
    size: number;
};

export default function ProyectoRequisicionesPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();
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
    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [notificationType, setNotificationType] = useState("created");
    const [selectedNotificationReqId, setSelectedNotificationReqId] = useState<string>("latest");
    const [notificationMessage, setNotificationMessage] = useState("");
    const [isSendingNotification, setIsSendingNotification] = useState(false);
    const [statusHistoryDialogOpen, setStatusHistoryDialogOpen] = useState(false);
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

    // Inline review state
    const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
    const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);
    const [updatingPipelineReqId, setUpdatingPipelineReqId] = useState<string | null>(null);

    // Fetch project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch requisiciones for this project
    const requisiciones = useQuery(api.requisiciones.getByProyecto, proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip");

    const deleteRequisicion = useMutation(api.requisiciones.deleteRequisicion);
    const updateStatus = useMutation(api.requisiciones.updateStatus);
    const updateStatusEntrega = useMutation(api.requisiciones.updateStatusEntrega);
    const updateRequisicionProveedor = useMutation(api.requisiciones.update);
    const reviewRequisicionMutation = useMutation(api.requisiciones.reviewRequisicion);
    const reviewSingleItemMutation = useMutation(api.requisiciones.reviewSingleItem);
    const generateRequisicionUploadUrl = useMutation(api.requisiciones.generateUploadUrl);
    const createProveedor = useMutation(api.proveedores.create);

    // Fetch all proveedores
    const proveedores = useQuery(api.proveedores.getAll);
    const emailRecipients = useQuery(
        api.requisiciones.getEmailRecipients,
        proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Provider dialog state
    const [providerDialogOpen, setProviderDialogOpen] = useState(false);
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
    const updateProveedor = useMutation(api.proveedores.update);
    const markAsRead = useMutation(api.requisicion_history.markAsRead);
    const sendEmailNotification = useAction(api.requisiciones.sendEmailNotification);

    const requisicionModal = useRequisicionModal();
    const historyModal = useRequisicionHistoryModal();

    // Mark requisiciones as read when page loads
    useEffect(() => {
        if (currentUser?._id && proyectoId) {
            markAsRead({
                user_id: currentUser._id,
                proyecto: proyectoId as Id<"desarrollos">
            });
        }
    }, [currentUser?._id, proyectoId, markAsRead]);

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

    const notificationCopy = useMemo(() => {
        const actionByType: Record<string, string> = {
            created: "creo una requisicion",
            updated: "actualizo una requisicion",
            reviewed: "reviso una requisicion",
            assigned: "asigno proveedor",
            payment: "actualizo pago",
            delivery: "actualizo entrega",
        };
        const titleByType: Record<string, string> = {
            created: "Nueva requisicion",
            updated: "Requisicion actualizada",
            reviewed: "Revision de requisicion",
            assigned: "Proveedor asignado",
            payment: "Pago actualizado",
            delivery: "Entrega actualizada",
        };

        const requisicionTitle = selectedNotificationReq
            ? `${selectedNotificationReq.tipo === "equipo" ? "Equipo" : "Material"} solicitado`
            : "Requisiciones";
        const statusLabel = selectedNotificationReq?.status_revision || selectedNotificationReq?.status || "On Going";
        const message = notificationMessage.trim() || selectedNotificationReq?.descripcion || "Hay una actualizacion en las requisiciones del proyecto.";

        return {
            action: actionByType[notificationType] || "envio una notificacion",
            title: titleByType[notificationType] || "Notificacion",
            requisicionTitle,
            statusLabel,
            message,
        };
    }, [notificationMessage, notificationType, selectedNotificationReq]);

    const handleSendEmailNotification = async () => {
        if (!proyectoId) return;
        setIsSendingNotification(true);
        try {
            const result = await sendEmailNotification({
                proyecto: proyectoId as Id<"desarrollos">,
                requisicion_id: selectedNotificationReq?._id,
                notification_type: notificationType,
                message: notificationMessage.trim() || undefined,
            });
            toast.success("Notificacion enviada", {
                description: `Se envio a ${result.sent} destinatario${result.sent === 1 ? "" : "s"}.`,
            });
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

    const isRequisicionApproved = (req: NonNullable<typeof requisiciones>[number]) =>
        req.status_revision === "Aprobada" || req.status_revision === "Parcialmente Aprobada";

    const getPipelineStages = (req: NonNullable<typeof requisiciones>[number]) => [
        {
            key: "aprobadas" as const,
            label: "Aprobada",
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

    const approveRequisicion = async (
        req: NonNullable<typeof requisiciones>[number],
        comentario?: string,
        documentos?: StatusHistoryDocument[]
    ) => {
        if (!currentUser) return;
        if (!req.items?.length) {
            throw new Error("La requisición no tiene items para aprobar.");
        }

        await reviewRequisicionMutation({
            id: req._id,
            reviewer_id: currentUser._id,
            reviewer_name: currentUser.name,
            comentario,
            documentos,
            items: req.items.map((item) => ({
                item_id: item._id,
                status_revision: "aprobado",
                cantidad_aprobada: item.cantidad_aprobada ?? item.cantidad,
            })),
        });
    };

    const handlePipelineStageChange = async (
        req: NonNullable<typeof requisiciones>[number],
        targetStage: PipelineStageKey,
        comentario?: string,
        documentos?: StatusHistoryDocument[]
    ) => {
        if (!currentUser) return;

        if (!canUpdatePipelineStage(req, targetStage)) {
            toast.error("Sin permisos para actualizar este estado");
            return;
        }

        const needsApproval = !isRequisicionApproved(req);
        if (needsApproval && !(currentUser.role === "admin" || currentUser.role === "finance")) {
            toast.error("Primero debe aprobarse la requisición");
            return;
        }

        setUpdatingPipelineReqId(req._id);
        try {
            let pendingDocuments = documentos;
            const consumeDocuments = () => {
                const currentDocuments = pendingDocuments;
                pendingDocuments = undefined;
                return currentDocuments;
            };

            if (needsApproval) {
                await approveRequisicion(req, comentario, consumeDocuments());
            }

            if (targetStage === "aprobadas") {
                if (req.status === "Pagado") {
                    await updateStatus({
                        id: req._id,
                        status: "En proceso",
                        comentario,
                        documentos: consumeDocuments(),
                        changed_by_id: currentUser._id,
                        changed_by_name: currentUser.name,
                    });
                }
                if (req.status_entrega === "Completo") {
                    await updateStatusEntrega({
                        id: req._id,
                        status_entrega: "Pendiente",
                        comentario,
                        documentos: consumeDocuments(),
                        changed_by_id: currentUser._id,
                        changed_by_name: currentUser.name,
                    });
                }
            }

            if (targetStage === "pagadas") {
                if (req.status !== "Pagado") {
                    await updateStatus({
                        id: req._id,
                        status: "Pagado",
                        comentario,
                        documentos: consumeDocuments(),
                        changed_by_id: currentUser._id,
                        changed_by_name: currentUser.name,
                    });
                }
                if (req.status_entrega === "Completo") {
                    await updateStatusEntrega({
                        id: req._id,
                        status_entrega: "Pendiente",
                        comentario,
                        documentos: consumeDocuments(),
                        changed_by_id: currentUser._id,
                        changed_by_name: currentUser.name,
                    });
                }
            }

            if (targetStage === "recibidas" && req.status_entrega !== "Completo") {
                await updateStatusEntrega({
                    id: req._id,
                    status_entrega: "Completo",
                    comentario,
                    documentos: consumeDocuments(),
                    changed_by_id: currentUser._id,
                    changed_by_name: currentUser.name,
                });
            }

            toast.success("Pipeline actualizado");
        } catch (error) {
            console.error("Error updating requisicion pipeline:", error);
            toast.error("Error al actualizar", {
                description: error instanceof Error ? error.message : "No se pudo actualizar el pipeline.",
            });
        } finally {
            setUpdatingPipelineReqId(null);
        }
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
        if (!currentUser) return;
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
            setReviewingItemId(null);
        }
    };

    const handleRejectItem = async (itemId: Id<"requisicion_items">) => {
        if (!currentUser) return;
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
        documentos?: StatusHistoryDocument[]
    ) => {
        if (!currentUser) return;
        try {
            await updateStatus({
                id: requisicionId,
                status: newStatus,
                comentario,
                documentos,
                changed_by_id: currentUser._id,
                changed_by_name: currentUser.name,
            });
            toast.success("Estado de pago actualizado", {
                description: `La requisición ahora está "${newStatus}".`,
            });
        } catch (error) {
            console.error("Error updating status:", error);
            toast.error("Error al actualizar", {
                description: "No se pudo actualizar el estado de pago.",
            });
        }
    };

    const handleStatusEntregaChange = async (
        requisicionId: Id<"requisiciones">,
        newStatus: string,
        comentario?: string,
        documentos?: StatusHistoryDocument[]
    ) => {
        if (!currentUser) return;
        try {
            await updateStatusEntrega({
                id: requisicionId,
                status_entrega: newStatus,
                comentario,
                documentos,
                changed_by_id: currentUser._id,
                changed_by_name: currentUser.name,
            });
            toast.success("Estado de entrega actualizado", {
                description: `La entrega ahora está "${newStatus}".`,
            });
        } catch (error) {
            console.error("Error updating delivery status:", error);
            toast.error("Error al actualizar", {
                description: "No se pudo actualizar el estado de entrega.",
            });
        }
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
        const stageLabel = targetStage === "aprobadas"
            ? "Aprobada"
            : targetStage === "pagadas"
                ? "Pagada"
                : "Recibida";

        setPendingStatusChange({
            requisicionId: req._id,
            targetStage,
            title: `Cambiar a ${stageLabel}`,
            description: "Registra el motivo del cambio. Puedes adjuntar un comprobante, factura, evidencia de entrega u otro soporte.",
        });
        setStatusHistoryComment("");
        setStatusHistoryDocument(null);
        setStatusHistoryDialogOpen(true);
    };

    const openPaymentStatusDialog = (
        req: NonNullable<typeof requisiciones>[number],
        paymentStatus: string
    ) => {
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
        setPendingStatusChange({
            requisicionId: req._id,
            deliveryStatus,
            title: `Cambiar entrega a ${deliveryStatus}`,
            description: "Agrega un comentario para el historial. El documento es opcional y puede ser evidencia de entrega o remisión.",
        });
        setStatusHistoryComment("");
        setStatusHistoryDocument(null);
        setStatusHistoryDialogOpen(true);
    };

    const uploadStatusHistoryDocument = async (): Promise<StatusHistoryDocument[] | undefined> => {
        if (!statusHistoryDocument) return undefined;

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

    const handleConfirmStatusHistory = async () => {
        if (!pendingStatusChange) return;
        const comment = statusHistoryComment.trim();
        if (!comment) {
            toast.error("Agrega un comentario para registrar el cambio.");
            return;
        }

        const req = requisiciones?.find((item) => item._id === pendingStatusChange.requisicionId);
        if (!req) {
            toast.error("No se encontró la requisición.");
            return;
        }

        setIsSubmittingStatusHistory(true);
        try {
            const documentos = await uploadStatusHistoryDocument();

            if (pendingStatusChange.targetStage) {
                await handlePipelineStageChange(req, pendingStatusChange.targetStage, comment, documentos);
            } else if (pendingStatusChange.paymentStatus) {
                await handleStatusChange(req._id, pendingStatusChange.paymentStatus, comment, documentos);
            } else if (pendingStatusChange.deliveryStatus) {
                await handleStatusEntregaChange(req._id, pendingStatusChange.deliveryStatus, comment, documentos);
            }

            resetStatusHistoryDialog();
        } catch (error) {
            console.error("Error saving status history:", error);
            toast.error("Error al guardar el historial", {
                description: error instanceof Error ? error.message : "No se pudo registrar el cambio.",
            });
        } finally {
            setIsSubmittingStatusHistory(false);
        }
    };

    // const getStatusColor = (status: string) => {
    //     switch (status) {
    //         case "En proceso": return "bg-blue-50 text-blue-700 border border-blue-200";
    //         case "Cancelado": return "bg-red-50 text-red-700 border border-red-200";
    //         case "Pagado": return "bg-green-50 text-[#5FB473] border border-[#7EC18E]";
    //         default: return " text-gray-700 border border-gray-200";
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
        if (!selectedRequisicionForProvider || !newProviderData.razon_social || !newProviderData.rfc || !currentUser) return;

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
            p.rfc.toLowerCase().includes(searchLower) ||
            p.nombre_contacto?.toLowerCase().includes(searchLower)
        );
    }, [proveedores, providerSearchTerm]);

    // Get selected provider for view/edit
    const viewingProvider = useMemo(() => {
        if (!selectedProviderForView || !proveedores) return null;
        return proveedores.find(p => p._id === selectedProviderForView);
    }, [selectedProviderForView, proveedores]);

    // Check if user can edit provider (creator or admin)
    const canEditProvider = (provider: typeof viewingProvider) => {
        if (!provider || !currentUser) return false;
        if (currentUser.role === "admin") return true;
        if (provider.created_by === currentUser._id) return true;
        return false;
    };

    // Open provider details view
    const openProviderView = (providerId: string) => {
        const provider = proveedores?.find(p => p._id === providerId);
        if (provider) {
            setSelectedProviderForView(providerId);
            setIsEditingProvider(false);
            setEditProviderData({
                razon_social: provider.razon_social,
                rfc: provider.rfc,
                direccion: provider.direccion,
                nombre_contacto: provider.nombre_contacto,
                telefono_contacto: provider.telefono_contacto,
                cuenta: provider.cuenta,
                clabe: provider.clabe,
                banco: provider.banco,
            });
        }
    };

    // Start editing provider
    const startEditingProvider = () => {
        if (viewingProvider && canEditProvider(viewingProvider)) {
            setIsEditingProvider(true);
        }
    };

    // Save provider edits
    const handleSaveProviderEdit = async () => {
        if (!selectedProviderForView) return;

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

    if (!proyecto) {
        return (
            <div className="bg-white min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Cargando...</p>
            </div>
        );
    }

    return (
        <div className="bg-white min-h-screen">
            <div className="max-w-full mx-auto py-8 text-left">
                <div className="flex flex-col gap-4 px-12">
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Requisiciones</p>
                            <h1 className="text-2xl text-gray-700">{proyecto.nombre}</h1>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setEmailDialogOpen(true)}
                                variant="outline"
                                size="lg"
                                className="flex items-center gap-2 rounded-none text-gray-500 py-6"
                            >
                                <Mail className="h-5 w-5" />
                                Notificar
                            </Button>
                            {/* History Button */}
                            <Button
                                onClick={() => historyModal.openAllHistory(proyectoId as Id<"desarrollos">)}
                                variant="outline"
                                size="lg"
                                className="flex items-center gap-2 rounded-none text-gray-500 py-6"
                            >
                                <Clock className="h-5 w-5" />
                                Historial
                            </Button>
                            {/* Nueva Requisición - admin, user, or contratista (contratista can create their own) */}
                            {(currentUser?.role === "admin" || currentUser?.role === "user" || currentUser?.role === "contratista") && (
                                <Button
                                    onClick={() => requisicionModal.onOpen({ projectId: proyectoId as Id<"desarrollos"> }, "create")}
                                    variant="outline"
                                    size="lg"
                                    className="flex items-center gap-2 rounded-none text-gray-500 py-6"
                                >
                                    Nueva Requisición
                                    <Plus className="h-5 w-5" />
                                </Button>
                            )}
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-gray-100">
                                <span className="text-sm font-normal">
                                    Total: {requisiciones?.length || 0}
                                </span>
                            </Badge>
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-gray-100">
                                <span className="text-sm font-normal">
                                    Monto total: ${montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </Badge>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-4 relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                        <Input
                            type="text"
                            placeholder="Buscar por solicitante, descripción, familia, material..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 pr-24 rounded-none border-gray-300 h-12"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-2">
                            {hasActiveFilters && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearFilters}
                                    className="h-8 px-2 text-gray-500 hover:text-gray-700"
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    Limpiar
                                </Button>
                            )}
                            <Button
                                variant={showFilters ? "default" : "outline"}
                                size="sm"
                                onClick={() => setShowFilters(!showFilters)}
                                className="h-8 rounded-none"
                            >
                                <Filter className="h-4 w-4 mr-1" />
                                Filtros
                            </Button>
                        </div>
                    </div>

                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <div className="mb-6 p-4 border border-gray-200  space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Status Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm  text-gray-700">Estado</label>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="rounded-none h-10">
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
                                    <label className="text-sm  text-gray-700">Tipo</label>
                                    <Select value={tipoFilter} onValueChange={setTipoFilter}>
                                        <SelectTrigger className="rounded-none h-10">
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
                            <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
                                <span className="text-sm  text-gray-700">Ordenar por:</span>
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
                                <span className="text-sm text-gray-500 ml-auto">
                                    {filteredRequisiciones.length} de {requisiciones?.length || 0} requisiciones
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Tabs */}
                <div className="px-12 mb-4">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                        <TabsList className="bg-transparent h-auto p-0 gap-0 border-b border-gray-200 w-full justify-start rounded-none">
                            <TabsTrigger
                                value="por_revisar"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm font-normal text-gray-500 data-[state=active]:text-gray-900 gap-2"
                            >
                                Por revisar
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-gray-100">{tabCounts.por_revisar}</Badge>
                            </TabsTrigger>
                            <TabsTrigger
                                value="aprobadas"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm font-normal text-gray-500 data-[state=active]:text-gray-900 gap-2"
                            >
                                Aprobadas
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-gray-100">{tabCounts.aprobadas}</Badge>
                            </TabsTrigger>
                            <TabsTrigger
                                value="pagadas"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm font-normal text-gray-500 data-[state=active]:text-gray-900 gap-2"
                            >
                                Pagadas
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-gray-100">{tabCounts.pagadas}</Badge>
                            </TabsTrigger>
                            <TabsTrigger
                                value="recibidas"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm font-normal text-gray-500 data-[state=active]:text-gray-900 gap-2"
                            >
                                Recibidas
                                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs font-normal bg-gray-100">{tabCounts.recibidas}</Badge>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Cards List */}
                <div className="px-12 space-y-4">
                    {!requisiciones ? (
                        <div className="py-12 text-center text-gray-500">
                            Cargando requisiciones...
                        </div>
                    ) : filteredRequisiciones.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">
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
                            const pipelineBusy = updatingPipelineReqId === req._id;

                            return (
                                <div key={req._id} className="border border-[#EEEEEE] rounded-md">
                                    {/* Card Header - Collapsed View */}
                                    <div
                                        className="flex items-center gap-6 py-6 px-4 cursor-pointer hover:/50 transition-colors border-b"
                                        onClick={() => toggleCard(req._id)}
                                    >
                                        {/* Avatar + Solicitante */}
                                        <div className="flex items-center gap-3 min-w-[200px]">
                                            <div className="h-10 w-10 rounded-full bg-[#e8e7e4] flex items-center justify-center text-sm  text-gray-600 flex-shrink-0">
                                                {req.solicitante_nombre?.charAt(0).toUpperCase() || "?"}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm text-[#777770]">
                                                    {req.solicitante_nombre || "-"}
                                                </span>
                                                <span className="text-xs text-[#ADADA9]">
                                                    Solicitado el {formatDate(req.fecha_solicitud)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Category + Materials Count */}
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="text-sm text-[#777770] uppercase tracking-wide truncate">
                                                {categoryLabel}
                                            </span>
                                            <Badge variant="outline" className="w-fit h-fit mt-1 text-[9px] font-normal rounded-sm  text-[#B2B2AF] border-[#F4F4F4] bg-[#F4F4F4]">
                                                {materialsBadgeText}
                                            </Badge>
                                        </div>

                                        {/* Fecha Entrega */}
                                        <div className="flex flex-col items-start min-w-[100px]">
                                            {req.fecha_entrega ? (
                                                <>
                                                    <span className="text-sm text-[#777770]">{req.fecha_entrega}</span>
                                                    <span className="text-xs text-[#ADADA9]">Fecha de entrega</span>
                                                </>
                                            ) : (
                                                <span className="text-xs text-[#ADADA9]">Sin fecha de entrega</span>
                                            )}
                                        </div>

                                        {/* Monto Total */}
                                        <div className="flex flex-col items-end min-w-[140px]">
                                            <span className="text-xs text-gray-400">Monto Total</span>
                                            <span className="text-black">
                                                ${reqMontoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        {/* Status Pipeline */}
                                        <div className="min-w-[230px]" onClick={(e) => e.stopPropagation()}>
                                            <div className="relative">
                                                <div className="absolute left-3 right-3 top-3 h-0.5 bg-[#D0D0D0]" />
                                                <div className="relative grid grid-cols-3 gap-1">
                                                    {pipelineStages.map((stage, stageIndex) => {
                                                        const nextStage = pipelineStages[stageIndex + 1];
                                                        const segmentComplete = stage.complete && nextStage?.complete;
                                                        const canUpdateStage = canUpdatePipelineStage(req, stage.key);

                                                        return (
                                                            <div key={stage.key} className="relative flex flex-col items-center">
                                                                {segmentComplete && (
                                                                    <span className="pointer-events-none absolute left-1/2 top-3 h-0.5 w-full bg-[#50AC66]" />
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    disabled={pipelineBusy || !canUpdateStage}
                                                                    onClick={() => openPipelineStatusDialog(req, stage.key)}
                                                                    className={cn(
                                                                        "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-white transition-colors",
                                                                        stage.complete
                                                                            ? "border-[#50AC66] bg-[#50AC66] text-white"
                                                                            : "border-[#9B9B9B] text-[#9B9B9B] hover:border-[#7EC18E] hover:text-[#50AC66]",
                                                                        (pipelineBusy || !canUpdateStage) && "cursor-not-allowed opacity-60"
                                                                    )}
                                                                    title={`Cambiar a ${stage.label}`}
                                                                >
                                                                    {pipelineBusy ? (
                                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                                    ) : (
                                                                        <span
                                                                            className={cn(
                                                                                "h-2 w-2 rounded-full",
                                                                                stage.complete ? "bg-[#50AC66]" : "bg-transparent"
                                                                            )}
                                                                        />
                                                                    )}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={pipelineBusy || !canUpdateStage}
                                                                    onClick={() => openPipelineStatusDialog(req, stage.key)}
                                                                    className={cn(
                                                                        "mt-1 text-[10px] leading-none transition-colors",
                                                                        stage.complete ? "font-medium text-[#282822]" : "text-[#777770] hover:text-[#282822]",
                                                                        (pipelineBusy || !canUpdateStage) && "cursor-not-allowed opacity-60"
                                                                    )}
                                                                >
                                                                    {stage.label}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions Menu */}
                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 rounded-none p-0 hover:bg-gray-100">
                                                        <MoreVertical className="h-4 w-4 text-gray-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-72 rounded-none border-gray-200 p-1">
                                                    <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal uppercase tracking-wide text-[#ADADA9]">
                                                        Acciones
                                                    </DropdownMenuLabel>
                                                    <DropdownMenuItem
                                                        className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 focus:text-[#282822]"
                                                        onClick={() => requisicionModal.onOpen({
                                                            projectId: proyectoId as Id<"desarrollos">,
                                                            requisicionId: req._id
                                                        }, "view")}
                                                    >
                                                        <Eye className="h-4 w-4 text-gray-400" />
                                                        Ver detalles
                                                    </DropdownMenuItem>
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <DropdownMenuItem
                                                                className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 focus:text-[#282822]"
                                                                onClick={() => requisicionModal.onOpen({
                                                                    projectId: proyectoId as Id<"desarrollos">,
                                                                    requisicionId: req._id
                                                                }, "edit")}
                                                            >
                                                                <Edit2 className="h-4 w-4 text-gray-400" />
                                                                Editar
                                                            </DropdownMenuItem>
                                                        )}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <DropdownMenuItem
                                                                className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 focus:text-[#282822]"
                                                                onClick={() => openProviderDialog(req._id)}
                                                            >
                                                                <UserPlus className="h-4 w-4 text-gray-400" />
                                                                Agregar proveedor
                                                            </DropdownMenuItem>
                                                        )}

                                                    <DropdownMenuSeparator className="bg-gray-100" />

                                                    <DropdownMenuSub>
                                                        <DropdownMenuSubTrigger className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 data-[state=open]:bg-gray-100">
                                                            <CheckCircle className="h-4 w-4 text-[#50AC66]" />
                                                            Cambiar etapa
                                                        </DropdownMenuSubTrigger>
                                                        <DropdownMenuSubContent className="w-56 rounded-none border-gray-200 p-1">
                                                            {pipelineStages.map((stage) => {
                                                                const StageIcon = stage.icon;
                                                                const canUpdateStage = canUpdatePipelineStage(req, stage.key);

                                                                return (
                                                                    <DropdownMenuItem
                                                                        key={stage.key}
                                                                        disabled={pipelineBusy || !canUpdateStage}
                                                                        className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 focus:text-[#282822]"
                                                                        onClick={() => openPipelineStatusDialog(req, stage.key)}
                                                                    >
                                                                        {pipelineBusy ? (
                                                                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                                                        ) : (
                                                                            <StageIcon className={cn("h-4 w-4", stage.complete ? "text-[#50AC66]" : "text-gray-400")} />
                                                                        )}
                                                                        <span>Mover a {stage.label}</span>
                                                                        {stage.complete && <span className="ml-auto h-2 w-2 rounded-full bg-[#50AC66]" />}
                                                                    </DropdownMenuItem>
                                                                );
                                                            })}
                                                        </DropdownMenuSubContent>
                                                    </DropdownMenuSub>

                                                    {(currentUser?.role === "admin" || currentUser?.role === "finance") && (
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 data-[state=open]:bg-gray-100">
                                                                <Receipt className="h-4 w-4 text-gray-400" />
                                                                Estado de pago
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuSubContent className="w-52 rounded-none border-gray-200 p-1">
                                                                {(currentUser?.role === "finance"
                                                                    ? ["Pagado", "Cancelado"]
                                                                    : ["En proceso", "Pagado", "Cancelado"]
                                                                ).map(s => (
                                                                    <DropdownMenuItem
                                                                        key={s}
                                                                        disabled={s === req.status}
                                                                        className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 focus:text-[#282822]"
                                                                        onClick={() => openPaymentStatusDialog(req, s)}
                                                                    >
                                                                        <CreditCard className={cn("h-4 w-4", s === "Pagado" ? "text-[#50AC66]" : s === "Cancelado" ? "text-red-500" : "text-gray-400")} />
                                                                        {s}
                                                                        {s === req.status && <span className="ml-auto h-2 w-2 rounded-full bg-[#50AC66]" />}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuSub>
                                                    )}

                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <DropdownMenuSub>
                                                                <DropdownMenuSubTrigger className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 data-[state=open]:bg-gray-100">
                                                                    <Truck className="h-4 w-4 text-gray-400" />
                                                                    Estado de entrega
                                                                </DropdownMenuSubTrigger>
                                                                <DropdownMenuSubContent className="w-52 rounded-none border-gray-200 p-1">
                                                                    {["Pendiente", "Parcial", "Completo"].map(s => {
                                                                        const isCurrent = s === (req.status_entrega || "Pendiente");

                                                                        return (
                                                                            <DropdownMenuItem
                                                                                key={s}
                                                                                disabled={isCurrent}
                                                                                className="gap-2 rounded-none text-[#777770] focus:bg-gray-100 focus:text-[#282822]"
                                                                                onClick={() => openDeliveryStatusDialog(req, s)}
                                                                            >
                                                                                <PackageCheck className={cn("h-4 w-4", s === "Completo" ? "text-[#50AC66]" : s === "Parcial" ? "text-yellow-600" : "text-gray-400")} />
                                                                                {s}
                                                                                {isCurrent && <span className="ml-auto h-2 w-2 rounded-full bg-[#50AC66]" />}
                                                                            </DropdownMenuItem>
                                                                        );
                                                                    })}
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuSub>
                                                        )}

                                                    {(currentUser?.role === "admin" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <>
                                                                <DropdownMenuSeparator className="bg-gray-100" />
                                                                <DropdownMenuItem
                                                                    className="gap-2 rounded-none text-red-600 focus:bg-red-50 focus:text-red-700"
                                                                    onClick={() => openDeleteDialog(req._id)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                    Eliminar
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <button
                                                onClick={() => toggleCard(req._id)}
                                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="h-4 w-4 text-gray-400" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-gray-400" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Content */}
                                    {isExpanded && (
                                        <div className="px-4 pb-6 pt-6">
                                            {/* Items Table */}
                                            <div className="rounded-sm overflow-hidden">
                                                <table className="w-full border-separate border-spacing-y-2">
                                                    <thead>
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-xs font-normal text-gray-500">Partida / Subpartida</th>
                                                            <th className="px-4 py-3 text-left text-xs font-normal text-gray-500">Unidad</th>
                                                            <th className="px-4 py-3 text-right text-xs font-normal text-gray-500">Cantidad</th>
                                                            <th className="px-4 py-3 text-right text-xs font-normal text-gray-500">Precio Unitario</th>
                                                            <th className="px-4 py-3 text-right text-xs font-normal text-gray-500">Ejercido</th>
                                                            <th className="px-4 py-3 text-center text-xs font-normal text-gray-500">Solicitado</th>
                                                            <th className="px-4 py-3 text-center text-xs font-normal text-gray-500">Aprobado</th>
                                                            <th className="px-4 py-3 text-right text-xs font-normal text-gray-500">Monto</th>
                                                            <th className="px-4 py-3 text-center text-xs font-normal text-gray-500 w-[120px]"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="text-[#282822]">
                                                        {req.items?.map((item) => {
                                                            const isRejected = item.status_revision === "rechazado";
                                                            const isItemApproved = item.status_revision === "aprobado";
                                                            const isPending = !item.status_revision || item.status_revision === "pendiente";
                                                            const precioUnitario = item.precio_unitario ?? 0;
                                                            const presupuestoAprobado = item.presupuesto_aprobado ?? 0;
                                                            const pagado = item.pagado ?? 0;
                                                            const ejercido = presupuestoAprobado > 0
                                                                ? Math.round((pagado / presupuestoAprobado) * 100)
                                                                : 0;
                                                            const isLoading = reviewingItemId === item._id;
                                                            const qtyModified = isItemApproved && item.cantidad_aprobada !== undefined && item.cantidad_aprobada !== item.cantidad;
                                                            const showInlineReview = activeTab === "por_revisar" && isReviewUser && isPending;

                                                            return (
                                                                <tr key={item._id} className={cn(
                                                                    "transition-colors rounded-lg overflow-hidden bg-[#FBFBFB] border border-[#ECECEC]",
                                                                    isRejected && "opacity-40 bg-[#CD56364A] border-[#FBE8E0]",
                                                                    isItemApproved && "border-green-200",
                                                                )}>
                                                                    <td className="px-4 py-3">
                                                                        <span className="text-sm text-gray-900 uppercase">
                                                                            {item.sub_partida || item.familia}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm text-gray-600">{item.unidad}</td>
                                                                    <td className="px-4 py-3 text-sm text-gray-700 text-right">
                                                                        {item.cantidad.toLocaleString("es-MX")}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm text-gray-700 text-right">
                                                                        ${precioUnitario.toLocaleString("es-MX")}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm text-gray-700 text-right">
                                                                        {ejercido}%
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className="text-sm text-gray-700">
                                                                            {item.cantidad} {item.unidad}
                                                                        </span>
                                                                    </td>
                                                                    {/* Aprobado column */}
                                                                    <td className="px-4 py-3 text-center">
                                                                        {showInlineReview ? (
                                                                            <div className="flex items-center justify-center gap-1">
                                                                                <input
                                                                                    type="number"
                                                                                    min={1}
                                                                                    value={editedQuantities[item._id] ?? item.cantidad}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    onChange={(e) => updateEditedQty(item._id, Number(e.target.value))}
                                                                                    className="w-16 px-2 py-1 text-sm border border-gray-300 text-center rounded-sm bg-white text-gray-700"
                                                                                />
                                                                                <span className="text-xs text-gray-400">{item.unidad}</span>
                                                                            </div>
                                                                        ) : qtyModified ? (
                                                                            <div className="flex items-center justify-center gap-1">
                                                                                <span className="text-sm text-gray-400 line-through">{item.cantidad}</span>
                                                                                <span className="text-sm text-gray-900 font-medium">{item.cantidad_aprobada}</span>
                                                                                <span className="text-xs text-gray-400">{item.unidad}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className={cn(
                                                                                "inline-flex items-center px-2.5 py-1 text-sm border rounded-sm",
                                                                                isItemApproved ? "border-gray-300 text-gray-900 bg-white" : "border-gray-200 text-gray-400"
                                                                            )}>
                                                                                {item.cantidad_aprobada ?? item.cantidad} {item.unidad}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                                                        ${(item.monto || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </td>
                                                                    {/* Actions column */}
                                                                    <td className="px-4 py-3">
                                                                        {showInlineReview ? (
                                                                            <div className="flex items-center justify-center gap-1.5">
                                                                                {isLoading ? (
                                                                                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                                                                ) : (
                                                                                    <>
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); handleApproveItem(item._id, editedQuantities[item._id] ?? item.cantidad); }}
                                                                                            className="text-[#C5C5C3] hover:text-green-600 transition-colors"
                                                                                            title="Aprobar"
                                                                                        >
                                                                                            <CheckCircle className="w-5 h-5" />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); handleRejectItem(item._id); }}
                                                                                            className="text-[#C5C5C3] hover:text-red-500 transition-colors"
                                                                                            title="Rechazar"
                                                                                        >
                                                                                            <XCircle className="w-5 h-5" />
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        ) : isItemApproved ? (
                                                                            <div className="flex justify-center">
                                                                                <CheckCircle className="w-4 h-4 text-green-600" />
                                                                            </div>
                                                                        ) : isRejected ? (
                                                                            <div className="flex justify-center">
                                                                                <XCircle className="w-4 h-4 text-red-500" />
                                                                            </div>
                                                                        ) : null}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Nota General */}
                                            <div className="ml-12 mt-4 border-l-2 border-gray-200 pl-4">
                                                <p className="text-xs text-gray-400 mb-1">Nota General:</p>
                                                <p className="text-sm text-gray-600">
                                                    {req.descripcion || <span className="text-gray-300 italic">Sin notas</span>}
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

            <Dialog open={statusHistoryDialogOpen} onOpenChange={(open) => {
                if (!open && !isSubmittingStatusHistory) resetStatusHistoryDialog();
                else setStatusHistoryDialogOpen(open);
            }}>
                <DialogContent className="max-w-lg rounded-none">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-normal text-gray-900">
                            {pendingStatusChange?.title || "Actualizar estado"}
                        </DialogTitle>
                        <DialogDescription>
                            {pendingStatusChange?.description || "Registra el motivo del cambio para el historial de la requisición."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">
                        <div className="rounded-none border border-[#EEEEEE] bg-[#F8F8F7] px-4 py-3 text-sm text-[#777770]">
                            <div className="flex items-start gap-3">
                                <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#50AC66]" />
                                <p>
                                    El comentario queda guardado en el historial del cambio. El documento es opcional para respaldar la aprobacion, pago o entrega.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-[#282822]">
                                <MessageSquare className="h-4 w-4 text-gray-400" />
                                Comentario *
                            </Label>
                            <Textarea
                                value={statusHistoryComment}
                                onChange={(e) => setStatusHistoryComment(e.target.value)}
                                placeholder="Ej. Pago confirmado con transferencia, entrega validada en obra, aprobación autorizada por dirección..."
                                className="min-h-[110px] rounded-none border-gray-300 resize-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-[#282822]">
                                <FileUp className="h-4 w-4 text-gray-400" />
                                Documento opcional
                            </Label>
                            <label className="flex cursor-pointer items-center justify-between gap-3 border border-dashed border-gray-300 px-4 py-3 text-sm text-[#777770] hover:border-[#7EC18E]">
                                <span className="flex min-w-0 items-center gap-2">
                                    <Paperclip className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                    <span className="truncate">
                                        {statusHistoryDocument ? statusHistoryDocument.name : "Adjuntar comprobante, factura o evidencia"}
                                    </span>
                                </span>
                                <span className="text-xs text-[#ADADA9]">Seleccionar</span>
                                <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => setStatusHistoryDocument(e.target.files?.[0] ?? null)}
                                />
                            </label>
                            {statusHistoryDocument && (
                                <button
                                    type="button"
                                    onClick={() => setStatusHistoryDocument(null)}
                                    className="text-xs text-red-600 hover:text-red-700"
                                >
                                    Quitar documento
                                </button>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
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
                                disabled={isSubmittingStatusHistory || !statusHistoryComment.trim()}
                            >
                                {isSubmittingStatusHistory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar cambio
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Email Notification Dialog */}
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogContent className="max-w-5xl rounded-none p-0 overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr]">
                        <div className="border-r border-gray-200 p-6 space-y-6">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-xl font-normal text-gray-900">
                                    <Mail className="h-5 w-5 text-gray-500" />
                                    Notificaciones por correo
                                </DialogTitle>
                                <DialogDescription>
                                    Envía una actualización con plantilla OGC a los usuarios con acceso a este proyecto.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-2">
                                <Label>Tipo de notificación</Label>
                                <Select value={notificationType} onValueChange={setNotificationType}>
                                    <SelectTrigger className="rounded-none h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="created">Nueva requisición</SelectItem>
                                        <SelectItem value="updated">Actualización</SelectItem>
                                        <SelectItem value="reviewed">Revisión</SelectItem>
                                        <SelectItem value="assigned">Proveedor asignado</SelectItem>
                                        <SelectItem value="payment">Pago</SelectItem>
                                        <SelectItem value="delivery">Entrega</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Requisición</Label>
                                <Select value={selectedNotificationReqId} onValueChange={setSelectedNotificationReqId}>
                                    <SelectTrigger className="rounded-none h-10">
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
                                    className="min-h-28 w-full resize-none rounded-none border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500"
                                />
                            </div>

                            <div className="border border-gray-200 bg-[#FBFBFB] p-4">
                                <p className="text-sm text-gray-500">Destinatarios</p>
                                <p className="mt-1 text-2xl text-gray-900">{emailRecipients?.filter((recipient) => recipient.email !== currentUser?.email).length ?? 0}</p>
                                <p className="mt-1 text-xs text-gray-500">Usuarios activos con acceso al proyecto.</p>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    className="rounded-none"
                                    onClick={() => setEmailDialogOpen(false)}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    className="rounded-none bg-[#20243d] hover:bg-[#2e344f]"
                                    onClick={handleSendEmailNotification}
                                    disabled={isSendingNotification || !emailRecipients || emailRecipients.length === 0}
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

                        <div className="bg-[#F3F4F6] p-8 overflow-y-auto">
                            <div className="mx-auto max-w-[680px] overflow-hidden rounded-xl border border-gray-200 bg-white">
                                <div className="flex justify-center px-8 py-8">
                                    <img
                                        src="https://www.ogc.mx/_next/static/media/Logo.a1dfe6e3.svg"
                                        alt="OGC"
                                        className="h-14 w-auto"
                                    />
                                </div>
                                <div className="h-1 bg-[#20243d]" />
                                <div className="px-8 py-14 sm:px-14">
                                    <div className="flex items-start gap-5">
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
                                            <p className="text-2xl leading-relaxed text-gray-900">
                                                <span>{currentUser?.name || "Usuario OGC"} </span>
                                                <span className="text-[#0073EA]">{notificationCopy.action}</span>
                                                <span> en </span>
                                                <span className="font-semibold">{notificationCopy.requisicionTitle}</span>
                                            </p>
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-base text-gray-500">
                                                <span className="h-2 w-2 rounded-full bg-[#50AC66]" />
                                                <span>{proyecto.nombre}</span>
                                                <ChevronDown className="h-4 w-4 -rotate-90 text-gray-400" />
                                                <span>{notificationCopy.statusLabel}</span>
                                            </div>
                                            <p className="mt-8 text-sm text-gray-500">
                                                {new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                            </p>
                                            <p className="mt-6 text-lg leading-relaxed text-gray-900">
                                                {notificationCopy.message}
                                            </p>
                                            <div className="mt-12 flex justify-center">
                                                <Button className="rounded bg-[#0073EA] px-8 py-6 text-base hover:bg-[#0065cf]">
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
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar requisición?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará la requisición, todos sus items
                            y documentos asociados de forma permanente.
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
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                    {/* Show provider details/edit view */}
                    {selectedProviderForView && viewingProvider ? (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={backToProviderList}
                                        className="p-1 hover:bg-gray-100 rounded"
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

                            {isEditingProvider ? (
                                <div className="space-y-4 overflow-y-auto flex-1">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Razón Social *</Label>
                                            <Input
                                                value={editProviderData.razon_social}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, razon_social: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>RFC *</Label>
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
                                    <div className="grid grid-cols-2 gap-4">
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
                                    <div className="grid grid-cols-3 gap-4">
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
                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button variant="outline" onClick={() => setIsEditingProvider(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleSaveProviderEdit}
                                            disabled={!editProviderData.razon_social || !editProviderData.rfc || isSubmittingProvider}
                                        >
                                            {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Guardar Cambios
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 overflow-y-auto flex-1">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Razón Social</Label>
                                            <p className="">{viewingProvider.razon_social}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">RFC</Label>
                                            <p className="">{viewingProvider.rfc}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Dirección</Label>
                                        <p>{viewingProvider.direccion || "No especificada"}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Contacto</Label>
                                            <p>{viewingProvider.nombre_contacto || "No especificado"}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Teléfono</Label>
                                            <p>{viewingProvider.telefono_contacto || "No especificado"}</p>
                                        </div>
                                    </div>
                                    <div className="border-t pt-4">
                                        <Label className="text-xs text-gray-500 block mb-2">Información Bancaria</Label>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-gray-400">Banco</Label>
                                                <p className="text-sm">{viewingProvider.banco || "-"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-gray-400">Cuenta</Label>
                                                <p className="text-sm">{viewingProvider.cuenta || "-"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-gray-400">CLABE</Label>
                                                <p className="text-sm">{viewingProvider.clabe || "-"}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {viewingProvider.creator_name && (
                                        <div className="border-t pt-4">
                                            <p className="text-xs text-gray-400">
                                                Creado por: {viewingProvider.creator_name}
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex justify-between gap-2 pt-4">
                                        <div>
                                            {canEditProvider(viewingProvider) && (
                                                <Button variant="outline" onClick={startEditingProvider}>
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Editar
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
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
                            <DialogHeader>
                                <DialogTitle>Asignar Proveedor</DialogTitle>
                                <DialogDescription>
                                    Selecciona un proveedor existente o crea uno nuevo.
                                </DialogDescription>
                            </DialogHeader>

                            {/* Mode Toggle */}
                            <div className="flex gap-2 border-b border-gray-200 pb-4">
                                <Button
                                    variant={providerMode === "select" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setProviderMode("select")}
                                    className="flex-1 rounded-none"
                                >
                                    <Building2 className="h-4 w-4 mr-2" />
                                    Seleccionar existente
                                </Button>
                                <Button
                                    variant={providerMode === "create" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setProviderMode("create")}
                                    className="flex-1 rounded-none"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Crear nuevo
                                </Button>
                            </div>

                            {providerMode === "select" ? (
                                <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                                    {/* Search */}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                                            <div className="p-8 text-center text-gray-500">
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
                                                            <p className=" text-gray-900 truncate">{proveedor.razon_social}</p>
                                                            <p className="text-sm text-gray-500">{proveedor.rfc}</p>
                                                            {proveedor.nombre_contacto && (
                                                                <p className="text-xs text-gray-400">{proveedor.nombre_contacto}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-2">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openProviderView(proveedor._id);
                                                                }}
                                                                className="p-1.5 hover:bg-gray-200 rounded"
                                                                title="Ver detalles"
                                                            >
                                                                <Eye className="h-4 w-4 text-gray-500" />
                                                            </button>
                                                            {canEditProvider(proveedor) && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openProviderView(proveedor._id);
                                                                        setTimeout(() => setIsEditingProvider(true), 100);
                                                                    }}
                                                                    className="p-1.5 hover:bg-gray-200 rounded"
                                                                    title="Editar"
                                                                >
                                                                    <Edit2 className="h-4 w-4 text-gray-500" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4">
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
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Razón Social *</Label>
                                            <Input
                                                value={newProviderData.razon_social}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, razon_social: e.target.value }))}
                                                placeholder="Nombre de la empresa"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>RFC *</Label>
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
                                    <div className="grid grid-cols-2 gap-4">
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
                                    <div className="grid grid-cols-3 gap-4">
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
                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleCreateProvider}
                                            disabled={!newProviderData.razon_social || !newProviderData.rfc || isSubmittingProvider}
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

            {/* Requisicion Modal */}
            <RequisicionModal />

            {/* Requisicion History Modal */}
            <RequisicionHistoryModal />

        </div>
    );
}
