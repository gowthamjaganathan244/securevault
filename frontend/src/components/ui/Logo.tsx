import { cn } from "@/lib/utils";

/** SecureVault mark: a shield whose inner line forms a keyhole. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <linearGradient id="sv-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#sv-fill)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="rgba(255,255,255,0.22)" />
      <path
        d="M16 6.5 23.5 9.4v6.1c0 4.6-3.1 8.5-7.5 10-4.4-1.5-7.5-5.4-7.5-10V9.4L16 6.5Z"
        fill="rgba(255,255,255,0.14)"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="14.2" r="2.1" fill="white" />
      <path d="M15.1 15.6h1.8l.5 4.1h-2.8l.5-4.1Z" fill="white" />
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
