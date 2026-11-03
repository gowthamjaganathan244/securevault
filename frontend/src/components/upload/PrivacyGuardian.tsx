"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { FileSearch, Lightbulb, ScanText, ShieldAlert, Square, Volume2, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { classificationCopy } from "@/lib/vault";
import type { ClassificationLevel } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ClassificationTag } from "@/components/vault/tags";

/** Keyword hints from the file *name* only — the contents are never inspected here. */
const NAME_HINTS: { level: ClassificationLevel; words: string[] }[] = [
  { level: "Restricted", words: ["password", "credential", "secret", "legal", "board", "passport", "tax file", "tfn", "bank", "ssn"] },
  { level: "Confidential", words: ["payslip", "salary", "contract", "medical", "invoice", "resume", "cv", "cover letter", "employment", "offer", "hr"] },
  { level: "Internal", words: ["policy", "minutes", "memo", "internal", "plan", "notes", "roadmap"] },
  { level: "Public", words: ["brochure", "press", "flyer", "public", "announcement"] },
];

export function nameHint(fileName: string) {
  const name = fileName.toLowerCase().replace(/[_\-.]+/g, " ");
  for (const h of NAME_HINTS) {
    const word = h.words.find((w) => new RegExp(`\\b${w}\\b`).test(name));
    if (word) return { level: h.level, word };
  }
  return null;
}

/** Automated content analysis this vault could connect; none is wired to the API today. */
const SERVICES = [
  { name: "Amazon Textract", does: "Reads text from scans and PDFs", icon: ScanText },
  { name: "Amazon Comprehend", does: "Finds personal information such as names, addresses and IDs", icon: FileSearch },
  { name: "Amazon Macie", does: "Discovers sensitive data across the private bucket", icon: ShieldAlert },
  { name: "Amazon Polly", does: "Speaks privacy findings and advice aloud", icon: Waves },
];

const noop = () => () => {};

export function PrivacyGuardian({
  fileName,
  level,
  onApply,
}: {
  fileName: string;
  level: ClassificationLevel;
  onApply: (level: ClassificationLevel) => void;
}) {
  const hint = nameHint(fileName);
  const canSpeak = useSyncExternalStore(noop, () => "speechSynthesis" in window, () => false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const speak = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const c = classificationCopy[level];
    const u = new SpeechSynthesisUtterance(
      `${level}. ${c.summary} ${c.detail} Typical examples: ${c.examples}. You can change this level before uploading.`,
    );
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <section aria-labelledby="guardian-title" className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="guardian-title" className="flex items-center gap-2 text-[13px] font-semibold">
          <ShieldAlert className="size-4 text-primary-hi" aria-hidden /> Privacy Guardian
        </h3>
        {canSpeak && (
          <Button size="sm" variant="ghost" onClick={speak} aria-pressed={speaking}>
            {speaking ? <Square /> : <Volume2 />}
            {speaking ? "Stop" : "Hear privacy advice"}
          </Button>
        )}
      </div>

      {/* Recommendation — honest about its source */}
      <div className="mt-3 flex items-start gap-2.5 text-[12.5px]">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        {hint ? (
          <div className="min-w-0 flex-1">
            <p className="text-ink-2">
              The name contains “{hint.word}”, which usually means <ClassificationTag level={hint.level} compact className="mx-0.5 align-middle" />.
            </p>
            <p className="mt-0.5 text-ink-3">Based on the file name only — the contents haven&apos;t been scanned.</p>
            {hint.level !== level && (
              <button type="button" onClick={() => onApply(hint.level)} className="mt-1.5 text-[12.5px] font-medium text-primary-hi hover:text-white">
                Use {hint.level}
              </button>
            )}
          </div>
        ) : (
          <p className="text-ink-3">No recommendation — nothing in the file name suggests a level. Choose the one that fits the contents.</p>
        )}
      </div>

      {/* Content analysis — prepared, not connected */}
      <div className="mt-4 border-t border-line pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Content analysis</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <li key={s.name} className="flex items-start gap-2 rounded-lg border border-white/[0.05] px-2.5 py-2">
              <s.icon className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[12px] font-medium text-ink-2">
                  {s.name}
                  <span className={cn("rounded px-1.5 py-px text-[10.5px] font-medium", "bg-white/[0.05] text-ink-3")}>Not connected</span>
                </span>
                <span className="block text-[11.5px] leading-snug text-ink-3">{s.does}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[11.5px] text-ink-3">
          No automated findings: content scanning isn&apos;t connected to this vault, so nothing has been analysed.
          {canSpeak && " Spoken advice uses your device's built-in voice, not Amazon Polly."}
        </p>
      </div>
    </section>
  );
}
