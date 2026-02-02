import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-zinc-200/70 px-3 py-1 text-xs font-medium text-zinc-700",
  {
    variants: {
      variant: {
        default: "bg-white",
        muted: "bg-zinc-100 text-zinc-600",
        accent: "bg-zinc-900 text-white border-transparent",
        outline: "bg-transparent"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
