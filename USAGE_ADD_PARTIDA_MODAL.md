# Add Partida Modal - Usage Guide

## Overview
The Add Partida Modal provides a comprehensive form to create new partidas (budget items) for a project. It includes automatic calculations for totals, IVA, and budget tracking.

## Implementation

### 1. Hook
Location: `/src/hooks/add-partida-modal.ts`

The hook manages the modal state and form data using Zustand.

### 2. Modal Component
Location: `/src/components/modals/add-partida-modal.tsx`

The modal is registered in the ModalProvider and automatically mounted.

### 3. Convex Mutation
Location: `/convex/partida.ts` - `createPartida` mutation

## How to Use

### Basic Usage

```tsx
import { useAddPartidaModal } from "@/hooks/add-partida-modal";

function YourComponent() {
    const addPartidaModal = useAddPartidaModal();

    const handleAddPartida = () => {
        addPartidaModal.onOpen({
            proyecto: "YOUR_PROJECT_ID", // Id<"desarrollos">
            projectName: "Larena - Torre G" // Optional display name
        });
    };

    return (
        <button onClick={handleAddPartida}>
            Agregar Partida
        </button>
    );
}
```

### Complete Example

```tsx
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

function PartidaList() {
    const addPartidaModal = useAddPartidaModal();
    const projectId: Id<"desarrollos"> = "YOUR_PROJECT_ID";
    const partidas = useQuery(api.partida.getByProject, { projectId });

    const handleOpenAddModal = () => {
        addPartidaModal.onOpen({
            proyecto: projectId,
            projectName: "Larena - Torre G"
        });
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2>Partidas</h2>
                <button onClick={handleOpenAddModal}>
                    + Agregar Nueva Partida
                </button>
            </div>
            {/* List of partidas */}
        </div>
    );
}
```

## Form Fields

### Required Fields (*)
- **nombre**: Name of the partida
- **familia**: Family/category
- **sub_partida**: Sub-category
- **Cantidad**: Quantity (number)
- **PrecioUnitario**: Unit price (number)
- **aprobado**: Approved budget amount (number)

### Optional Fields
- **pagado**: Amount already paid (defaults to 0)
- **fecha_carga**: Upload date (defaults to today)
- **archivo_origen**: Source file name

### Auto-calculated Fields
- **Subtotal**: Cantidad × PrecioUnitario
- **Iva**: Subtotal × 0.16 (16%)
- **total**: Subtotal + IVA
- **por_liquidar**: aprobado - pagado
- **actual**: Same as aprobado initially

## Features

1. **Automatic Calculations**: The form automatically calculates subtotal, IVA, total, por_liquidar, and actual based on input values.

2. **Currency Formatting**: All monetary values are displayed in Mexican Peso format.

3. **Form Validation**: The submit button is disabled until all required fields are filled correctly.

4. **Real-time Updates**: Calculated fields update in real-time as you type.

5. **Responsive Design**: The modal is fully responsive and uses a 700px width.

## Integration Points

The modal is automatically integrated through the ModalProvider in:
`/src/components/providers/modal-provider.tsx`

No additional setup is needed - just import and use the hook!

## Example Button Component

```tsx
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Id } from "../convex/_generated/dataModel";

interface AddPartidaButtonProps {
    projectId: Id<"desarrollos">;
    projectName?: string;
}

export function AddPartidaButton({ projectId, projectName }: AddPartidaButtonProps) {
    const addPartidaModal = useAddPartidaModal();

    return (
        <Button 
            onClick={() => addPartidaModal.onOpen({ 
                proyecto: projectId,
                projectName 
            })}
        >
            <Plus className="mr-2 h-4 w-4" />
            Agregar Partida
        </Button>
    );
}
```

## Notes

- The modal handles all form state management internally
- Form data is automatically reset when the modal closes
- The mutation is called automatically on form submit
- Error handling is built-in with console error logging
