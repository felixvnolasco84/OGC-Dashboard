import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: number;
  onChange?: (value: number) => void;
  currency?: string;
  locale?: string;
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, value = 0, onChange, currency = "MXN", locale = "es-MX", disabled, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState("");
    const [isFocused, setIsFocused] = React.useState(false);

    // Format number to currency display
    const formatToCurrency = React.useCallback((val: number): string => {
      if (!val || val === 0) return "";
      
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val);
    }, [locale]);

    // Parse display value back to number
    const parseFromDisplay = (val: string): number => {
      // Remove all non-numeric characters except decimal point
      const cleaned = val.replace(/[^0-9.]/g, "");
      const number = parseFloat(cleaned);
      return isNaN(number) ? 0 : number;
    };

    // Update display value when prop value changes (when not focused)
    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(formatToCurrency(value));
      }
    }, [value, isFocused, formatToCurrency]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Show raw number when focused
      setDisplayValue(value === 0 ? "" : String(value));
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // Format to currency when blurred
      setDisplayValue(formatToCurrency(value));
      props.onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      const cleaned = inputValue.replace(/[^0-9.]/g, "");
      
      // Validate it's a valid number format
      if (cleaned === "" || /^\d*\.?\d*$/.test(cleaned)) {
        setDisplayValue(inputValue);
        onChange?.(parseFromDisplay(inputValue));
      }
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(className)}
          {...props}
        />
        {!isFocused && displayValue && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {currency}
          </span>
        )}
      </div>
    );
  }
);

MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
