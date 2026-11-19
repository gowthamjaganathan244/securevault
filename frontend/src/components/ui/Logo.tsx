import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * SecureVault mark: an inspection gate standing over a lane. The arch is the
 * checkpoint, the line is the lane every document travels, and the cyan
 * point is the moment of inspection.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-tint)" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="var(--color-tint)" stopOpacity="0.08" />
          <stop offset="1" stopColor="var(--color-tint)" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id={`${id}-lane`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--color-primary)" />
          <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="var(--color-surface-2)" stroke={`url(#${id}-edge)`} />
      <path d="M10 23.5V13a6 6 0 0 1 12 0v10.5" fill="none" stroke="var(--color-titanium)" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.5 23.5h23" stroke={`url(#${id}-lane)`} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16" cy="13.4" r="2" fill="var(--color-primary)" />
      <path d="M16 15.4v3.6" stroke="var(--color-primary)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">SecureVault</span>
    </span>
  );
}
