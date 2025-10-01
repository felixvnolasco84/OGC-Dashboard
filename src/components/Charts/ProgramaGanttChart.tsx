import { useMemo } from "react";
import { Gantt, type Task, type Scale } from "wx-react-gantt";
import "wx-react-gantt/dist/gantt.css";

type ProgramaItem = {
  id: string;
  partida: string;
  presupuesto: number;
  expanded: boolean;
  level: number;
  timeline: {
    start: number;
    duration: number;
    color: string;
    progress: number;
    actualAmount: number;
  } | null;
  children: ProgramaItem[];
};

interface ProgramaGanttChartProps {
  data: ProgramaItem[];
  startYear?: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function ProgramaGanttChart({ data, startYear = 2025 }: ProgramaGanttChartProps) {
  // Transform data to wx-react-gantt format
  const ganttData = useMemo(() => {
    const tasks: Task[] = [];
    let taskId = 1; // Start IDs at 1 instead of 0

    const flattenItems = (items: ProgramaItem[], result: ProgramaItem[] = []): ProgramaItem[] => {
      items.forEach(item => {
        result.push(item);
        if (item.children && item.children.length > 0) {
          flattenItems(item.children, result);
        }
      });
      return result;
    };

    const flatData = flattenItems(data);

    flatData.forEach((item) => {
      if (item.timeline) {
        // Calculate dates based on timeline
        const startMonth = item.timeline.start;
        const startDate = new Date(startYear, startMonth - 1, 1);
        const endDate = new Date(startYear, startMonth - 1 + item.timeline.duration, 0);

        // Ensure progress is a valid number between 0 and 1
        const progress = isNaN(item.timeline.progress) ? 0 : Math.max(0, Math.min(1, item.timeline.progress / 100));

        tasks.push({
          id: taskId++,
          text: item.partida,
          start: startDate,
          end: endDate,
          duration: item.timeline.duration,
          progress: progress,
          type: item.children.length > 0 ? "summary" : "task",
          budget: formatCurrency(item.presupuesto),
          spent: formatCurrency(item.timeline.actualAmount),
        });
      }
    });

    return {
      data: tasks,
      links: []
    };
  }, [data, startYear]);

  const columns = [
    { name: "text", label: "Partida - Familia", width: 280 },
    { name: "budget", label: "Presupuesto", width: 150, align: "right" as const },
    { name: "progress", label: "Avance", width: 100, align: "center" as const, template: (task: Task) => `${Math.round(task.progress * 100)}%` },
  ];

  const scales: Scale[] = [
    { unit: "month" as const, step: 1, format: "MMMM yyyy" }
  ];

  // Don't render if no tasks
  if (ganttData.data.length === 0) {
    return (
      <div className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden p-8 text-center" style={{ height: "600px" }}>
        <p className="text-gray-500">No hay datos de timeline para mostrar en el diagrama de Gantt.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ height: "600px" }}>
      <Gantt
        tasks={ganttData.data}
        links={ganttData.links}
        columns={columns}
        scales={scales}
      />
    </div>
  );
}
