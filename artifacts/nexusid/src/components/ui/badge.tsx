import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-1 focus:ring-ring" +
  " hover-elevate ",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-xs",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-[#DC143C]/30 bg-[#DC143C]/8 text-[#DC143C] shadow-xs",
        outline: "text-foreground border [border-color:var(--badge-outline)]",
        gold:
          "border-[#E8754A]/30 bg-[#E8754A]/8 text-[#E8754A]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
