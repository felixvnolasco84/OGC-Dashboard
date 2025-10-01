/**
 * USAGE EXAMPLE: How to integrate ProgramaGanttChart into ProgramaObra page
 * 
 * This file shows how to use the ProgramaGanttChart component with your existing data.
 */

// In your ProgramaObra.tsx file, add this import at the top:
// import ProgramaGanttChart from "@/components/Charts/ProgramaGanttChart";

// Then, after your filters section, add the Gantt chart component:

/*
export default function ProgramaObra() {
  // ... your existing code for fetching projects and partidas ...
  
  const [viewMode, setViewMode] = useState<'gantt' | 'table'>('table');

  return (
    <div className="bg-white px-12 py-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header Section * /}
        <div className="rounded-lg py-6">
          {/* ... existing header code ... * /}
        </div>

        {/* Filters Section * /}
        <div className="bg-white border-b border-gray-200 pb-4">
          {/* ... existing filters ... * /}
        </div>

        {/* View Toggle (Optional) * /}
        <div className="flex gap-2 mb-4">
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            onClick={() => setViewMode('table')}
          >
            Vista de Tabla
          </Button>
          <Button
            variant={viewMode === 'gantt' ? 'default' : 'outline'}
            onClick={() => setViewMode('gantt')}
          >
            Vista Gantt
          </Button>
        </div>

        {/* Conditional Rendering * /}
        {viewMode === 'gantt' ? (
          // Gantt Chart View
          <ProgramaGanttChart 
            data={filteredData} 
            startYear={2025}
          />
        ) : (
          // Original Table View
          <div className="border border-gray-200 overflow-hidden bg-white">
            {/* ... your existing Gantt table code ... * /}
          </div>
        )}
      </div>
    </div>
  );
}
*/

// ALTERNATIVE: Replace the existing custom Gantt view completely
/*
export default function ProgramaObra() {
  // ... your existing code ...

  return (
    <div className="bg-white px-12 py-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header * /}
        <div className="rounded-lg py-6">
          {/* ... header code ... * /}
        </div>

        {/* Filters * /}
        <div className="bg-white border-b border-gray-200 pb-4">
          {/* ... filters code ... * /}
        </div>

        {/* Gantt Chart replacing the old implementation * /}
        <ProgramaGanttChart 
          data={programaDataState}
          startYear={2025}
        />
      </div>
    </div>
  );
}
*/

export {};
