/**
 * EXAMPLE: How to use FamiliaChart with persistent user configurations
 * 
 * This example shows how to integrate the chart configuration system
 * with the FamiliaChart component to persist user preferences.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import FamiliaChart from "./FamiliaChart";
import ChartConfigModal from "./ChartConfigModal";
import { useChartConfig } from "@/hooks/useChartConfig";

interface FamiliaChartWithConfigProps {
  proyectoId: Id<"desarrollos">;
  chartId: string;
  defaultTitle?: string;
  defaultColor?: string;
  defaultHeight?: number;
  defaultFamilias?: string[];
}

/**
 * Example component showing FamiliaChart with persistent configuration
 */
export default function FamiliaChartWithConfig({
  proyectoId,
  chartId,
  defaultTitle = "Familia Chart",
  defaultColor = "#3B82F6",
  defaultHeight = 300,
  defaultFamilias = [],
}: FamiliaChartWithConfigProps) {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Load saved configuration or use defaults
  const { config, saveConfig, resetConfig, isLoading } = useChartConfig({
    proyectoId,
    chartId,
    defaultConfig: {
      title: defaultTitle,
      color: defaultColor,
      height: defaultHeight,
      familias: defaultFamilias,
    },
  });

  // Fetch chart data using the configured filters
  const chartData = useQuery(
    api.transacciones.getFamiliaChartData,
    {
      proyecto_id: proyectoId,
      // Apply filters from config
      partidas: config.partidas,
      familias: config.familias,
      sub_partidas: config.sub_partidas,
    }
  );

  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-background rounded-lg">
        <p className="text-subtle-foreground">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <>
      {/* Chart Component */}
      <FamiliaChart
        chartId={chartId}
        data={chartData?.dataPoints || []}
        title={config.title}
        total={chartData?.total || 0}
        color={config.color}
        height={config.height}
        partidas={config.partidas}
        familias={config.familias}
        sub_partidas={config.sub_partidas}
        onConfigClick={() => setIsConfigModalOpen(true)}
      />

      {/* Configuration Modal */}
      <ChartConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        proyectoId={proyectoId}
        chartId={chartId}
        currentConfig={config}
        onSave={saveConfig}
        onReset={resetConfig}
      />
    </>
  );
}

/**
 * USAGE EXAMPLES:
 * 
 * 1. Basic usage with defaults:
 * ```tsx
 * <FamiliaChartWithConfig 
 *   proyectoId={proyectoId}
 *   chartId="familia-chart-1"
 * />
 * ```
 * 
 * 2. With custom defaults:
 * ```tsx
 * <FamiliaChartWithConfig 
 *   proyectoId={proyectoId}
 *   chartId="familia-chart-albailerias"
 *   defaultTitle="Albañilerías"
 *   defaultColor="#10B981"
 *   defaultHeight={400}
 *   defaultFamilias={["ALBAÑILERÍAS"]}
 * />
 * ```
 * 
 * 3. Multiple charts on same page:
 * ```tsx
 * <div className="grid grid-cols-2 gap-6">
 *   <FamiliaChartWithConfig 
 *     proyectoId={proyectoId}
 *     chartId="chart-1"
 *     defaultTitle="Concretos"
 *     defaultColor="#3B82F6"
 *     defaultFamilias={["CONCRETOS"]}
 *   />
 *   
 *   <FamiliaChartWithConfig 
 *     proyectoId={proyectoId}
 *     chartId="chart-2"
 *     defaultTitle="Aceros"
 *     defaultColor="#EF4444"
 *     defaultFamilias={["ACEROS"]}
 *   />
 * </div>
 * ```
 * 
 * FEATURES:
 * - Each user's configuration is saved independently
 * - Configurations are project-specific
 * - Multiple charts can coexist with different configs
 * - Users can click the settings icon to customize:
 *   - Title
 *   - Color
 *   - Height
 *   - Filter by partidas, familias, and sub-partidas
 * - Reset button restores default configuration
 * - All changes persist across sessions
 */
