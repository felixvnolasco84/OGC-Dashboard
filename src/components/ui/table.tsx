import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & { variant?: "default" | "budget" }
>(({ className, variant = "default", ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", variant === "budget" && "bg-card", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { variant?: "default" | "budget" | "ledgerHeader" | "ledger" | "ledgerInvalid" }
>(({ className, variant = "default", ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      variant === "budget" && "border-border hover:bg-background",
      variant === "ledgerHeader" && "border-border bg-muted/40 hover:bg-muted/40",
      variant === "ledger" && "border-border hover:bg-muted/30",
      variant === "ledgerInvalid" && "border-border bg-destructive/10 hover:bg-muted/30",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { variant?: "default" | "budget" | "ledger" }
>(({ className, variant = "default", ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-normal text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      variant === "budget" && "border-r border-border  px-4 py-4 text-base last:border-r-0",
      variant === "ledger" && "h-10 px-3 text-xs text-muted-foreground",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { variant?: "default" | "budget" | "budgetMuted" | "ledgerCompact" | "ledgerCompactMuted" | "ledgerCompactSubtle" | "ledgerCompactEmphasis" | "ledger" | "ledgerMuted" | "ledgerSubtle" | "ledgerEmphasis" | "ledgerTruncate" }
>(({ className, variant = "default", ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      variant === "budget" && "border-r border-border px-4 py-4 text-base text-foreground last:border-r-0",
      variant === "budgetMuted" && "border-r border-border px-4 py-4 text-base font-light text-disabled-foreground last:border-r-0",
      variant === "ledgerCompact" && "px-3 py-2.5",
      variant === "ledgerCompactMuted" && "px-3 py-2.5 text-sm text-muted-foreground",
      variant === "ledgerCompactSubtle" && "px-3 py-2.5 text-xs tabular-nums text-muted-foreground",
      variant === "ledgerCompactEmphasis" && "px-3 py-2.5 text-sm font-medium tabular-nums",
      variant === "ledger" && "px-3 py-3",
      variant === "ledgerMuted" && "px-3 py-3 text-sm text-muted-foreground",
      variant === "ledgerSubtle" && "px-3 py-3 text-sm text-muted-foreground",
      variant === "ledgerEmphasis" && "px-3 py-3 text-sm font-medium tabular-nums",
      variant === "ledgerTruncate" && "truncate px-3 py-3 text-sm text-muted-foreground",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
