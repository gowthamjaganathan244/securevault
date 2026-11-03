import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "plain";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[160ms] ease-[var(--ease-out-soft)] " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.4)] hover:bg-[#4b8df7]",
  secondary:
    "bg-surface-3 text-foreground border border-line-strong hover:bg-surface-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
  ghost: "text-ink-2 hover:text-foreground hover:bg-white/[0.06]",
  danger: "bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15",
  plain: "text-primary-hi hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px] [&_svg]:size-3.5",
  md: "h-8 px-3 text-[13px] [&_svg]:size-4",
  lg: "h-10 px-4 text-[14px] [&_svg]:size-4",
  icon: "size-8 [&_svg]:size-4",
  "icon-sm": "size-7 rounded-md [&_svg]:size-3.5",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />
  ),
);
Button.displayName = "Button";

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
