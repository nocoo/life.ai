import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import * as Slot from "radix-ui/slot"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-basalt-ring focus-visible:ring-basalt-ring/50 focus-visible:ring-[3px] aria-invalid:ring-basalt-destructive/20 dark:aria-invalid:ring-basalt-destructive/40 aria-invalid:border-basalt-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-basalt-primary text-basalt-primary-foreground [a&]:hover:bg-basalt-primary/90",
        secondary:
          "bg-basalt-secondary text-basalt-secondary-foreground [a&]:hover:bg-basalt-secondary/90",
        destructive:
          "bg-basalt-destructive text-white [a&]:hover:bg-basalt-destructive/90 focus-visible:ring-basalt-destructive/20 dark:focus-visible:ring-basalt-destructive/40 dark:bg-basalt-destructive/60",
        outline:
          "border-basalt-border text-basalt-foreground [a&]:hover:bg-basalt-accent [a&]:hover:text-basalt-accent-foreground",
        ghost: "[a&]:hover:bg-basalt-accent [a&]:hover:text-basalt-accent-foreground",
        link: "text-basalt-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
