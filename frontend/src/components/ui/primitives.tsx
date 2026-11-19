import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

/** Text + soft-fill + border classes per semantic tone. */
export const toneClass: Record<Tone, string> = {
  neutral: "text-ink-2 bg-tint/[0.04] border-line-strong",
  info: "text-primary-hi bg-primary/[0.09] border-primary/30",
  success: "text-success bg-success/[0.09] border-success/30",
  warning: "text-warning bg-warning/[0.10] border-warning/35",
  danger: "text-danger bg-danger/[0.10] border-danger/35",
  muted: "text-ink-3 bg-transparent border-line border-dashed",
};

export const toneDot: Record<Tone, string> = {
  neutral: "bg-ink-3",
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "border border-ink-3 bg-transparent",
};

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-tint/[0.04] px-1 font-mono text-[10.5px] font-medium text-ink-3",
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
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/** A small status chip: dot + label in a semantic tone. Never relies on colour alone. */
export function StatusPill({
  tone,
  children,
  icon,
  className,
  title,
  pulse,
}: {
  tone: Tone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  /** A slow pulse for genuinely in-flight work (respects reduced motion). */
  pulse?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium leading-none",
        toneClass[tone],
        className,
      )}
    >
      {icon ? (
        <span className="shrink-0 [&_svg]:size-3" aria-hidden>
          {icon}
        </span>
      ) : (
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", toneDot[tone])} />}
          <span className={cn("relative size-1.5 rounded-full", toneDot[tone])} />
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-tint/[0.06]", className)} />;
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-7 w-6 rounded" />
          <Skeleton className="h-3.5 max-w-[260px] flex-1" />
          <Skeleton className="ml-auto hidden h-3 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("plate relative rounded-2xl", className)} {...props} />;
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
    info: "border-primary/25 bg-primary/[0.06] text-ink-2 [&_svg]:text-primary-hi",
    warning: "border-warning/30 bg-warning/[0.07] text-ink-2 [&_svg]:text-warning",
    danger: "border-danger/35 bg-danger/[0.08] text-foreground/90 [&_svg]:text-danger",
    success: "border-success/30 bg-success/[0.07] text-ink-2 [&_svg]:text-success",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-snug", tones[tone], className)}
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
      <div className="plate-raised mb-3.5 flex size-11 items-center justify-center rounded-xl text-ink-2 [&_svg]:size-5">{icon}</div>
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

/** Segmented control (radio group semantics, arrow-key navigation). */
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
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-[11px] border border-line bg-surface-1 p-[3px]", className)}
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
              "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background-color,color,box-shadow] duration-[160ms] [&_svg]:size-3.5",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-7 px-3 text-[12.5px]",
              active
                ? "bg-surface-3 text-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-tint)_8%,transparent),0_1px_2px_rgb(0_0_0/0.2)]"
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
  shortcut,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  label: string;
  shortcut?: string;
}) {
  return (
    <label className={cn("group relative flex items-center", className)}>
      <span className="sr-only">{label}</span>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute left-3 size-3.5 text-ink-3">
        <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 w-full rounded-[10px] border border-line bg-surface-1 pl-8 text-[13px] text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-[160ms] hover:border-line-strong focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_18%,transparent)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden",
          shortcut ? "pr-9" : "pr-3",
        )}
      />
      {shortcut && !value && <Kbd className="pointer-events-none absolute right-2">{shortcut}</Kbd>}
    </label>
  );
}

/** Label/value row used inside passports and evidence panels. */
export function DataRow({ label, children, mono, className }: { label: React.ReactNode; children: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[minmax(96px,34%)_1fr] items-baseline gap-3 py-2 text-[12.5px]", className)}>
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn("min-w-0 break-words text-foreground", mono && "font-mono text-[11.5px] tracking-tight text-ink-2")}>{children}</dd>
    </div>
  );
}
