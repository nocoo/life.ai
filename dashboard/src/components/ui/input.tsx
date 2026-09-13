import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-basalt-foreground placeholder:text-basalt-muted-foreground selection:bg-basalt-primary selection:text-basalt-primary-foreground border-basalt-border bg-basalt-secondary h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none hover:border-basalt-foreground/20 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-basalt-ring focus-visible:ring-basalt-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-basalt-destructive/20 dark:aria-invalid:ring-basalt-destructive/40 aria-invalid:border-basalt-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
