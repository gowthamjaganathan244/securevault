import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-white/[0.04] px-1 font-sans text-[11px] font-medium text-ink-3",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function SectionLabel({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-white/[0.05]", className)} />;
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-7 w-6 rounded" />
          <Skeleton className="h-3.5 flex-1 max-w-[260px]" />
          <Skeleton className="ml-auto hidden h-3 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative rounded-xl border border-line bg-surface-1 hairline-top", className)} {...props} />;
}

export function Notice({
  tone = "info",
  icon,
  children,
  className,
  action,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const tones = {
    info: "border-primary/20 bg-primary/[0.06] text-ink-2 [&_svg]:text-primary-hi",
    warning: "border-warning/20 bg-warning/[0.06] text-ink-2 [&_svg]:text-warning",
    danger: "border-danger/25 bg-danger/[0.07] text-foreground/90 [&_svg]:text-danger",
    success: "border-success/20 bg-success/[0.06] text-ink-2 [&_svg]:text-success",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-snug", tones[tone], className)}
    >
      {icon && <span className="mt-px shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-line-strong bg-surface-3 text-ink-2 [&_svg]:size-5">
        {icon}
      </div>
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

/** macOS-style segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center rounded-lg border border-line bg-white/[0.03] p-0.5", className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-[background-color,color,box-shadow] duration-[160ms] [&_svg]:size-3.5",
              size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12.5px]",
              active
                ? "bg-surface-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)]"
                : "text-ink-3 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
  inputRef,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  label: string;
}) {
  return (
    <label className={cn("group relative flex items-center", className)}>
      <span className="sr-only">{label}</span>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3">
        <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-lg border border-line bg-white/[0.03] pl-8 pr-3 text-[13px] text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-[160ms] hover:border-line-strong focus:border-primary/50 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.18)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
  );
}
