import { Navigate, useParams, useSearchParams } from "react-router";

export default function ProyectoTareasPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get("tarea") || searchParams.get("task");
  const target = `/tareas?proyecto=${proyectoId || ""}${taskId ? `&tarea=${taskId}` : ""}`;

  return <Navigate to={target} replace />;
}
