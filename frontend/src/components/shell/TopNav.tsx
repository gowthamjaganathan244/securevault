"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { destinationFor, destinationsFor, type Destination } from "@/lib/access";
import { useSession } from "@/lib/session";
import { LogoMark } from "@/components/ui/Logo";
import { Kbd } from "@/components/ui/primitives";
import { AccountMenu } from "./AccountMenu";
import { usePalette } from "./AppShell";
import { useModKey } from "./useModKey";

const isActive = (pathname: string, d: Destination) => pathname === d.href || pathname.startsWith(`${d.href}/`);

/**
 * Compact floating top navigation: brand, the five destinations, global
 * search and the account menu in one glass bar. Phones get a menu button
 * that opens the destinations as a bottom sheet.
 */
export function TopNav() {
  const pathname = usePathname();
  const { role } = useSession();
  const { openPalette } = usePalette();
  const mod = useModKey();
  const items = destinationsFor(role);
  const current = destinationFor(pathname);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Left/Right arrows move between destinations (toolbar pattern).
  const onListKey = (e: React.KeyboardEvent) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLElement>("a") ?? []);
    const i = links.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: links.length - 1 }[e.key];
    if (i < 0 || next === undefined) return;
    e.preventDefault();
    links[(next + links.length) % links.length]?.focus();
  };

  return (
    <header className="relative z-40 shrink-0 px-2 pt-2 sm:px-3">
      <div className="glass flex h-12 items-center gap-2 rounded-2xl px-2 !bg-[rgba(18,18,23,0.86)]">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 rounded-xl px-1.5 py-1" aria-label="SecureVault — Workspace">
          <LogoMark className="size-7" />
          <span className="hidden text-[14px] font-semibold tracking-[-0.01em] xl:inline">SecureVault</span>
        </Link>

        <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/[0.08] md:block" />

        <nav aria-label="Primary" className="hidden min-w-0 flex-1 md:block">
          <ul ref={listRef} onKeyDown={onListKey} className="flex items-center gap-0.5">
            {items.map((d) => {
              const active = isActive(pathname, d);
              const Icon = d.icon;
              return (
                <li key={d.href}>
                  <Link
                    href={d.href}
                    aria-current={active ? "page" : undefined}
                    title={d.label}
                    className={cn(
                      "relative flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] transition-[background-color,color] duration-[160ms]",
                      active ? "bg-white/[0.07] font-medium text-foreground" : "text-ink-2 hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-primary-hi" : "text-ink-3")} strokeWidth={1.9} aria-hidden />
                    <span className="hidden lg:inline">{d.label}</span>
                    <span className="sr-only lg:hidden">{d.label}</span>
                    {active && (
                      <span aria-hidden className="absolute inset-x-3 -bottom-[5px] h-[2px] rounded-full bg-primary-hi shadow-[0_0_8px_rgba(96,165,250,0.7)]" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Phones: current place + menu */}
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold md:hidden">{current?.label ?? "SecureVault"}</p>

        <button
          type="button"
          onClick={openPalette}
          aria-label={`Search (${mod} K)`}
          className="flex h-9 shrink-0 items-center gap-2 rounded-xl px-2.5 text-[13px] text-ink-3 transition-colors duration-[160ms] hover:bg-white/[0.06] hover:text-foreground lg:w-48 lg:border lg:border-white/[0.07] lg:bg-white/[0.03]"
        >
          <Search className="size-4 shrink-0 lg:size-3.5" aria-hidden />
          <span className="hidden flex-1 text-left lg:inline">Search</span>
          <span className="hidden gap-0.5 lg:flex" aria-hidden>
            <Kbd>{mod}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="shrink-0 pr-0.5">
          <AccountMenu variant="avatar" />
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Open navigation"
          aria-expanded={sheetOpen}
          aria-controls="nav-sheet"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-white/[0.06] hover:text-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {sheetOpen && (
        <NavSheet
          items={items}
          pathname={pathname}
          onClose={() => {
            setSheetOpen(false);
            requestAnimationFrame(() => menuButtonRef.current?.focus());
          }}
        />
      )}
    </header>
  );
}

function NavSheet({ items, pathname, onClose }: { items: Destination[]; pathname: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { email, role } = useSession();

  useEffect(() => {
    requestAnimationFrame(() => (ref.current?.querySelector<HTMLElement>('a[aria-current="page"]') ?? ref.current?.querySelector("a"))?.focus());
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const links = Array.from(ref.current?.querySelectorAll<HTMLElement>("a") ?? []);
    if (!links.length) return;
    if (e.shiftKey && document.activeElement === links[0]) {
      e.preventDefault();
      links[links.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === links[links.length - 1]) {
      e.preventDefault();
      links[0].focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[55] md:hidden" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        id="nav-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass absolute inset-x-0 bottom-0 max-h-[85dvh] animate-sheet-up overflow-y-auto rounded-t-[22px] p-3 pb-[calc(12px+env(safe-area-inset-bottom))] !bg-[rgba(20,20,25,0.96)]"
      >
        <span aria-hidden className="mx-auto mb-2 block h-1 w-9 rounded-full bg-white/20" />
        <p id={titleId} className="px-2.5 pb-2 pt-1 text-[14px] font-semibold">
          Go to
        </p>
        <ul className="space-y-0.5">
          {items.map((d) => {
            const active = isActive(pathname, d);
            const Icon = d.icon;
            return (
              <li key={d.href}>
                <Link
                  href={d.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className="flex h-14 items-center gap-3 rounded-xl px-2.5 outline-none hover:bg-white/[0.05] focus-visible:bg-white/[0.07]"
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border",
                      active ? "border-primary/40 bg-primary/15 text-primary-hi" : "border-white/[0.07] bg-white/[0.03] text-ink-2",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[14px]", active ? "font-medium text-foreground" : "text-ink-2")}>{d.label}</span>
                    <span className="block truncate text-[12px] text-ink-3">{d.hint}</span>
                  </span>
                  {active && <span className="size-1.5 rounded-full bg-primary-hi" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 border-t border-white/[0.07] px-2.5 pt-2.5 text-[12px] text-ink-3">
          Signed in as <span className="text-ink-2">{email}</span> · {role}
        </p>
      </div>
    </div>
  );
}
