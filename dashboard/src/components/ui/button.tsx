import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import * as Slot from "radix-ui/slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-basalt-ring focus-visible:ring-basalt-ring/50 focus-visible:ring-[3px] aria-invalid:ring-basalt-destructive/20 dark:aria-invalid:ring-basalt-destructive/40 aria-invalid:border-basalt-destructive",
  {
    variants: {
      variant: {
        default: "bg-basalt-primary text-basalt-primary-foreground hover:bg-basalt-primary/90",
        destructive:
          "bg-basalt-destructive text-white hover:bg-basalt-destructive/90 focus-visible:ring-basalt-destructive/20 dark:focus-visible:ring-basalt-destructive/40 dark:bg-basalt-destructive/60",
        outline:
          "border bg-basalt-background shadow-xs hover:bg-basalt-accent hover:text-basalt-accent-foreground",
        secondary:
          "bg-basalt-secondary text-basalt-secondary-foreground hover:bg-basalt-secondary/80",
        ghost:
          "hover:bg-basalt-accent hover:text-basalt-accent-foreground dark:hover:bg-basalt-accent/50",
        link: "text-basalt-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
