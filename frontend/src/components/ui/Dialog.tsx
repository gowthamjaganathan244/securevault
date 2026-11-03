"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal dialog: centred card on larger screens, bottom sheet on phones.
 * Traps focus, closes on Escape / backdrop, and returns focus to the opener.
 */
export function Dialog({
  title,
  description,
  icon,
  tone = "default",
  onClose,
  children,
  footer,
  busy,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "danger";
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** While true the dialog can't be dismissed (an operation is in flight). */
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("button, input, textarea, [href]");
      first?.focus();
    });
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !busy) {
      // Mark as handled so page-level Escape handlers (e.g. Explorer's inspector) leave it alone.
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]') ?? [],
    );
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center sm:p-4" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in bg-black/55" onClick={() => !busy && onClose()} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="glass relative flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-[22px] glass-solid sm:max-w-[480px] sm:animate-pop sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          {icon && (
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border [&_svg]:size-4",
                tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-primary/30 bg-primary/10 text-primary-hi",
              )}
              aria-hidden
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={titleId} className="text-[16px] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1 text-[13px] leading-relaxed text-ink-3">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="min-h-0 overflow-y-auto px-5 pb-4">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] px-5 py-3.5 pb-[calc(14px+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Honest "not connected" banner shown inside action dialogs until the backend exists. */
export function PendingIntegration({ action, endpoint }: { action: string; endpoint: string }) {
  return (
    <div role="status" className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed">
      <span className="mt-1 size-2 shrink-0 rounded-full bg-warning" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{action} is not connected yet</p>
        <p className="mt-0.5 text-ink-3">
          The vault API doesn&apos;t provide <code className="rounded bg-white/[0.06] px-1 py-px font-mono text-[11.5px] text-ink-2">{endpoint}</code>{" "}
          yet. Nothing has been changed.
        </p>
      </div>
    </div>
  );
}

export function PendingBadge({ className }: { className?: string }) {
  return (
    <span className={cn("rounded-md border border-warning/25 bg-warning/[0.08] px-1.5 py-px text-[10.5px] font-medium text-warning", className)}>
      Pending API
    </span>
  );
}
