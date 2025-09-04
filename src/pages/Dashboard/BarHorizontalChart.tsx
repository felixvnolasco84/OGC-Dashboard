import React, { useMemo } from 'react'
import { Chart } from 'react-charts'
import { Payment } from './Table'

interface DataPoint {
  primary: string
  secondary: number
}

interface Series {
  label: string
  data: DataPoint[]
}

interface GroupedData {
  [key: string]: number
}

export default function BarHorizontalChart({ constructionData }: { constructionData: Payment[] }) {
  // Group and sum data by subPartida
  const groupedData = useMemo(() => {
    return constructionData.reduce<GroupedData>((acc, item) => {
      const key = item.subPartida
      acc[key] = (acc[key] || 0) + item.total
      return acc
    }, {})
  }, [constructionData])

  // Transform data for the chart
  const data: Series[] = useMemo(() => {
    // Convert to array, sort by total (descending), and take top 20
    const sortedData = Object.entries(groupedData)
      .map(([subPartida, total]) => ({
        subPartida,
        total
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20) // Show top 20 items for better visibility
    
    return [
      {
        label: 'Total ($)',
        data: sortedData.map(item => ({
          primary: item.subPartida.length > 40 
            ? item.subPartida.substring(0, 40) + '...' 
            : item.subPartida,
          secondary: item.total
        }))
      }
    ]
  }, [groupedData])

  // Calculate totals for the summary cards
  const summaryTotals = useMemo(() => {
    const totals = Object.values(groupedData).reduce(
      (sum, total) => sum + total,
      0
    )
    
    const pending = constructionData.reduce(
      (sum, item) => sum + item.porLiquidar,
      0
    )
    
    return {
      total: totals,
      items: Object.keys(groupedData).length,
      pending
    }
  }, [groupedData, constructionData])

  // Axes configuration
  const primaryAxis = useMemo(
    () => ({
      getValue: (datum: DataPoint) => datum.primary,
      position: 'left' as const,
    }),
    []
  )

  const secondaryAxes = useMemo(
    () => [
      {
        getValue: (datum: DataPoint) => datum.secondary,
        position: 'bottom' as const,
        formatters: {
          scale: (value: number) => `$${(value || 0).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`
        }
      },
    ],
    []
  )

  return (
    <div className="w-full h-full p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Análisis de Materiales de Construcción
        </h2>
        <p className="text-gray-600">
          Resumen de costos por tipo de material (Top 20)
        </p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h4 className="text-sm font-medium text-blue-700 mb-1">Valor Total</h4>
            <p className="text-2xl font-bold text-blue-900">
              {summaryTotals.total.toLocaleString('es-MX', {
                style: 'currency',
                currency: 'MXN',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-100">
            <h4 className="text-sm font-medium text-green-700 mb-1">Tipos de Materiales</h4>
            <p className="text-2xl font-bold text-green-900">
              {summaryTotals.items}
            </p>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
            <h4 className="text-sm font-medium text-orange-700 mb-1">Por Liquidar</h4>
            <p className="text-2xl font-bold text-orange-900">
              {summaryTotals.pending.toLocaleString('es-MX', {
                style: 'currency',
                currency: 'MXN',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </p>
          </div>
        </div>

        <div style={{ width: '100%', height: '600px' }}>
          <Chart
            options={{
              data,
              primaryAxis,
              secondaryAxes,
              defaultColors: ['#3B82F6'],
              padding: {
                left: 300,
                right: 50,
                top: 20,
                bottom: 40
              },
              dark: false,
              getSeriesStyle: () => ({
                bar: {
                  rx: 4,
                  ry: 4
                }
              } as any)
            }}
          />
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          Mostrando los {data[0]?.data.length || 0} materiales con mayor valor total
        </div>
      </div>
    </div>
  )
}
