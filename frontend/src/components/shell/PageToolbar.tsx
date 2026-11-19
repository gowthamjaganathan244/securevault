import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The header that opens every area: an eyebrow naming the checkpoint, the
 * title, and the page's own controls. A second row holds filters.
 */
export function PageToolbar({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  bottom,
  className,
  sticky = true,
  titleAs: Title = "h1",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  bottom?: ReactNode;
  className?: string;
  sticky?: boolean;
  titleAs?: "h1" | "p";
}) {
  return (
    <div className={cn("z-20 border-b border-line bg-background/85 backdrop-blur-xl", sticky && "sticky top-0", className)}>
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-x-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
          <Title className="truncate text-[19px] font-semibold tracking-[-0.025em] text-foreground sm:text-[21px]">{title}</Title>
          {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{actions}</div>}
      </div>
      {children && <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">{children}</div>}
      {bottom}
    </div>
  );
}
