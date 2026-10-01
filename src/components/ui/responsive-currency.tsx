import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/utils";

/** Full precision in mobile summaries; existing compact formatting on desktop. */
export function ResponsiveCurrency({ amount, currency = "MXN", compact }: { amount: number; currency?: string; compact: ReactNode }) {
  const full = formatCurrency(amount, currency);
  return <span title={full}><span className="hidden lg:inline">{compact}</span><span className="lg:hidden">{full}</span></span>;
}
