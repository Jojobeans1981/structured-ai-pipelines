import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/src/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-md shadow-orange-500/20 hover:from-orange-500 hover:to-amber-500 hover:shadow-lg hover:shadow-orange-500/30 active:from-orange-700 active:to-orange-600",
        destructive:
          "bg-gradient-to-r from-red-700 to-red-600 text-white shadow-md shadow-red-500/20 hover:from-red-600 hover:to-red-500",
        outline:
          "border border-orange-500/20 bg-transparent text-zinc-300 shadow-sm hover:bg-orange-500/10 hover:text-orange-300 hover:border-orange-500/30",
        secondary:
          "bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 shadow-sm hover:bg-zinc-700/80 hover:text-zinc-200",
        ghost: "text-zinc-400 hover:bg-orange-500/10 hover:text-orange-300",
        link: "text-orange-400 underline-offset-4 hover:underline hover:text-orange-300",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9",
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
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
