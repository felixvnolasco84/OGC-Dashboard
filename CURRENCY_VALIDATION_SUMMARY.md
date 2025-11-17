# Currency Validation Implementation

## Overview
Implemented proper currency validation and display in PresupuestoTable and SalesPresupuestoTable components based on transaction data. The system now dynamically determines the appropriate currency to display based on actual transaction history.

## Changes Made

### 1. New Convex Currency Helpers (`convex/currency_helpers.ts`)
Created comprehensive currency query utilities:

- **`getPartidaCurrencyBreakdown`**: Analyzes all transactions for a specific partida and returns:
  - Currency breakdown (amount paid in each currency: MXN, USD, EUR)
  - Dominant currency (most used currency)
  - Flag indicating if multiple currencies are present

- **`getSalesPartidaCurrencyBreakdown`**: Same functionality for sales partidas

- **`getProjectDefaultCurrency`**: Determines project's default currency by analyzing transaction history
  - Returns most frequently used currency across all project transactions
  - Provides currency count statistics

- **`getSalesProjectDefaultCurrency`**: Same functionality for sales projects

### 2. Updated Utility Functions (`src/lib/utils.ts`)
Enhanced currency formatting utilities:

- **`formatCurrency(amount, currency)`**: Full precision formatting (2 decimal places)
  - Parameters: amount (number), currency (string, default "MXN")
  - Uses Intl.NumberFormat with 'es-MX' locale
  - Returns formatted string like "$1,234.56 MXN"

- **`formatCurrencyCompact(amount, currency)`**: Compact formatting (0 decimal places)
  - Parameters: amount (number), currency (string, default "MXN")
  - Ideal for large numbers in tables and summaries
  - Returns formatted string like "$1,234 MXN"

- **`formatNumber(number, proyectoId)`**: Maintained for backward compatibility
  - Legacy function that wraps formatCurrency
  - Defaults to MXN for all projects

### 3. PresupuestoTable Component Updates
**File**: `src/components/Tables/PresupuestoTable.tsx`

**Key Changes**:
- Added `useQuery` hook to fetch project's default currency
- Replaced hardcoded currency display with dynamic `formatCurrency` calls
- All monetary values now display in the project's dominant currency
- Badge amounts (differences, increments) now show proper currency symbols

**Display Logic**:
```typescript
const defaultCurrency = currencyInfo?.defaultCurrency || "MXN";

// Budget columns use default currency
formatCurrency(item.presupuestoOriginal, defaultCurrency)
formatCurrency(item.presupuestoAprobado, defaultCurrency)

// Pagado (paid amounts) use default currency
// This is calculated from aggregated transaction data
formatCurrency(item.pagado, defaultCurrency)
```

### 4. SalesPresupuestoTable Component Updates
**File**: `src/components/Tables/SalesPresupuestoTable.tsx`

**Key Changes**:
- Added `useQuery` hook to fetch sales project's default currency
- Updated all currency displays to use `formatCurrencyCompact`
- Removed hardcoded "MXN" labels
- All metric cards now show dynamic currency
- Table cells display proper currency symbols

**Display Logic**:
```typescript
const defaultCurrency = currencyInfo?.defaultCurrency || "MXN";

// Main metrics use compact formatting
formatCurrencyCompact(metrics.presupuestoOriginal, defaultCurrency)
formatCurrencyCompact(metrics.presupuestoAprobado, defaultCurrency)
formatCurrencyCompact(metrics.pagado, defaultCurrency)

// Table rows use same currency
formatCurrencyCompact(item.presupuestoOriginal, defaultCurrency)
```

## How Currency is Determined

### For Budget Values (presupuesto_original, presupuesto_aprobado)
- These values are stored in the database without currency information
- The system uses the project's **default currency** (most common transaction currency)
- If no transactions exist, defaults to **MXN**

### For Paid Amounts (pagado)
- The `pagado` field is calculated by aggregating transaction line items (pagos)
- Each transaction has its own `moneda` field (MXN, USD, EUR)
- The displayed currency is the project's **dominant transaction currency**
- Behind the scenes, the system tracks individual transaction currencies

### Currency Resolution Priority
1. **Most common transaction currency** in the project
2. **MXN** as fallback default

## Benefits

1. **Dynamic Currency Display**: Automatically adapts to project transaction patterns
2. **Multi-Currency Support**: Handles projects with MXN, USD, EUR transactions
3. **Accurate Representation**: Shows currency based on actual transaction data
4. **Backward Compatible**: Existing code continues to work with MXN default
5. **Performance Optimized**: Uses indexed Convex queries for fast lookups

## Future Enhancements

### Potential Improvements:
1. **Currency Breakdown Column**: Show detailed currency breakdown when multiple currencies exist
2. **Currency Conversion**: Implement real-time conversion to display all amounts in a single currency
3. **Mixed Currency Indicator**: Add visual indicator when partida has payments in multiple currencies
4. **Per-Row Currency Detection**: Query currency for each table row (may impact performance)
5. **Currency Settings**: Allow users to set preferred display currency per project

### Example Future Feature:
```typescript
// Show mixed currency breakdown
{item.hasMixedCurrencies && (
  <Tooltip>
    <TooltipTrigger>
      <Info className="h-3 w-3 text-gray-400" />
    </TooltipTrigger>
    <TooltipContent>
      <div className="space-y-1">
        {item.currencyBreakdown.map(curr => (
          <div key={curr.currency}>
            {formatCurrency(curr.amount, curr.currency)}
          </div>
        ))}
      </div>
    </TooltipContent>
  </Tooltip>
)}
```

## Testing Recommendations

1. **Single Currency Project**: Verify all values display in MXN (or USD/EUR)
2. **Mixed Currency Project**: Create transactions in different currencies and verify dominant currency is used
3. **No Transactions**: Verify default MXN display when project has no transactions
4. **Large Numbers**: Test compact formatting with millions/billions
5. **Different Locales**: Verify 'es-MX' formatting works correctly

## Technical Notes

- All currency queries use Convex indexed lookups for performance
- Currency determination happens at query time, not stored in database
- The `moneda` field in transactions table is the source of truth
- Status filtering ensures only "Pagado" transactions affect currency determination
- TypeScript types ensure currency codes are strings (could be enhanced with union types)

## Migration Impact

- **No database changes required**
- **No breaking changes** to existing functionality
- **Backward compatible** with existing code
- Tables will automatically use new currency logic on next load
