"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, FilePen, Link2, MoreHorizontal, PanelRightOpen, Replace, RotateCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { integrations } from "@/lib/api";
import { useSession } from "@/lib/session";
import { canDownload, canManage, uploadState } from "@/lib/vault";
import type { VaultFile } from "@/lib/types";
import { PendingBadge } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useDocumentActions } from "./DocumentActions";
import { useDownload } from "./useDownload";

interface Item {
  key: string;
  label: string;
  icon: ReactNode;
  run: () => void;
  danger?: boolean;
  pending?: boolean;
  divider?: boolean;
}

/** "More actions" button + menu used on every Explorer card and row. */
export function ActionsMenu({ file, onView, className }: { file: VaultFile; onView: () => void; className?: string }) {
  const { role, email } = useSession();
  const { open, retry } = useDocumentActions();
  const { download } = useDownload();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const state = uploadState(file);
  const manage = canManage(file, role, email);
  const items: Item[] = [
    { key: "view", label: "View details", icon: <PanelRightOpen />, run: onView },
    ...(canDownload(role) && state === "stored" ? [{ key: "download", label: "View / Download", icon: <ArrowDownToLine />, run: () => download(file) }] : []),
    ...(manage && state === "not-received" ? [{ key: "retry", label: "Re-upload", icon: <RotateCw />, run: () => retry(file) }] : []),
    ...(manage && state === "stored" ? [{ key: "replace", label: "Replace file", icon: <Replace />, run: () => open("replace", file), pending: !integrations.replaceFile }] : []),
    ...(manage ? [{ key: "edit", label: "Edit details", icon: <FilePen />, run: () => open("edit", file), pending: !integrations.updateMetadata }] : []),
    {
      key: "link",
      label: "Copy passport link",
      icon: <Link2 />,
      run: async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/files/${file.fileId}`).catch(() => {});
        toast({ tone: "success", title: "Passport link copied", body: "Opening it requires signing in." });
      },
    },
    ...(manage ? [{ key: "delete", label: "Delete", icon: <Trash2 />, run: () => open("delete", file), danger: true, pending: !integrations.deleteFile, divider: true }] : []),
  ];

  // Fixed positioning so the menu is never clipped by scrolling lists; flips upward near the bottom.
  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 224;
    const height = items.length * 36 + 16;
    const top = r.bottom + 6 + height > window.innerHeight ? Math.max(8, r.top - height - 6) : r.bottom + 6;
    const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
    setPos({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    const close = (e: Event) => {
      if (e.type === "scroll" || (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menuOpen]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    // React events bubble through portals to the card/list below — keep menu keys to the menu.
    e.stopPropagation();
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(false);
      btnRef.current?.focus();
      return;
    }
    const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: nodes.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    nodes[(next + nodes.length) % nodes.length]?.focus();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Actions for ${file.fileName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((o) => !o);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          "flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors duration-[140ms] hover:bg-white/[0.08] hover:text-foreground",
          menuOpen && "bg-white/[0.1] text-foreground",
          className,
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menuOpen &&
        pos &&
        // Portal to <body>: dimmed/animated ancestors create stacking contexts that would trap the menu.
        createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${file.fileName}`}
          onKeyDown={onMenuKey}
          onClick={(e) => e.stopPropagation()}
          className="glass fixed z-[60] w-56 animate-pop rounded-xl p-1.5 glass-solid"
          style={{ top: pos.top, left: pos.left }}
        >
          {items.map((it) => (
            <div key={it.key}>
              {it.divider && <div className="mx-1 my-1 h-px bg-white/[0.07]" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  it.run();
                }}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] outline-none transition-colors duration-[120ms] [&_svg]:size-3.5 [&_svg]:shrink-0",
                  it.danger
                    ? "text-danger hover:bg-danger/10 focus-visible:bg-danger/10"
                    : "text-ink-2 hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.06] focus-visible:text-foreground",
                )}
              >
                {it.icon}
                <span className="flex-1">{it.label}</span>
                {it.pending && <PendingBadge />}
              </button>
            </div>
          ))}
        </div>,
          document.body,
        )}
    </>
  );
}
