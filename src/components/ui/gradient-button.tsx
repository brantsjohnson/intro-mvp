import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const gradientButtonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-concave text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 touch-target press-effect",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-card hover:opacity-90 hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)]",
        secondary: "bg-card text-foreground hover:bg-card/80 double-border hover:shadow-[0px_2px_3px_rgba(0,0,0,0.15)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-card hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)]",
        outline: "bg-card hover:bg-card/80 hover:text-foreground double-border hover:shadow-[0px_2px_3px_rgba(0,0,0,0.15)]",
        ghost: "hover:bg-card/50 hover:text-foreground hover:shadow-[0px_2px_3px_rgba(0,0,0,0.1)]",
        link: "text-primary underline-offset-4 hover:underline",
        filled: "bg-primary text-primary-foreground shadow-card hover:opacity-90 hover:shadow-[0px_3px_4px_rgba(0,0,0,0.25)]",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 rounded-concave px-4",
        lg: "h-14 rounded-concave px-8 text-base",
        icon: "h-10 w-10 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface GradientButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof gradientButtonVariants> {
  asChild?: boolean
}

const GradientButton = React.forwardRef<HTMLButtonElement, GradientButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(gradientButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
GradientButton.displayName = "GradientButton"

export { GradientButton, gradientButtonVariants }
