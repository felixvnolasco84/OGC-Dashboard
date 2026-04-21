import { useState, useMemo, useEffect, Fragment } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, Plus, ArrowUp, ArrowDown, X, Filter, Building2, Loader2, Eye, Edit2, ChevronLeft, Check, Clock, ChevronDown, ChevronUp, XCircle, CheckCircle, Minus, AlertTriangle, MessageSquare } from "lucide-react";
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
import { Popover } from "@radix-ui/react-popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

    // Review mode state
    const [reviewingReqId, setReviewingReqId] = useState<Id<"requisiciones"> | null>(null);
    const [reviewItemDecisions, setReviewItemDecisions] = useState<{
        item_id: Id<"requisicion_items">;
        status_revision: "aprobado" | "rechazado";
        cantidad_aprobada: number;
        nota_item: string;
        cantidad_original: number;
    }[]>([]);
    const [reviewNote, setReviewNote] = useState("");
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

    // Fetch project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch requisiciones for this project
    const requisiciones = useQuery(api.requisiciones.getByProyecto, proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip");

    const deleteRequisicion = useMutation(api.requisiciones.deleteRequisicion);
    const updateStatus = useMutation(api.requisiciones.updateStatus);
    const updateStatusEntrega = useMutation(api.requisiciones.updateStatusEntrega);
    const updateRequisicionProveedor = useMutation(api.requisiciones.update);
    const reviewMutation = useMutation(api.requisiciones.reviewRequisicion);
    const createProveedor = useMutation(api.proveedores.create);

    // Fetch all proveedores
    const proveedores = useQuery(api.proveedores.getAll);

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

    // Toggle card expansion
    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Get status badge config
    const getStatusBadge = (req: NonNullable<typeof requisiciones>[number]) => {
        if (req.status === "Cancelado") return { label: "Cancelado", color: "border-red-200  text-red-700", icon: <XCircle className="w-4 h-4" /> };
        if (req.status_revision === "Aprobada") return { label: "Aprobado", color: "border-[#7EC18E]  text-[#5FB473]", icon: <Check className="w-4 h-4 rounded-full p-0.5 text-white bg-[#50AC66]" /> };
        if (req.status_revision === "Parcialmente Aprobada") return { label: "Aprobado", color: "border-[#7EC18E]  text-[#5FB473]", icon: <Check className="w-4 h-4 rounded-full p-0.5 text-white bg-[#50AC66]" /> };
        if (req.status_revision === "Rechazada") return { label: "Rechazado", color: "border-red-200  text-red-700", icon: <XCircle className="w-4 h-4" /> };
        if (req.status === "Pagado") return { label: "Pagado", color: "border-[#7EC18E]  text-[#5FB473]", icon: <Check className="w-4 h-4 rounded-full p-0.5 text-white bg-[#50AC66]" /> };
        if (req.status_entrega === "Completo") return { label: "Recibido", color: "border-[#7EC18E]  text-[#5FB473]", icon: <Check className="w-4 h-4 rounded-full p-0.5 text-white bg-[#50AC66]" /> };
        return { label: "Por revisar", color: "border-[#D0D0D0]  text-[#75756D]", icon: <Minus className="w-4 h-4 bg-[#D1D1D1] rounded-full p-0.5 text-white" /> };
    };

    // Get approved items count for partial badge
    const getApprovedItemsCount = (req: NonNullable<typeof requisiciones>[number]) => {
        if (!req.items) return { approved: 0, total: 0 };
        const approved = req.items.filter(i => i.status_revision === "aprobado").length;
        return { approved, total: req.items.length };
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

    // --- Review mode helpers ---
    const isReviewUser = currentUser?.role === "admin" || currentUser?.role === "finance";

    const startReview = (reqId: Id<"requisiciones">, items: NonNullable<typeof requisiciones>[number]["items"]) => {
        if (!items) return;
        setReviewingReqId(reqId);
        setReviewItemDecisions(
            items.map(item => ({
                item_id: item._id,
                status_revision: "aprobado" as const,
                cantidad_aprobada: item.cantidad,
                nota_item: "",
                cantidad_original: item.cantidad,
            }))
        );
        setReviewNote("");
        setExpandedNotes(new Set());
        if (!expandedCards.has(reqId)) {
            toggleCard(reqId);
        }
    };

    const cancelReview = () => {
        setReviewingReqId(null);
        setReviewItemDecisions([]);
        setReviewNote("");
        setExpandedNotes(new Set());
    };

    const toggleReviewItem = (index: number) => {
        setReviewItemDecisions(prev =>
            prev.map((d, i) =>
                i === index
                    ? {
                          ...d,
                          status_revision: d.status_revision === "aprobado" ? "rechazado" as const : "aprobado" as const,
                          cantidad_aprobada: d.cantidad_original,
                      }
                    : d
            )
        );
    };

    const updateReviewQty = (index: number, qty: number) => {
        setReviewItemDecisions(prev =>
            prev.map((d, i) => i === index ? { ...d, cantidad_aprobada: qty } : d)
        );
    };

    const updateReviewItemNote = (index: number, note: string) => {
        setReviewItemDecisions(prev =>
            prev.map((d, i) => i === index ? { ...d, nota_item: note } : d)
        );
    };

    const approveAllReview = () => {
        setReviewItemDecisions(prev =>
            prev.map(d => ({ ...d, status_revision: "aprobado" as const, cantidad_aprobada: d.cantidad_original }))
        );
    };

    const rejectAllReview = () => {
        setReviewItemDecisions(prev =>
            prev.map(d => ({ ...d, status_revision: "rechazado" as const }))
        );
    };

    const toggleNoteVisibility = (itemId: string) => {
        setExpandedNotes(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const reviewApprovedCount = reviewItemDecisions.filter(d => d.status_revision === "aprobado").length;
    const reviewRejectedCount = reviewItemDecisions.filter(d => d.status_revision === "rechazado").length;
    const reviewTotalCount = reviewItemDecisions.length;
    const reviewHasModifiedQty = reviewItemDecisions.some(
        d => d.status_revision === "aprobado" && d.cantidad_aprobada !== d.cantidad_original
    );
    const reviewIsPartial = reviewRejectedCount > 0 || reviewHasModifiedQty;
    const reviewIsAllRejected = reviewRejectedCount === reviewTotalCount && reviewTotalCount > 0;
    const reviewNoteRequired = reviewIsPartial || reviewIsAllRejected;
    const reviewCanSubmit =
        reviewTotalCount > 0 &&
        (!reviewNoteRequired || reviewNote.trim().length > 0) &&
        reviewItemDecisions.every(d => d.status_revision === "rechazado" || d.cantidad_aprobada > 0);

    const submitReview = async () => {
        if (!currentUser || !reviewingReqId || !reviewCanSubmit) return;
        setIsSubmittingReview(true);
        try {
            const result = await reviewMutation({
                id: reviewingReqId,
                reviewer_id: currentUser._id,
                reviewer_name: currentUser.name,
                nota_revision: reviewNote.trim() || undefined,
                items: reviewItemDecisions.map(d => ({
                    item_id: d.item_id,
                    status_revision: d.status_revision,
                    cantidad_aprobada: d.status_revision === "aprobado" ? d.cantidad_aprobada : undefined,
                    nota_item: d.nota_item.trim() || undefined,
                })),
            });
            const statusMsg =
                result.status_revision === "Aprobada"
                    ? "Requisición aprobada"
                    : result.status_revision === "Rechazada"
                        ? "Requisición rechazada"
                        : "Requisición parcialmente aprobada";
            toast.success(statusMsg, {
                description: `${reviewApprovedCount} de ${reviewTotalCount} items aprobados.`,
            });
            cancelReview();
        } catch (error) {
            console.error("Error reviewing requisicion:", error);
            toast.error("Error al revisar", {
                description: error instanceof Error ? error.message : "No se pudo enviar la revisión.",
            });
        } finally {
            setIsSubmittingReview(false);
        }
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

    const handleStatusChange = async (requisicionId: Id<"requisiciones">, newStatus: string) => {
        if (!currentUser) return;
        try {
            await updateStatus({
                id: requisicionId,
                status: newStatus,
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

    const handleStatusEntregaChange = async (requisicionId: Id<"requisiciones">, newStatus: string) => {
        if (!currentUser) return;
        try {
            await updateStatusEntrega({
                id: requisicionId,
                status_entrega: newStatus,
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

    // const getStatusColor = (status: string) => {
    //     switch (status) {
    //         case "En proceso": return "bg-blue-50 text-blue-700 border border-blue-200";
    //         case "Cancelado": return "bg-red-50 text-red-700 border border-red-200";
    //         case "Pagado": return "bg-green-50 text-[#5FB473] border border-[#7EC18E]";
    //         default: return " text-gray-700 border border-gray-200";
    //     }
    // };

    const getStatusEntregaColor = (status: string | undefined) => {
        switch (status) {
            case "Pendiente": return " text-gray-700 border border-gray-200";
            case "Cancelado": return " text-red-700 border border-red-200";
            case "En proceso": return " text-blue-700 border border-blue-200";
            case "Parcial": return " text-yellow-700 border border-yellow-200";
            case "Completo": return " text-emerald-700 border border-emerald-200";
            default: return " text-gray-700 border border-gray-200";
        }
    };

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
                            const statusBadge = getStatusBadge(req);
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
                            const isInReviewMode = reviewingReqId === req._id && isReviewUser;

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

                                        {/* Status Badge */}
                                        <div className="min-w-[120px] flex justify-end">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-2.5 text-xs  border rounded-sm",
                                                statusBadge.color
                                            )}>
                                                {statusBadge.icon}
                                                {statusBadge.label}
                                            </span>
                                        </div>

                                        {/* Actions Menu */}
                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                        <MoreVertical className="h-4 w-4 text-gray-400" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="flex flex-col space-y-1 w-56 p-2" align="end">
                                                    <Button
                                                        variant="ghost"
                                                        className="justify-start"
                                                        size="sm"
                                                        onClick={() => requisicionModal.onOpen({
                                                            projectId: proyectoId as Id<"desarrollos">,
                                                            requisicionId: req._id
                                                        }, "view")}
                                                    >
                                                        Ver detalles
                                                    </Button>
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <Button
                                                                variant="ghost"
                                                                className="justify-start"
                                                                size="sm"
                                                                onClick={() => requisicionModal.onOpen({
                                                                    projectId: proyectoId as Id<"desarrollos">,
                                                                    requisicionId: req._id
                                                                }, "edit")}
                                                            >
                                                                Editar
                                                            </Button>
                                                        )}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <Button
                                                                variant="ghost"
                                                                className="justify-start"
                                                                size="sm"
                                                                onClick={() => openProviderDialog(req._id)}
                                                            >
                                                                Agregar proveedor
                                                            </Button>
                                                        )}
                                                    {isReviewUser &&
                                                        (req.status_revision === "Pendiente de revisión") && (
                                                            <div className="border-t border-gray-100 pt-1 mt-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="justify-start w-full text-amber-600 hover:text-amber-700"
                                                                    onClick={() => startReview(req._id, req.items)}
                                                                >
                                                                    Revisar
                                                                </Button>
                                                            </div>
                                                        )}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "finance") && (
                                                        <div className="border-t border-gray-100 pt-1 mt-1">
                                                            <p className="text-xs text-gray-500 px-2 py-1">Estado de pago:</p>
                                                            <div className="space-y-1 flex flex-col">
                                                                {(currentUser?.role === "finance"
                                                                    ? ["Pagado", "Cancelado"]
                                                                    : ["En proceso", "Pagado", "Cancelado"]
                                                                ).map(s => (
                                                                    s !== req.status && (
                                                                        <Button
                                                                            key={s}
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className={cn("justify-start text-[10px] rounded-full w-fit", getStatusEntregaColor(s))}
                                                                            onClick={() => handleStatusChange(req._id, s)}
                                                                        >
                                                                            {s}
                                                                        </Button>
                                                                    )
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <div className="border-t border-gray-100 pt-1 mt-1">
                                                                <p className="text-xs text-gray-500 px-2 py-1">Estado de entrega:</p>
                                                                <div className="space-y-1 flex flex-col">
                                                                    {["Pendiente", "Parcial", "Completo"].map(s => (
                                                                        s !== (req.status_entrega || "Pendiente") && (
                                                                            <Button
                                                                                key={s}
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className={cn("justify-start w-fit text-[10px] rounded-full", getStatusEntregaColor(s))}
                                                                                onClick={() => handleStatusEntregaChange(req._id, s)}
                                                                            >
                                                                                {s}
                                                                            </Button>
                                                                        )
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    {(currentUser?.role === "admin" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <div className="border-t border-gray-100 pt-1 mt-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-red-600 justify-start w-full"
                                                                    onClick={() => openDeleteDialog(req._id)}
                                                                >
                                                                    Eliminar
                                                                </Button>
                                                            </div>
                                                        )}
                                                </PopoverContent>
                                            </Popover>
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
                                            {/* Review Summary Bar */}
                                            {isInReviewMode && (
                                                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 mb-4 rounded-sm">
                                                    <div className="flex items-center gap-4 text-sm">
                                                        <span className="text-gray-500">
                                                            {reviewTotalCount} item{reviewTotalCount !== 1 ? "s" : ""}
                                                        </span>
                                                        <span className="text-green-600 font-medium flex items-center gap-1">
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            {reviewApprovedCount} aprobado{reviewApprovedCount !== 1 ? "s" : ""}
                                                        </span>
                                                        {reviewRejectedCount > 0 && (
                                                            <span className="text-red-600 font-medium flex items-center gap-1">
                                                                <XCircle className="w-3.5 h-3.5" />
                                                                {reviewRejectedCount} rechazado{reviewRejectedCount !== 1 ? "s" : ""}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={approveAllReview}
                                                            className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-sm transition-colors"
                                                        >
                                                            Aprobar todos
                                                        </button>
                                                        <button
                                                            onClick={rejectAllReview}
                                                            className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-sm transition-colors"
                                                        >
                                                            Rechazar todos
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

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
                                                            const decision = isInReviewMode
                                                                ? reviewItemDecisions.find(d => d.item_id === item._id)
                                                                : undefined;
                                                            const decisionIndex = decision
                                                                ? reviewItemDecisions.findIndex(d => d.item_id === item._id)
                                                                : -1;
                                                            const effectiveStatus = decision ? decision.status_revision : item.status_revision;
                                                            const isRejected = effectiveStatus === "rechazado";
                                                            const isItemApproved = effectiveStatus === "aprobado";
                                                            const precioUnitario = item.precio_unitario ?? 0;
                                                            const presupuestoAprobado = item.presupuesto_aprobado ?? 0;
                                                            const pagado = item.pagado ?? 0;
                                                            const ejercido = presupuestoAprobado > 0
                                                                ? Math.round((pagado / presupuestoAprobado) * 100)
                                                                : 0;
                                                            const noteExpanded = expandedNotes.has(item._id);

                                                            return (
                                                                <Fragment key={item._id}>
                                                                    <tr className={cn(
                                                                        "transition-colors rounded-lg overflow-hidden bg-[#FBFBFB] border border-[#ECECEC]",
                                                                        decision && isRejected && "opacity-50 bg-red-50/30 border-red-200",
                                                                        decision && isItemApproved && "border-green-200",
                                                                        !decision && isRejected && "opacity-40 bg-[#CD56364A] border-[#FBE8E0]"
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
                                                                        {/* Aprobado column - editable in review mode */}
                                                                        <td className="px-4 py-3 text-center">
                                                                            {decision && decision.status_revision === "aprobado" ? (
                                                                                <div className="flex items-center justify-center gap-1">
                                                                                    <input
                                                                                        type="number"
                                                                                        min={1}
                                                                                        value={decision.cantidad_aprobada}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        onChange={(e) => updateReviewQty(decisionIndex, Number(e.target.value))}
                                                                                        className={cn(
                                                                                            "w-16 px-2 py-1 text-sm border text-center rounded-sm",
                                                                                            decision.cantidad_aprobada !== decision.cantidad_original
                                                                                                ? "border-yellow-400 bg-yellow-50 text-yellow-800 font-medium"
                                                                                                : "border-gray-300 text-gray-700 bg-white"
                                                                                        )}
                                                                                    />
                                                                                    <span className="text-xs text-gray-400">{item.unidad}</span>
                                                                                    {decision.cantidad_aprobada !== decision.cantidad_original && (
                                                                                        <span className="text-yellow-600 text-[10px] font-medium">(mod)</span>
                                                                                    )}
                                                                                </div>
                                                                            ) : decision && decision.status_revision === "rechazado" ? (
                                                                                <span className="text-xs text-red-400 italic">Rechazado</span>
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
                                                                            {decision ? (
                                                                                <div className="flex items-center justify-center gap-1">
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); toggleReviewItem(decisionIndex); }}
                                                                                        className={cn(
                                                                                            "p-1.5 rounded-sm transition-colors",
                                                                                            decision.status_revision === "aprobado"
                                                                                                ? "bg-green-600 text-white hover:bg-green-700"
                                                                                                : "bg-red-500 text-white hover:bg-red-600"
                                                                                        )}
                                                                                        title={decision.status_revision === "aprobado" ? "Cambiar a rechazado" : "Cambiar a aprobado"}
                                                                                    >
                                                                                        {decision.status_revision === "aprobado" ? (
                                                                                            <Check className="w-3.5 h-3.5" />
                                                                                        ) : (
                                                                                            <X className="w-3.5 h-3.5" />
                                                                                        )}
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); toggleNoteVisibility(item._id); }}
                                                                                        className={cn(
                                                                                            "p-1.5 rounded-sm transition-colors",
                                                                                            decision.nota_item
                                                                                                ? "text-amber-600 bg-amber-50"
                                                                                                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                                                                        )}
                                                                                        title="Agregar nota"
                                                                                    >
                                                                                        <MessageSquare className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                </div>
                                                                            ) : null}
                                                                        </td>
                                                                    </tr>
                                                                    {/* Per-item note row */}
                                                                    {decision && noteExpanded && (
                                                                        <tr>
                                                                            <td colSpan={9} className="px-4 pt-0 pb-1">
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="Nota para este item..."
                                                                                    value={decision.nota_item}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    onChange={(e) => updateReviewItemNote(decisionIndex, e.target.value)}
                                                                                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-sm text-gray-700 placeholder:text-gray-400 bg-white"
                                                                                />
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </Fragment>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Review footer - general note + submit/cancel */}
                                            {isInReviewMode && (
                                                <div className="mt-4 space-y-4">
                                                    <div>
                                                        <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-1">
                                                            Nota de revisión
                                                            {reviewNoteRequired && (
                                                                <span className="text-xs text-red-500 flex items-center gap-1">
                                                                    <AlertTriangle className="w-3 h-3" />
                                                                    Requerida
                                                                </span>
                                                            )}
                                                        </label>
                                                        <textarea
                                                            placeholder={reviewNoteRequired
                                                                ? "Explica las razones de los cambios realizados..."
                                                                : "Nota opcional..."}
                                                            value={reviewNote}
                                                            onChange={(e) => setReviewNote(e.target.value)}
                                                            rows={2}
                                                            className={cn(
                                                                "w-full px-3 py-2 text-sm border rounded-sm resize-none bg-white",
                                                                reviewNoteRequired && !reviewNote.trim()
                                                                    ? "border-red-300 bg-red-50/50"
                                                                    : "border-gray-200"
                                                            )}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <button
                                                            onClick={cancelReview}
                                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-sm transition-colors"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            onClick={submitReview}
                                                            disabled={!reviewCanSubmit || isSubmittingReview}
                                                            className={cn(
                                                                "px-6 py-2 text-sm font-medium text-white rounded-sm transition-colors flex items-center gap-2",
                                                                reviewIsAllRejected
                                                                    ? "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                                                                    : reviewIsPartial
                                                                        ? "bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-300"
                                                                        : "bg-green-600 hover:bg-green-700 disabled:bg-green-300"
                                                            )}
                                                        >
                                                            {isSubmittingReview && <Loader2 className="w-4 h-4 animate-spin" />}
                                                            {reviewIsAllRejected
                                                                ? "Rechazar Requisición"
                                                                : reviewIsPartial
                                                                    ? "Aprobar Parcialmente"
                                                                    : "Aprobar Requisición"}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Nota General - only when NOT reviewing */}
                                            {!isInReviewMode && (
                                                <div className="ml-12 mt-4 border-l-2 border-gray-200 pl-4">
                                                    <p className="text-xs text-gray-400 mb-1">Nota General:</p>
                                                    <p className="text-sm text-gray-600">
                                                        {req.descripcion || <span className="text-gray-300 italic">Sin notas</span>}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

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
