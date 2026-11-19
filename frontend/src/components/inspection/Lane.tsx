import type { CSSProperties } from "react";
import { Check, CircleDashed, Loader2, Minus, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFinderDate, formatFull } from "@/lib/format";
import { laneProgress, statusLabel, type Stage, type StageStatus } from "@/lib/inspection";
import type { Tone } from "@/components/ui/primitives";

const toneText: Record<Tone, string> = {
  neutral: "text-ink-2",
  info: "text-primary-hi",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-ink-3",
};

const toneVar: Record<Tone, string> = {
  neutral: "var(--color-titanium)",
  info: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  muted: "var(--color-ink-3)",
};

/** The node for a stage. Shape changes with status, so meaning never depends on colour alone. */
export function StageNode({ stage, size = "md" }: { stage: Stage; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-5 [&_svg]:size-3" : "size-7 [&_svg]:size-3.5";
  const color = toneVar[stage.tone];
  const solid: StageStatus[] = ["complete", "attention", "blocked"];
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex shrink-0 items-center justify-center rounded-full border bg-surface-1 transition-[border-color,background-color,color] duration-300",
        dim,
        stage.status === "pending" && "border-line-strong text-ink-3",
        stage.status === "unavailable" && "border-dashed border-line-strong text-ink-3",
      )}
      style={
        solid.includes(stage.status) || stage.status === "active"
          ? {
              borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
              background: `color-mix(in oklab, ${color} ${stage.status === "active" ? 10 : 16}%, var(--color-surface-1))`,
              color,
            }
          : undefined
      }
    >
      {stage.status === "complete" && <Check strokeWidth={2.75} />}
      {stage.status === "active" && <Loader2 className="animate-spin" />}
      {stage.status === "attention" && <TriangleAlert strokeWidth={2.25} />}
      {stage.status === "blocked" && <X strokeWidth={2.75} />}
      {stage.status === "pending" && <CircleDashed className="opacity-0" />}
      {stage.status === "unavailable" && <Minus />}
    </span>
  );
}

/**
 * One document's inspection lane. Horizontal from `md` up (the signature
 * view), a vertical, list-semantic timeline below that. The rail is lit up
 * to the last stage that has evidence — it never advances on its own.
 */
export function InspectionLane({
  stages,
  className,
  layout = "responsive",
  dense,
}: {
  stages: Stage[];
  className?: string;
  /** "vertical" forces the stacked layout (narrow panels such as the passport). */
  layout?: "responsive" | "vertical";
  dense?: boolean;
}) {
  const progress = laneProgress(stages);
  const last = [...stages].reverse().find((s) => s.status !== "pending");
  const railColor = last && (last.status === "attention" || last.status === "blocked") ? toneVar[last.tone] : "var(--color-primary)";
  const horizontal = layout === "responsive";
  const litCount = Math.round(progress * stages.length);

  return (
    <div className={className}>
      {horizontal && (
        <ol
          className="relative hidden grid-flow-col gap-0 md:grid"
          style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
          aria-label="Inspection lane"
        >
          {/* Rail runs between the first and last node centres. */}
          <span
            aria-hidden
            className="lane-rail absolute top-[13px] h-px"
            style={
              {
                left: `calc(100% / ${stages.length * 2})`,
                right: `calc(100% / ${stages.length * 2})`,
                "--lit": `${Math.max(0, Math.min(100, ((litCount - 1) / Math.max(stages.length - 1, 1)) * 100))}%`,
                "--rail-color": railColor,
              } as CSSProperties
            }
          />
          {stages.map((s) => (
            <li key={s.key} className="relative flex min-w-0 flex-col items-center px-1.5 text-center">
              <StageNode stage={s} />
              <p className="eyebrow mt-2.5">{s.label}</p>
              <p className={cn("mt-1 text-[12.5px] font-medium leading-snug", toneText[s.tone])}>
                <span className="sr-only">{statusLabel[s.status]}: </span>
                {s.headline}
              </p>
              {!dense && <p className="mt-1 line-clamp-3 text-[11.5px] leading-snug text-ink-3">{s.detail}</p>}
              {s.at && (
                <time dateTime={s.at} title={formatFull(s.at)} className="tabular mt-1 text-[11px] text-ink-3">
                  {formatFinderDate(s.at)}
                </time>
              )}
            </li>
          ))}
        </ol>
      )}

      <ol className={cn("relative", horizontal && "md:hidden")} aria-label="Inspection lane">
        {stages.map((s, i) => {
          const lineLit = i + 1 < litCount;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-[13px] top-7 w-px"
                  style={{ background: lineLit ? railColor : "color-mix(in oklab, var(--color-tint) 10%, transparent)" }}
                />
              )}
              <StageNode stage={s} />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="eyebrow">{s.label}</p>
                  {s.at && (
                    <time dateTime={s.at} title={formatFull(s.at)} className="tabular text-[11px] text-ink-3">
                      {formatFinderDate(s.at)}
                    </time>
                  )}
                </div>
                <p className={cn("mt-0.5 text-[13px] font-medium leading-snug", toneText[s.tone])}>
                  <span className="sr-only">{statusLabel[s.status]}: </span>
                  {s.headline}
                </p>
                {!dense && <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{s.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A compact, single-row stage strip for cards and table rows. */
export function LaneStrip({ stages, className }: { stages: Stage[]; className?: string }) {
  const summary = stages.map((s) => `${s.label}: ${s.headline}`).join("; ");
  return (
    <span className={cn("flex items-center gap-[3px]", className)} role="img" aria-label={summary} title={summary}>
      {stages.map((s) => (
        <span
          key={s.key}
          className={cn("h-1 flex-1 rounded-full", s.status === "unavailable" && "opacity-40")}
          style={{
            background:
              s.status === "pending" || s.status === "unavailable"
                ? "color-mix(in oklab, var(--color-tint) 12%, transparent)"
                : toneVar[s.tone === "muted" ? "neutral" : s.tone],
          }}
        />
      ))}
    </span>
  );
}

export { toneText, toneVar };
