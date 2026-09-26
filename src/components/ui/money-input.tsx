import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { currencyFractionDigits, parseMoneyInput } from "@/lib/money";

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: number;
  onChange?: (value: number) => void;
  currency?: string;
  locale?: string;
  variant?: "default" | "muted" | "card";
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, variant = "default", value = 0, onChange, currency = "MXN", locale = "es-MX", disabled, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState("");
    const [isFocused, setIsFocused] = React.useState(false);

    const fractionDigits = currencyFractionDigits(currency, locale);

    const formatToCurrency = React.useCallback((val: number): string => {
      if (!val || val === 0) return "";
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(val);
    }, [fractionDigits, locale]);

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
      const inputValue = e.target.value.trim();
      const parsed = parseMoneyInput(inputValue, currency, locale);
      if (parsed === null) return;
      setDisplayValue(inputValue);
      onChange?.(parsed);
    };

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          variant={variant}
          className={cn("pr-14 tabular-nums", className)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {currency}
        </span>
      </div>
    );
  }
);

MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
