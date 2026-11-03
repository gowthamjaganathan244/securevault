"use client";

import { Lightbulb, ScanText, ShieldAlert } from "lucide-react";
import type { ClassificationLevel } from "@/lib/types";
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

/**
 * Before upload: an honest, name-only hint. The real Textract + Comprehend
 * review and Polly guidance run after S3 confirms the upload (see PrivacyReview).
 */
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
  const isPdf = /\.pdf$/i.test(fileName);

  return (
    <section aria-labelledby="guardian-title" className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
      <h3 id="guardian-title" className="flex items-center gap-2 text-[13px] font-semibold">
        <ShieldAlert className="size-4 text-primary-hi" aria-hidden /> Privacy Guardian
      </h3>

      <div className="mt-3 flex items-start gap-2.5 text-[12.5px]">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        {hint ? (
          <div className="min-w-0 flex-1">
            <p className="text-ink-2">
              The name contains “{hint.word}”, which usually means <ClassificationTag level={hint.level} compact className="mx-0.5 align-middle" />.
            </p>
            <p className="mt-0.5 text-ink-3">Based on the file name only — the contents haven&apos;t been scanned yet.</p>
            {hint.level !== level && (
              <button type="button" onClick={() => onApply(hint.level)} className="mt-1.5 text-[12.5px] font-medium text-primary-hi hover:text-white">
                Use {hint.level}
              </button>
            )}
          </div>
        ) : (
          <p className="text-ink-3">No recommendation from the file name. Choose the level that fits the contents.</p>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2.5 border-t border-line pt-3 text-[12.5px]">
        <ScanText className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
        <p className="text-ink-3">
          {isPdf
            ? "After S3 confirms the upload, Amazon Textract and Comprehend review the document for personal data and recommend a privacy level. Amazon Polly can then read the advice aloud."
            : "The content review (Textract + Comprehend) supports small, single-page English PDFs, so it can't run on this file type."}{" "}
          <span className="text-ink-3/80">
            Amazon Macie runs as a separate one-time batch discovery job, so new uploads aren&apos;t automatically covered by it.
          </span>
        </p>
      </div>
    </section>
  );
}
