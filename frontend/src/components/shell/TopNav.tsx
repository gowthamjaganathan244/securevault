"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Search } from "lucide-react";
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
 * Top navigation: brand, the facility's areas in lane order, search and
 * account. The active area is marked by a lit rail under its label. Phones
 * get a compact header plus a bottom tab bar (see MobileTabs).
 */
export function TopNav() {
  const pathname = usePathname();
  const { role } = useSession();
  const { openPalette } = usePalette();
  const mod = useModKey();
  const items = destinationsFor(role);
  const current = destinationFor(pathname);
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
      <div className="glass flex h-[52px] items-center gap-2 rounded-2xl px-2">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 rounded-xl px-1.5 py-1" aria-label="SecureVault — Inspection Lane">
          <LogoMark className="size-8" />
          <span className="hidden leading-none xl:block">
            <span className="block text-[14px] font-semibold tracking-[-0.01em] text-foreground">SecureVault</span>
            <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-3">Inspection Lane</span>
          </span>
        </Link>

        <span aria-hidden className="mx-1.5 hidden h-6 w-px bg-line-strong md:block" />

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
                    title={d.hint}
                    className={cn(
                      "relative flex h-9 items-center gap-2 rounded-[10px] px-3 text-[13px] transition-[background-color,color] duration-[160ms]",
                      active ? "bg-tint/[0.06] font-medium text-foreground" : "text-ink-2 hover:bg-tint/[0.04] hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-primary-hi" : "text-ink-3")} strokeWidth={1.8} aria-hidden />
                    <span className="hidden lg:inline">{d.label}</span>
                    <span className="sr-only lg:hidden">{d.label}</span>
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-x-3 -bottom-[7px] h-px rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)]"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Phones: where you are */}
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold md:hidden">{current?.label ?? "SecureVault"}</p>

        <button
          type="button"
          onClick={openPalette}
          aria-label={`Search (${mod} K)`}
          className="flex h-9 shrink-0 items-center gap-2 rounded-xl px-2.5 text-[13px] text-ink-3 transition-colors duration-[160ms] hover:bg-tint/[0.06] hover:text-foreground lg:w-52 lg:border lg:border-line lg:bg-tint/[0.03]"
        >
          <Search className="size-4 shrink-0 lg:size-3.5" aria-hidden />
          <span className="hidden flex-1 text-left lg:inline">Find a document</span>
          <span className="hidden gap-0.5 lg:flex" aria-hidden>
            <Kbd>{mod}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="shrink-0 pr-0.5">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/** Phone tab bar. Check-in sits in the middle so a new document is always one tap away. */
export function MobileTabs() {
  const pathname = usePathname();
  const { role } = useSession();
  const items = destinationsFor(role);
  return (
    <nav aria-label="Primary" className="glass glass-solid fixed inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] z-40 rounded-2xl md:hidden">
      <ul className="flex h-[60px] items-stretch justify-around px-1">
        {items.map((d) => {
          const active = isActive(pathname, d);
          const Icon = d.icon;
          const primary = d.href === "/upload";
          return (
            <li key={d.href} className="flex flex-1">
              <Link
                href={d.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] font-medium transition-colors",
                  active ? "text-foreground" : "text-ink-3",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-[10px] transition-colors",
                    primary ? "h-7 w-10 border border-primary bg-primary text-primary-foreground" : "size-7",
                    !primary && active && "text-primary-hi",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.9} aria-hidden />
                </span>
                {d.shortLabel}
                {active && !primary && <span aria-hidden className="absolute top-0 h-0.5 w-6 rounded-full bg-primary" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
