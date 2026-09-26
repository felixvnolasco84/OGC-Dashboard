import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { density?: "default" | "compact"; variant?: "default" | "muted" | "card" | "display" }>(
  ({ className, type, density = "default", variant = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-none border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ",
          density === "compact" && "h-8",
          variant === "muted" && "bg-muted",
          variant === "card" && "bg-card",
          variant === "display" && "h-auto border-0 bg-transparent p-0 text-2xl font-semibold shadow-none focus-visible:ring-0",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
