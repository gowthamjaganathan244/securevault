"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A modal sheet: slides in from the right on tablets, fills the screen on
 * phones. Traps focus, closes on Escape or backdrop, and returns focus to
 * whatever opened it.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("button, [href], [tabindex='0']")?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), textarea, [tabindex="0"]') ?? []);
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

  return createPortal(
    <div className="fixed inset-0 z-[58]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-0 animate-sheet-up overflow-y-auto overscroll-contain bg-surface-1 pb-[env(safe-area-inset-bottom)] sm:inset-y-2 sm:left-auto sm:right-2 sm:w-[min(480px,calc(100vw-16px))] sm:animate-slide-in-right sm:rounded-[20px] sm:border sm:border-line-strong sm:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
