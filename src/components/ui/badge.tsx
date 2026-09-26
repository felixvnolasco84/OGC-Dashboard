import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "rounded-full border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "rounded-full border-border-strong bg-secondary text-muted-foreground hover:bg-secondary/80",
        destructive:
          "rounded-full border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground bg-disabled text-muted-foreground border border-border-strong",
        success:
          "w-fit rounded-full border-success-border bg-success-muted py-1.5 text-left font-normal leading-none text-success hover:bg-success-muted/80",
        warning:
          "w-fit rounded-full border-warning-border bg-warning-muted py-1.5 text-left font-normal leading-none text-warning hover:bg-warning-muted/80",
        danger:
          "w-fit rounded-full border-danger-border bg-danger-muted py-1.5 text-left font-normal leading-none text-danger hover:bg-danger-muted/80",
        neutral:
          "w-fit rounded-full border-border-strong bg-muted py-1.5 text-left font-normal leading-none text-muted-foreground hover:bg-muted",
        info:
          "w-fit rounded-full border-info-border bg-info-muted py-1.5 text-left font-normal leading-none text-info hover:bg-info-muted/80",
        metric:
          "min-w-24 justify-center rounded-xl border-border-strong bg-muted py-1.5 text-center text-2xs leading-none text-muted-foreground",
        sourceOgc:
          "border-success-border bg-success-muted text-2xs text-success",
        sourceIngreso:
          "border-border bg-muted text-2xs text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
