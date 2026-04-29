"use client";

import { ReactNode, useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CursorGlow } from "../effects/CursorGlow";
import { SecureCursor } from "../effects/SecureCursor";
import { AnimatedBackground } from "../effects/AnimatedBackground";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Don't show sidebar/topbar on login and MFA pages
  const isAuthPage = pathname === "/" || pathname === "/login" || pathname === "/mfa";

  // Protect routes and handle redirects
  useEffect(() => {
    if (!isAuthPage && !auth.isLoading && !auth.activeNavigator && !auth.isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthPage, auth.isLoading, auth.activeNavigator, auth.isAuthenticated, router]);

  if (auth.isLoading || auth.activeNavigator) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-4 bg-background">
        <CursorGlow />
        <SecureCursor />
        <AnimatedBackground />
        <div className="z-10 flex flex-col items-center space-y-4 glass p-8 rounded-xl border border-white/10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground text-sm font-medium">Securing session...</p>
        </div>
      </div>
    );
  }

  // If not authenticated and not on an auth page, don't render the shell content yet
  // The useEffect will handle the redirect
  if (!auth.isAuthenticated && !isAuthPage) {
    return null;
  }

  if (isAuthPage) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-4">
        <CursorGlow />
        <SecureCursor />
        <AnimatedBackground />
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CursorGlow />
      <SecureCursor />
      <AnimatedBackground />
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden relative w-full">
        <Topbar onMenuClick={() => setIsMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 z-10 hide-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="mx-auto max-w-6xl w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
