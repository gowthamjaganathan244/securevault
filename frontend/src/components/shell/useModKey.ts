"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function useModKey() {
  return useSyncExternalStore(
    subscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "⌘",
  );
}
