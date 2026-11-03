"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export interface CoreItem {
  id: string;
  label: string;
  detail: string;
  href?: string;
  /** Hollow light: present but not yet confirmed. */
  hollow?: boolean;
}

export interface CoreRing {
  key: string;
  label: string;
  color: string;
  items: CoreItem[];
}

const SIZE = 440;
const C = SIZE / 2;

/**
 * The vault as an object: concentric rings orbit a sealed core, the most
 * sensitive ring closest to the centre. Every light is a real record.
 * Rotation pauses while the pointer is over it; reduced motion keeps it still.
 * The SVG is decorative for assistive tech — the same records are reachable
 * as links elsewhere on the page.
 */
export function VaultCore({
  rings,
  newestId,
  idleCaption,
  className,
}: {
  rings: CoreRing[]; // outermost first
  newestId?: string;
  idleCaption: string;
  className?: string;
}) {
  const router = useRouter();
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<{ item: CoreItem; ring: CoreRing } | null>(null);

  const outer = 196;
  const inner = rings.length > 2 ? 72 : 104;
  const step = rings.length > 1 ? (outer - inner) / (rings.length - 1) : 0;

  return (
    <figure className={cn("vault-core relative mx-auto w-full max-w-[380px] select-none", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block aspect-square w-full" aria-hidden>
        <defs>
          <radialGradient id={`${gid}-glow`}>
            <stop offset="0" stopColor="#3b82f6" stopOpacity="0.45" />
            <stop offset="0.45" stopColor="#3b82f6" stopOpacity="0.08" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${gid}-seal`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
        </defs>

        <circle cx={C} cy={C} r={150} fill={`url(#${gid}-glow)`} />

        {rings.map((ring, ri) => {
          const r = outer - ri * step;
          const n = ring.items.length;
          const offset = ri * 37;
          return (
            <g key={ring.key}>
              <circle cx={C} cy={C} r={r} fill="none" stroke="white" strokeOpacity={0.06} />
              <circle
                cx={C}
                cy={C}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeOpacity={hover?.ring.key === ring.key ? 0.45 : 0.14}
                strokeDasharray="1 5"
                className="transition-[stroke-opacity] duration-[220ms]"
              />
              <g
                className="orbit"
                style={{ animationDuration: `${90 + ri * 35}s`, animationDirection: ri % 2 ? "reverse" : "normal" }}
              >
                {ring.items.map((item, i) => {
                  const a = ((i / Math.max(n, 1)) * 360 + offset - 90) * (Math.PI / 180);
                  const x = Math.round((C + r * Math.cos(a)) * 100) / 100;
                  const y = Math.round((C + r * Math.sin(a)) * 100) / 100;
                  const active = hover?.item.id === item.id;
                  return (
                    <g
                      key={item.id}
                      onPointerEnter={() => setHover({ item, ring })}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => item.href && router.push(item.href)}
                      className={item.href ? "cursor-pointer" : undefined}
                    >
                      {item.id === newestId && (
                        <circle cx={x} cy={y} r={7} fill="none" stroke={ring.color} strokeWidth={1.2} className="core-halo" />
                      )}
                      <circle cx={x} cy={y} r={14} fill="transparent" />
                      <circle
                        cx={x}
                        cy={y}
                        r={active ? 6.5 : 4.5}
                        fill={item.hollow ? "#09090b" : ring.color}
                        stroke={ring.color}
                        strokeWidth={item.hollow ? 1.5 : 0}
                        style={{ filter: item.hollow ? undefined : `drop-shadow(0 0 ${active ? 10 : 5}px ${ring.color})` }}
                        className="transition-[r] duration-[160ms]"
                      />
                    </g>
                  );
                })}
              </g>
            </g>
          );
        })}

        {/* The seal */}
        <circle cx={C} cy={C} r={38} fill="#0e0e11" stroke="white" strokeOpacity={0.1} />
        <circle cx={C} cy={C} r={30} fill="none" stroke="#60a5fa" strokeOpacity={0.25} strokeDasharray="2 4" />
        <g transform={`translate(${C - 14} ${C - 14}) scale(0.875)`}>
          <rect width="32" height="32" rx="8" fill={`url(#${gid}-seal)`} />
          <path
            d="M16 6.5 23.5 9.4v6.1c0 4.6-3.1 8.5-7.5 10-4.4-1.5-7.5-5.4-7.5-10V9.4L16 6.5Z"
            fill="rgba(255,255,255,0.14)"
            stroke="white"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="14.2" r="2.1" fill="white" />
          <path d="M15.1 15.6h1.8l.5 4.1h-2.8l.5-4.1Z" fill="white" />
        </g>
      </svg>

      <figcaption className="mt-1 flex h-10 flex-col items-center justify-center text-center" aria-live="off">
        {hover ? (
          <span key={hover.item.id} className="animate-fade-in">
            <span className="block max-w-[340px] truncate text-[13.5px] font-medium text-foreground">{hover.item.label}</span>
            <span className="block text-[12px]" style={{ color: hover.ring.color }}>
              {hover.ring.label} <span className="text-ink-3">· {hover.item.detail}</span>
            </span>
          </span>
        ) : (
          <span className="animate-fade-in text-[12.5px] text-ink-3">{idleCaption}</span>
        )}
      </figcaption>
    </figure>
  );
}
