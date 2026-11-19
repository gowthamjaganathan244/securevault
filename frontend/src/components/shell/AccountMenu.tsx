"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { setTheme, useTheme, type ThemeChoice } from "@/lib/theme";
import { Avatar } from "@/components/vault/tags";

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "Match system", icon: Monitor },
];

/** Account control: identity, role, appearance and sign out. */
export function AccountMenu() {
  const { email, role, signOut } = useSession();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  const itemCls =
    "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-ink-2 outline-none transition-colors duration-[120ms] hover:bg-tint/[0.06] hover:text-foreground focus-visible:bg-tint/[0.06] focus-visible:text-foreground [&>svg]:size-4";

  return (
    <div ref={rootRef} className="relative" onKeyDown={open ? onMenuKey : undefined}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account: ${email}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center rounded-full"
      >
        <Avatar email={email} tone="accent" className="size-8" />
      </button>

      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="Account" className="glass glass-solid absolute right-0 top-[calc(100%+10px)] z-[60] w-72 animate-pop rounded-2xl p-1.5">
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
            <Avatar email={email} tone="accent" className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground" title={email}>
                {email}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px font-medium text-primary-hi">{role}</span>
                Amazon Cognito
              </p>
            </div>
          </div>
          <div className="mx-1 h-px bg-line" />
          <p className="eyebrow px-2.5 pb-1 pt-2.5">Appearance</p>
          {THEMES.map((t) => (
            <button key={t.value} type="button" role="menuitemradio" aria-checked={theme === t.value} onClick={() => setTheme(t.value)} className={itemCls}>
              <t.icon aria-hidden />
              <span className="flex-1 text-left">{t.label}</span>
              {theme === t.value && <Check className="text-primary-hi" aria-hidden />}
            </button>
          ))}
          <div className="mx-1 my-1 h-px bg-line" />
          <button type="button" role="menuitem" onClick={() => void signOut()} className={cn(itemCls)}>
            <LogOut aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
