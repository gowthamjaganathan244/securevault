"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ShieldX } from "lucide-react";
import { MobileTabs, TopNav } from "./TopNav";
import { DocumentActionsProvider } from "@/components/vault/DocumentActions";
import { PageToolbar } from "./PageToolbar";
import { ToastProvider } from "@/components/ui/Toast";
import { LogoMark } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/primitives";
import { canVisit } from "@/lib/access";
import { useSession } from "@/lib/session";

// Loaded on first use: keeps search out of the initial bundle.
const CommandPalette = dynamic(() => import("./CommandPalette").then((m) => m.CommandPalette), { ssr: false });

const PaletteContext = createContext<{ openPalette: () => void }>({ openPalette: () => {} });
export const usePalette = () => useContext(PaletteContext);

const AUTH_PAGES = new Set(["/", "/login", "/mfa"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, role } = useSession();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isAuthPage = AUTH_PAGES.has(pathname);
  const signedIn = status === "signedIn";

  // Protected routes require an Amplify/Cognito session.
  useEffect(() => {
    if (!isAuthPage && status === "signedOut") router.replace("/login");
  }, [isAuthPage, status, router]);

  useEffect(() => {
    if (isAuthPage || !signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAuthPage, signedIn]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const paletteValue = useMemo(() => ({ openPalette }), [openPalette]);

  if (isAuthPage) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  if (status === "loading") {
    return <SessionSplash />;
  }

  // The effect above redirects; render nothing protected meanwhile.
  if (!signedIn) {
    return null;
  }

  return (
    <ToastProvider>
      <PaletteContext.Provider value={paletteValue}>
        <a
          href="#main"
          className="sr-only z-[80] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        {/* Floating top navigation above a full-width operational area. */}
        <div className="sv-ambient flex h-dvh flex-col bg-background">
          <TopNav />
          <DocumentActionsProvider>
            <main id="main" className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-0">
              <div key={pathname} className="min-h-full animate-page">
                {canVisit(role, pathname) ? children : <NoAccess role={role} />}
              </div>
            </main>
          </DocumentActionsProvider>
          <MobileTabs />
        </div>
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      </PaletteContext.Provider>
    </ToastProvider>
  );
}

function SessionSplash() {
  return (
    <div className="sv-ambient flex h-dvh flex-col items-center justify-center gap-5 bg-background" role="status">
      <LogoMark className="size-12" />
      <div className="h-px w-40 overflow-hidden rounded-full bg-tint/10" aria-hidden>
        <div className="h-full w-1/3 animate-[lane-sweep_1.4s_var(--ease-out-soft)_infinite] bg-primary" />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">Verifying session</p>
    </div>
  );
}

function NoAccess({ role }: { role: string }) {
  return (
    <div className="min-h-full">
      <PageToolbar eyebrow="Checkpoint" title="Restricted area" />
      <div className="mx-auto max-w-lg px-4 pt-24">
      <EmptyState
        icon={<ShieldX />}
        title="This area isn't available to your role"
        action={
          <ButtonLink href="/dashboard" variant="secondary">
            Back to the lane
          </ButtonLink>
        }
      >
          You&apos;re signed in as <span className="text-ink-2">{role}</span>. Ask an administrator if you need access.
        </EmptyState>
      </div>
    </div>
  );
}
