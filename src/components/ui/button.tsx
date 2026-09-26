import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-[#F0F0EE] shadow-sm hover:bg-accent hover:text-accent-foreground ",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        filter: "h-fit justify-start px-0 py-0 font-normal text-foreground hover:text-primary text-left",
        quiet: "text-muted-foreground hover:bg-muted hover:text-foreground",
        date: "justify-start text-left font-normal text-muted-foreground",
        inverse: "bg-inverse text-on-color hover:bg-inverse/90",
        choice: "justify-start border border-border-strong bg-card text-left hover:bg-muted",
        choiceSelected: "justify-start border border-primary bg-card text-left",
        overlay: "bg-overlay/50 text-on-color hover:bg-overlay/70",
        combobox: "h-auto min-h-10 w-full justify-between whitespace-normal border border-input bg-background text-left font-normal text-muted-foreground shadow-sm hover:bg-accent",
        queue: "h-auto w-full justify-start whitespace-normal border border-border bg-card p-3 text-left hover:bg-muted/40",
        outlineDanger: "border border-destructive bg-background text-destructive hover:bg-destructive/10",
        entry: "justify-start whitespace-normal text-left text-foreground hover:text-primary",
        calendarDay: "justify-between text-xs font-medium text-foreground hover:text-primary md:text-sm",
        calendarEntry: "justify-start gap-1 bg-muted text-left text-xs text-foreground hover:bg-accent",
        mediaThumbnail: "relative overflow-hidden border border-border bg-muted hover:opacity-85",
        mediaSelected: "overflow-hidden border-2 border-on-color bg-overlay text-on-color focus-visible:ring-on-color",
        mediaUnselected: "overflow-hidden border-2 border-transparent bg-overlay text-on-color opacity-70 hover:opacity-100 focus-visible:ring-on-color",
        mediaSelectedLight: "overflow-hidden border-2 border-foreground bg-background",
        mediaUnselectedLight: "overflow-hidden border-2 border-transparent bg-background hover:border-border-strong",
        mediaDownload: "flex-col gap-1 bg-overlay/40 text-center text-xs text-on-color hover:bg-overlay/60",
        mediaMore: "bg-inverse text-center text-inverse-foreground hover:opacity-85",
        dropzone: "flex-col border-2 border-dashed border-border-strong text-center hover:bg-muted/30",
        metric: "justify-end rounded-md text-right font-normal text-foreground hover:bg-muted",
      },
      size: {
        default: "h-12 px-6 py-2.5",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
        iconSm: "h-8 w-8 p-0",
        iconXs: "h-7 w-7 p-0",
        iconLg: "h-10 w-10 p-0",
        compact: "h-7 px-2 text-base",
        field: "h-9 px-3",
        choice: "h-auto w-full p-4",
        full: "w-full",
        fullSm: "h-8 w-full px-3 text-xs",
        fullField: "h-9 w-full px-3 text-sm",
        bare: "h-auto px-0 py-0",
        filter: "h-fit px-0 py-2",
        combobox: "h-auto min-h-10 w-full px-3 py-2",
        queue: "h-auto w-full p-3",
        calendarDay: "h-auto w-full px-0 py-0",
        calendarEntry: "h-auto w-full px-1.5 py-1",
        thumbnail: "h-24 w-24 shrink-0 p-0",
        filmstrip: "h-full w-24 shrink-0 p-0",
        filmstripShort: "h-20 w-24 shrink-0 p-0",
        overlayFill: "h-full w-full p-0",
        dropzonePhoto: "h-auto w-full px-6 py-8",
        dropzoneDocument: "h-auto w-full p-6",
        entry: "h-auto w-full justify-start px-0 py-0",
        badgeIcon: "h-4 w-4 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), "")}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
