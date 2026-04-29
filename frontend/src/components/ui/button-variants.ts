import { cn } from "@/lib/utils"

export const buttonVariants = ({ variant = "default", size = "default" }: any = {}) => {
  const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
  
  const variants = {
    default: "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
    outline: "border border-input bg-transparent shadow-sm hover:bg-accent/20 hover:text-accent",
    secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
    ghost: "hover:bg-accent/20 hover:text-accent",
    link: "text-primary underline-offset-4 hover:underline",
  }
  
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  }

  return cn(baseStyles, variants[variant as keyof typeof variants], sizes[size as keyof typeof sizes])
}
