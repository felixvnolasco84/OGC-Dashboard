import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { variant?: "default" | "darkEdit" | "darkComment" | "plain" | "code" | "description" | "descriptionError" }
>(({ className, variant = "default", ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        variant === "darkEdit" && "min-h-20 border-on-color/20 bg-on-color/5 text-on-color",
        variant === "darkComment" && "min-h-24 border-on-color/20 bg-on-color/5 text-on-color placeholder:text-on-color/50",
        variant === "plain" && "resize-none",
        variant === "code" && "resize-none font-mono text-sm",
        variant === "description" && "resize-none text-sm",
        variant === "descriptionError" && "resize-none border-destructive/40 text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
