import { UploadWeeklyTotals } from "@/components/UploadWeeklyTotals";

export default function AdminPage() {
  return (
    <div className="bg-white px-12 py-6 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <h1 className="text-2xl text-gray-900 mb-2">Administración</h1>
          <p className="text-sm text-gray-500">
            Herramientas para cargar y gestionar datos del proyecto
          </p>
        </div>

        {/* Upload Weekly Totals Section */}
        <div>
          <UploadWeeklyTotals />
        </div>
      </div>
    </div>
  );
}
