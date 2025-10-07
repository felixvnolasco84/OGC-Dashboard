import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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

export default function ProgramaObraGanttItem({ item }: { item: ProgramaItem }) {
    const [isHovered, setIsHovered] = useState(false);

    if (!item.timeline) {
        return null;
    }

    const { start, duration, progress, actualAmount } = item.timeline;
    const columnWidth = 128; // w-32 = 128px
    const startPosition = (start - 1) * columnWidth;
    const barWidth = duration * columnWidth;

    return (
        <div
            className="absolute top-0 py-4 px-1"
            style={{
                left: `${startPosition}px`,
                width: `${barWidth}px`,
                height: '100%'
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="relative h-full">
                <div className="flex flex-col">
                    <Progress
                        value={100}
                        className={cn(
                            "h-2 bg-green-800 rounded-none",
                            "[&>div]:bg-green-800 [&>div]:rounded-none"
                        )}
                    />
                    <Progress
                        value={progress || 0}
                        className={cn(
                            "h-2 bg-green-100 rounded-none",
                            "[&>div]:bg-[#4CC684] [&>div]:rounded-none"
                        )}
                    />
                    <span className="text-xs bg-gray-200 px-2 py-2 text-left truncate">{item.partida}</span>
                </div>

                {/* Progress percentage label - positioned to the right */}
                {progress !== undefined && (
                    <div className="absolute -right-12 top-0 text-xs text-muted-foreground font-light flex items-center h-4">
                        {progress}%
                    </div>
                )}

                {/* Comparison labels - Only show on hover */}
                {isHovered && actualAmount && (
                    <div className="absolute top-6 right-0 flex gap-2 text-xs z-20">
                        {/* Difference amount */}
                        <div className="bg-gray-500 text-white px-2 py-1 rounded-md text-xs font-medium shadow-lg whitespace-nowrap">
                            {formatCurrency(actualAmount - item.presupuesto)}
                        </div>
                        {/* Actual amount */}
                        <div className="bg-white text-gray-800 px-2 py-1 rounded-md font-medium shadow-lg border border-gray-200 whitespace-nowrap">
                            {formatCurrency(actualAmount)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
