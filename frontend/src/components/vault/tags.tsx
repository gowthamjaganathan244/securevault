import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { fileExtension, fileKind, type FileKind, uploadStateCopy } from "@/lib/vault";
import type { ClassificationLevel, UploadState } from "@/lib/types";
import { StatusPill, type Tone } from "@/components/ui/primitives";

/** Tier 1–4: the clearance mark printed beside every classification so it never depends on colour alone. */
export const classificationTier: Record<ClassificationLevel, number> = {
  Public: 1,
  Internal: 2,
  Confidential: 3,
  Restricted: 4,
};

export const classificationStyle: Record<ClassificationLevel, { text: string; bg: string; ring: string; dot: string }> = {
  Public: { text: "text-public", bg: "bg-public/10", ring: "border-public/30", dot: "bg-public" },
  Internal: { text: "text-internal", bg: "bg-internal/10", ring: "border-internal/30", dot: "bg-internal" },
  Confidential: { text: "text-confidential", bg: "bg-confidential/10", ring: "border-confidential/35", dot: "bg-confidential" },
  Restricted: { text: "text-restricted", bg: "bg-restricted/10", ring: "border-restricted/35", dot: "bg-restricted" },
};

/** Theme-aware colour per classification, for inline SVG and gradients. */
export const classificationHex: Record<ClassificationLevel, string> = {
  Public: "var(--color-public)",
  Internal: "var(--color-internal)",
  Confidential: "var(--color-confidential)",
  Restricted: "var(--color-restricted)",
};

/** `color` at `pct`% opacity, for gradients built from theme variables. */
export const alpha = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, transparent)`;

/** Four ascending bars; the first `tier` are lit. */
export function TierMark({ level, className }: { level: ClassificationLevel; className?: string }) {
  const tier = classificationTier[level] ?? 2;
  return (
    <svg viewBox="0 0 13 10" aria-hidden className={cn("h-2.5 w-[13px] shrink-0", className)}>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 3.4}
          y={7 - i * 2.2}
          width="2.2"
          height={3 + i * 2.2}
          rx="0.6"
          fill="currentColor"
          opacity={i < tier ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

export function ClassificationTag({ level, className, compact }: { level: ClassificationLevel; className?: string; compact?: boolean }) {
  const s = classificationStyle[level] ?? classificationStyle.Internal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none",
        compact ? "h-5 px-1.5 text-[11px]" : "h-[22px] px-2 text-[11.5px]",
        s.text,
        s.bg,
        s.ring,
        className,
      )}
      title={`Privacy: ${level} (tier ${classificationTier[level]} of 4)`}
    >
      <TierMark level={level} />
      {level}
    </span>
  );
}

export const uploadTone: Record<UploadState, Tone> = {
  stored: "success",
  awaiting: "info",
  "not-received": "warning",
  unknown: "neutral",
};

export function UploadStatus({ state, className, withLabel = true }: { state: UploadState; className?: string; withLabel?: boolean }) {
  const copy = uploadStateCopy[state];
  if (!withLabel) {
    return (
      <span className={cn("relative inline-flex size-2", className)} title={copy.detail}>
        {state === "awaiting" && <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />}
        <span
          className={cn(
            "relative size-2 rounded-full",
            state === "stored" && "bg-success",
            state === "awaiting" && "bg-primary",
            state === "not-received" && "border-[1.5px] border-warning",
            state === "unknown" && "bg-ink-3",
          )}
        />
        <span className="sr-only">{copy.label}</span>
      </span>
    );
  }
  return (
    <StatusPill tone={uploadTone[state]} pulse={state === "awaiting"} title={copy.detail} className={className}>
      {copy.label}
    </StatusPill>
  );
}

const kindTint: Record<FileKind, string> = {
  pdf: "var(--color-danger)",
  doc: "var(--color-primary-hi)",
  sheet: "var(--color-success)",
  slide: "var(--color-warning)",
  image: "var(--color-titanium)",
  archive: "var(--color-titanium)",
  text: "var(--color-titanium)",
  other: "var(--color-titanium)",
};

/** A compact document glyph with the real file extension printed on its band. */
export function FileGlyph({
  name,
  contentType,
  size = "md",
  className,
}: {
  name: string;
  contentType?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const kind = fileKind(name, contentType);
  const ext = (fileExtension(name) || "file").slice(0, 4).toUpperCase();
  const tint = kindTint[kind];
  const dims = { sm: "h-6 w-5", md: "h-8 w-[26px]", lg: "h-12 w-10", xl: "h-20 w-16" }[size];
  const font = { sm: 5.5, md: 6, lg: 6.4, xl: 6.6 }[size];
  return (
    <svg viewBox="0 0 26 32" aria-hidden className={cn("shrink-0", dims, className)}>
      <path
        d="M3 1.5h13.5L24.5 9.5V29a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 29V3A1.5 1.5 0 0 1 3 1.5Z"
        fill="var(--color-surface-3)"
        stroke="var(--color-line-strong)"
      />
      <path d="M16.5 1.5V8a1.5 1.5 0 0 0 1.5 1.5h6.5" fill="var(--color-surface-4)" stroke="var(--color-line-strong)" />
      <path d="M5 5.5h7M5 8h5" stroke="var(--color-tint)" strokeOpacity="0.16" strokeLinecap="round" />
      <rect x="1.5" y="18" width="23" height="8.5" fill={tint} opacity="0.16" />
      <text
        x="13"
        y="24.4"
        textAnchor="middle"
        fontSize={font}
        fontWeight="700"
        letterSpacing="0.3"
        fill={tint}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {ext}
      </text>
    </svg>
  );
}

export function Avatar({ email, className, tone = "neutral" }: { email: string; className?: string; tone?: "neutral" | "accent" }) {
  const text = initials(email);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        tone === "accent"
          ? "border border-primary/40 bg-primary/15 text-primary-hi"
          : "border border-line-strong bg-surface-3 text-ink-2",
        className,
      )}
    >
      {text}
    </span>
  );
}
