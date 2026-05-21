import { useParams } from "react-router";
import { TareasBoard } from "./TareasPage";

export default function ProyectoTareasPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();

  return <TareasBoard proyectoId={proyectoId} />;
}
