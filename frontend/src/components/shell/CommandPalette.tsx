"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpFromLine, CornerDownLeft, LogOut, RotateCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { destinationsFor } from "@/lib/access";
import { useSession } from "@/lib/session";
import { auditResource, filesResource, useFiles } from "@/lib/store";
import { sortByRecent, uploadState } from "@/lib/vault";
import { formatFinderDate } from "@/lib/format";
import { ClassificationTag, FileGlyph } from "@/components/vault/tags";
import { Kbd } from "@/components/ui/primitives";

interface Item {
  id: string;
  group: "Documents" | "Go to" | "Actions";
  label: string;
  hint?: ReactNode;
  icon: ReactNode;
  keywords: string;
  run: () => void;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { role, signOut } = useSession();
  const canBrowse = role !== "Auditor";
  const { files } = useFiles(canBrowse);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => previouslyFocused?.focus?.();
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const docs: Item[] = canBrowse
      ? sortByRecent(files).map((f) => ({
          id: `doc:${f.fileId}`,
          group: "Documents",
          label: f.fileName,
          hint: <ClassificationTag level={f.classification} compact />,
          icon: <FileGlyph name={f.fileName} contentType={f.contentType} size="sm" />,
          keywords: `${f.fileName} ${f.uploadedBy ?? ""} ${f.classification} ${uploadState(f)} ${formatFinderDate(f.uploadedAt || f.createdAt)}`.toLowerCase(),
          run: go(`/files?doc=${encodeURIComponent(f.fileId)}`),
        }))
      : [];
    const nav: Item[] = destinationsFor(role).map((d) => {
      const Icon = d.icon;
      return {
        id: `nav:${d.href}`,
        group: "Go to",
        label: d.label,
        hint: <span className="text-ink-3">{d.hint}</span>,
        icon: <Icon className="size-4" />,
        keywords: `${d.label} ${d.hint}`.toLowerCase(),
        run: go(d.href),
      };
    });
    const actions: Item[] = [
      ...(canBrowse
        ? [
            {
              id: "act:upload",
              group: "Actions" as const,
              label: "Upload a document",
              icon: <ArrowUpFromLine className="size-4" />,
              keywords: "upload add new file document",
              run: go("/upload"),
            },
          ]
        : []),
      {
        id: "act:refresh",
        group: "Actions",
        label: "Refresh vault data",
        icon: <RotateCw className="size-4" />,
        keywords: "refresh reload sync",
        run: () => {
          void filesResource.load();
          void auditResource.load();
          onClose();
        },
      },
      {
        id: "act:signout",
        group: "Actions",
        label: "Sign out",
        icon: <LogOut className="size-4" />,
        keywords: "sign out log out logout exit",
        run: () => void signOut(),
      },
    ];

    const q = query.trim().toLowerCase();
    if (!q) return [...docs.slice(0, 5), ...nav, ...actions];
    const terms = q.split(/\s+/);
    const match = (i: Item) => terms.every((t) => i.keywords.includes(t));
    return [...docs.filter(match).slice(0, 8), ...nav.filter(match), ...actions.filter(match)];
  }, [files, canBrowse, role, query, router, onClose, signOut]);

  const active = Math.min(cursor, Math.max(items.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((active + 1) % Math.max(items.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((active - 1 + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh] sm:pt-[16vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search SecureVault"
        className="glass relative w-full max-w-[600px] animate-pop overflow-hidden rounded-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
          <Search className="size-4 shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder={canBrowse ? "Search documents, places and actions" : "Search places and actions"}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            className="h-13 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-none"
          />
          <Kbd className="hidden sm:inline-flex">esc</Kbd>
        </div>

        <div ref={listRef} id={listId} role="listbox" className="max-h-[min(420px,56vh)] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">No matches for “{query}”.</p>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && (
                  <p className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    {header === "Documents" && !query ? "Recent documents" : header}
                  </p>
                )}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => i !== active && setCursor(i)}
                  onClick={item.run}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors duration-[120ms]",
                    i === active ? "bg-primary/[0.18] text-foreground" : "text-ink-2",
                  )}
                >
                  <span className="flex w-5 shrink-0 justify-center text-ink-3">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="hidden shrink-0 text-[12px] sm:inline">{item.hint}</span>}
                  {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-ink-3" aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden items-center gap-4 border-t border-white/[0.07] px-4 py-2 text-[11.5px] text-ink-3 sm:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
        </div>
      </div>
    </div>
  );
}
