"use client";

import { useSyncExternalStore } from "react";

/** The viewer's choice. "system" follows the OS; the product's default identity is dark. */
export type ThemeChoice = "dark" | "light" | "system";

const KEY = "sv.theme";

/** Inline, dependency-free script run in <head> before first paint. */
export const THEME_BOOTSTRAP = `(function(){try{var c=localStorage.getItem("${KEY}")||"dark";var t=c==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):c;document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){}})();`;

const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

function apply(choice: ThemeChoice) {
  const resolved = choice === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function setTheme(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  apply(choice);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mql = window.matchMedia("(prefers-color-scheme: light)");
  const onSystem = () => {
    if (read() === "system") apply("system");
    cb();
  };
  mql.addEventListener("change", onSystem);
  return () => {
    listeners.delete(cb);
    mql.removeEventListener("change", onSystem);
  };
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "dark");
}
