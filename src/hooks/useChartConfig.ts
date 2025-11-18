import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCallback, useMemo } from "react";

export interface ChartConfig {
  title: string;
  color: string;
  height?: number;
  partidas?: string[];
  familias?: string[];
  sub_partidas?: string[];
}

interface UseChartConfigOptions {
  proyectoId: Id<"desarrollos"> | Id<"sales_projects">;
  chartId: string;
  defaultConfig: ChartConfig;
}

/**
 * Hook for managing persisted chart configurations per user
 * 
 * @param proyectoId - The project ID this chart belongs to
 * @param chartId - Unique identifier for this chart instance
 * @param defaultConfig - Default configuration values if no saved config exists
 * 
 * @returns Object with current config, save function, reset function, and loading state
 * 
 * @example
 * const { config, saveConfig, resetConfig, isLoading } = useChartConfig({
 *   proyectoId: "abc123",
 *   chartId: "familia-chart-1",
 *   defaultConfig: {
 *     title: "Albañilerías",
 *     color: "#3B82F6",
 *     height: 300,
 *     familias: ["ALBAÑILERÍAS"]
 *   }
 * });
 * 
 * // Use config in your component
 * <FamiliaChart 
 *   title={config.title}
 *   color={config.color}
 *   height={config.height}
 *   familias={config.familias}
 * />
 * 
 * // Save updated config
 * await saveConfig({
 *   ...config,
 *   title: "New Title",
 *   familias: ["ALBAÑILERÍAS", "CONCRETOS"]
 * });
 */
export function useChartConfig({ proyectoId, chartId, defaultConfig }: UseChartConfigOptions) {
  // Fetch saved configuration (only when proyectoId is available)
  const savedConfig = useQuery(
    api.chart_configurations.getChartConfig,
    proyectoId ? { proyecto_id: proyectoId, chart_id: chartId } : "skip"
  );

  // Mutations
  const saveConfigMutation = useMutation(api.chart_configurations.saveChartConfig);
  const resetConfigMutation = useMutation(api.chart_configurations.resetChartConfig);

  // Merge saved config with defaults
  const config: ChartConfig = useMemo(() => {
    if (!savedConfig) {
      return defaultConfig;
    }

    return {
      title: savedConfig.title,
      color: savedConfig.color,
      height: savedConfig.height || defaultConfig.height,
      partidas: savedConfig.partidas || defaultConfig.partidas,
      familias: savedConfig.familias || defaultConfig.familias,
      sub_partidas: savedConfig.sub_partidas || defaultConfig.sub_partidas,
    };
  }, [savedConfig, defaultConfig]);

  // Save configuration
  const saveConfig = useCallback(
    async (newConfig: ChartConfig) => {
      try {
        await saveConfigMutation({
          proyecto_id: proyectoId,
          chart_id: chartId,
          title: newConfig.title,
          color: newConfig.color,
          height: newConfig.height,
          partidas: newConfig.partidas,
          familias: newConfig.familias,
          sub_partidas: newConfig.sub_partidas,
        });
        return { success: true };
      } catch (error) {
        console.error("Error saving chart config:", error);
        return { success: false, error };
      }
    },
    [saveConfigMutation, proyectoId, chartId]
  );

  // Reset to default configuration
  const resetConfig = useCallback(async () => {
    try {
      await resetConfigMutation({
        proyecto_id: proyectoId,
        chart_id: chartId,
      });
      return { success: true };
    } catch (error) {
      console.error("Error resetting chart config:", error);
      return { success: false, error };
    }
  }, [resetConfigMutation, proyectoId, chartId]);

  return {
    config,
    saveConfig,
    resetConfig,
    isLoading: savedConfig === undefined,
    hasSavedConfig: savedConfig !== null,
  };
}

/**
 * Hook for managing multiple chart configurations at once
 * Useful for dashboard pages with multiple charts
 * 
 * @param proyectoId - The project ID
 * 
 * @example
 * const { configs, saveConfigs } = useMultipleChartConfigs(proyectoId);
 * 
 * // Save multiple chart configs at once
 * await saveConfigs([
 *   { chartId: "chart-1", title: "Title 1", color: "#fff", ... },
 *   { chartId: "chart-2", title: "Title 2", color: "#000", ... }
 * ]);
 */
export function useMultipleChartConfigs(proyectoId: Id<"desarrollos"> | Id<"sales_projects">) {
  // Fetch all configs for this project (only when proyectoId is available)
  const allConfigs = useQuery(
    api.chart_configurations.getUserChartConfigs,
    proyectoId ? { proyecto_id: proyectoId } : "skip"
  );

  // Mutation for bulk save
  const saveMultipleMutation = useMutation(api.chart_configurations.saveMultipleChartConfigs);

  // Save multiple configurations
  const saveConfigs = useCallback(
    async (
      configs: Array<{
        chart_id: string;
        title: string;
        color: string;
        height?: number;
        partidas?: string[];
        familias?: string[];
        sub_partidas?: string[];
      }>
    ) => {
      if (!proyectoId) {
        return { success: false, error: new Error("Project ID is required") };
      }
      
      try {
        await saveMultipleMutation({
          proyecto_id: proyectoId,
          configs: configs.map((c) => ({
            chart_id: c.chart_id,
            title: c.title,
            color: c.color,
            height: c.height,
            partidas: c.partidas,
            familias: c.familias,
            sub_partidas: c.sub_partidas,
          })),
        });
        return { success: true };
      } catch (error) {
        console.error("Error saving multiple chart configs:", error);
        return { success: false, error };
      }
    },
    [saveMultipleMutation, proyectoId]
  );

  // Helper to get config for specific chart
  const getConfigForChart = useCallback(
    (chartId: string) => {
      return allConfigs?.find((c) => c.chart_id === chartId) || null;
    },
    [allConfigs]
  );

  return {
    configs: allConfigs || [],
    saveConfigs,
    getConfigForChart,
    isLoading: allConfigs === undefined,
  };
}
