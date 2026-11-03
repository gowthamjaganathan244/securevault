"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { Avatar } from "@/components/vault/tags";

/**
 * Compact account control. "panel" renders a full-width row that opens upward
 * (desktop navigation panel); "avatar" renders just the avatar and opens
 * downward (phone top bar).
 */
export function AccountMenu({
  variant,
  onOpenChange,
}: {
  variant: "panel" | "avatar";
  onOpenChange?: (open: boolean) => void;
}) {
  const { email, role, signOut } = useSession();
  const [open, setOpenState] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpenState(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, onOpenChange]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const name = email.split("@")[0] || "Account";

  return (
    <div ref={rootRef} className="relative" onKeyDown={open ? onMenuKey : undefined}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={variant === "avatar" ? `Account: ${email}` : undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center transition-colors duration-[160ms]",
          variant === "panel"
            ? cn("h-11 w-full gap-2.5 rounded-xl px-2 text-left hover:bg-white/[0.04]", open && "bg-white/[0.05]")
            : "rounded-full",
        )}
      >
        <Avatar email={email} tone="accent" />
        {variant === "panel" && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-foreground">{name}</span>
              <span className="block text-[11.5px] text-ink-3">{role}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          </>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className={cn(
            "glass absolute z-[60] w-64 animate-pop rounded-xl p-1.5",
            variant === "panel" ? "bottom-[calc(100%+6px)] left-0" : "right-0 top-[calc(100%+8px)]",
          )}
        >
          <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-2">
            <Avatar email={email} tone="accent" className="size-8" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground" title={email}>
                {email}
              </p>
              <p className="text-[11.5px] text-ink-3">{role} · Amazon Cognito</p>
            </div>
          </div>
          <div className="mx-1 h-px bg-white/[0.07]" />
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-ink-2 outline-none transition-colors duration-[120ms] hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.06] focus-visible:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
