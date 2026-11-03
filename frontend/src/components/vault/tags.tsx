import { Building2, Globe, EyeOff, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { fileExtension, fileKind, type FileKind, uploadStateCopy } from "@/lib/vault";
import type { ClassificationLevel, UploadState } from "@/lib/types";

export const classificationStyle: Record<ClassificationLevel, { text: string; bg: string; ring: string; dot: string; icon: typeof Globe }> = {
  Public: { text: "text-public", bg: "bg-public/10", ring: "border-public/25", dot: "bg-public", icon: Globe },
  Internal: { text: "text-internal", bg: "bg-internal/10", ring: "border-internal/25", dot: "bg-internal", icon: Building2 },
  Confidential: { text: "text-confidential", bg: "bg-confidential/10", ring: "border-confidential/25", dot: "bg-confidential", icon: EyeOff },
  Restricted: { text: "text-restricted", bg: "bg-restricted/10", ring: "border-restricted/25", dot: "bg-restricted", icon: LockKeyhole },
};

export const classificationHex: Record<ClassificationLevel, string> = {
  Public: "#62d1a4",
  Internal: "#4ac5e5",
  Confidential: "#edc06a",
  Restricted: "#ec7894",
};

export function ClassificationTag({ level, className, compact }: { level: ClassificationLevel; className?: string; compact?: boolean }) {
  const s = classificationStyle[level] ?? classificationStyle.Internal;
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium leading-none",
        compact ? "h-5 px-1.5 text-[11px]" : "h-5.5 px-2 text-[11.5px]",
        s.text,
        s.bg,
        s.ring,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {level}
    </span>
  );
}

export function UploadStatus({ state, className, withLabel = true }: { state: UploadState; className?: string; withLabel?: boolean }) {
  const copy = uploadStateCopy[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] text-ink-2", className)} title={copy.detail}>
      <span className="relative flex size-2 items-center justify-center" aria-hidden>
        {state === "stored" && <span className="size-2 rounded-full bg-success" />}
        {state === "awaiting" && (
          <>
            <span className="absolute size-2 animate-ping rounded-full bg-primary-hi/60" />
            <span className="size-2 rounded-full bg-primary-hi" />
          </>
        )}
        {state === "not-received" && <span className="size-2 rounded-full border-[1.5px] border-warning" />}
        {state === "unknown" && <span className="size-2 rounded-full bg-ink-3" />}
      </span>
      {withLabel ? copy.label : <span className="sr-only">{copy.label}</span>}
    </span>
  );
}

const kindTint: Record<FileKind, string> = {
  pdf: "#f87171",
  doc: "#60a5fa",
  sheet: "#34d399",
  slide: "#fb923c",
  image: "#c084fc",
  archive: "#a1a1aa",
  text: "#94a3b8",
  other: "#94a3b8",
};

/** A small Finder-like document icon with the real file extension printed on it. */
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
      <path d="M3 1.5h13.5L24.5 9.5V29a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 29V3A1.5 1.5 0 0 1 3 1.5Z" fill="#1c1c22" stroke="rgba(255,255,255,0.14)" />
      <path d="M16.5 1.5V8a1.5 1.5 0 0 0 1.5 1.5h6.5" fill="#26262d" stroke="rgba(255,255,255,0.14)" />
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
          ? "bg-linear-to-b from-primary-hi to-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          : "border border-line-strong bg-surface-3 text-ink-2",
        className,
      )}
    >
      {text}
    </span>
  );
}
