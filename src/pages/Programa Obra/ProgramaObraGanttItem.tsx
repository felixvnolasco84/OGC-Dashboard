import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ProgramaItem = {
    id: number;
    partida: string;
    presupuesto: number;
    expanded: boolean;
    level: number;
    timeline: {
        start: number;
        duration: number;
        color: string;
        progress?: number; // Progress percentage (0-100)
        actualAmount?: number; // Actual spent amount
    } | null;
    children: ProgramaItem[];
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export default function ProgramaObraGanttItem({ item, monthIndex }: { item: ProgramaItem; monthIndex: number }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="w-full border-r border-gray-200 py-4 relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Timeline Bar using Progress component */}
            {item.timeline &&
                monthIndex >= (item.timeline.start - 1) &&
                monthIndex < (item.timeline.start - 1 + item.timeline.duration) && (
                    <div className="relative mx-1">
                        <div className="flex flex-col">
                            <Progress
                                value={100}
                                className={cn(
                                    "h-2 bg-green-800 rounded-none",
                                    "[&>div]:bg-green-800 [&>div]:rounded-none"
                                )}
                            />
                            <Progress
                                value={item.timeline.progress || 0}
                                className={cn(
                                    "h-2 bg-green-100 rounded-none",
                                    "[&>div]:bg-[#4CC684] [&>div]:rounded-none"
                                )}
                            />
                            <span className="text-xs bg-gray-200 px-2 py-2 text-left">{item.partida}</span>

                        </div>

                        {/* Progress percentage label - positioned to the right */}
                        {item.timeline.progress && monthIndex === (item.timeline.start - 1 + item.timeline.duration - 1) && (
                            <div className="absolute -right-12 top-0 text-xs text-muted-foreground font-light flex items-center h-4">
                                {item.timeline.progress}%
                            </div>
                        )}

                        {/* Comparison labels - Only show on hover */}
                        {isHovered && item.timeline.actualAmount && monthIndex === (item.timeline.start - 1 + item.timeline.duration - 1) && (
                            <div className="absolute top-6 right-0 flex gap-2 text-xs z-20">
                                {/* Difference amount */}
                                <div className="bg-gray-500 text-white px-2 py-1 rounded-md text-xs font-medium shadow-lg">
                                    {formatCurrency(item.timeline.actualAmount - item.presupuesto)}
                                </div>
                                {/* Actual amount */}
                                <div className="bg-white text-gray-800 px-2 py-1 rounded-md font-medium shadow-lg border border-gray-200">
                                    {formatCurrency(item.timeline.actualAmount)}
                                </div>
                            </div>
                        )}
                    </div>
                )}
        </div>
    )
}
