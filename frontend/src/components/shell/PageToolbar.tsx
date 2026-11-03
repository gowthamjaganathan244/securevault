import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The compact toolbar that heads every page: title and the page's own
 * controls (global search and account live in the top navigation).
 * A second row holds page filters when a page has them.
 */
export function PageToolbar({
  title,
  subtitle,
  actions,
  children,
  bottom,
  className,
  sticky = true,
  titleAs: Title = "h1",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  bottom?: ReactNode;
  className?: string;
  sticky?: boolean;
  titleAs?: "h1" | "p";
}) {
  return (
    <div className={cn("z-20 border-b border-line bg-background/80 backdrop-blur-xl", sticky && "sticky top-0", className)}>
      <div className="flex min-h-14 items-center gap-x-3 px-4 py-2 sm:px-6">
        <div className="min-w-0 flex-1">
          <Title className="truncate text-[18px] font-semibold tracking-[-0.02em] text-foreground">{title}</Title>
          {subtitle && <p className="truncate text-[12px] text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{actions}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 sm:px-6">{children}</div>}
      {bottom}
    </div>
  );
}
