import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "plain";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-medium select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[160ms] ease-[var(--ease-out-soft)] " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  // Security Cyan with terminal-black text: AA contrast in both themes.
  primary:
    "border border-primary bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_1px_2px_rgb(0_0_0/0.3),0_0_0_0_var(--color-primary)] hover:bg-primary-hi hover:border-primary-hi hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_6px_18px_-8px_var(--color-primary)]",
  secondary:
    "bg-surface-3 text-foreground border border-line-strong hover:bg-surface-4 hover:border-tint/20 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-tint)_5%,transparent)]",
  ghost: "text-ink-2 hover:text-foreground hover:bg-tint/[0.06]",
  danger: "bg-danger/[0.08] text-danger border border-danger/35 hover:bg-danger/[0.15]",
  plain: "text-primary-hi hover:text-foreground",
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
