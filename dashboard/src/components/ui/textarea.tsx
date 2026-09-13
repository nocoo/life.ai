import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-basalt-border bg-basalt-secondary placeholder:text-basalt-muted-foreground hover:border-basalt-foreground/20 focus-visible:border-basalt-ring focus-visible:ring-basalt-ring/50 aria-invalid:ring-basalt-destructive/20 dark:aria-invalid:ring-basalt-destructive/40 aria-invalid:border-basalt-destructive flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
