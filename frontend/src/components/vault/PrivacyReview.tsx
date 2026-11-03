"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Loader2, ScanText, Square, TriangleAlert, Volume2 } from "lucide-react";
import { getPrivacyVoice, getSecurity, runPrivacyScan, updateMetadata, type PrivacyReview as Review } from "@/lib/api";
import { filesResource } from "@/lib/store";
import { formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { classifications } from "@/lib/vault";
import type { ClassificationLevel } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ClassificationTag } from "./tags";
import { FileMacieCard } from "./MacieResult";

const SERVICES = [
  { name: "Amazon Textract", role: "Text extraction", badge: "Real-time" },
  { name: "Amazon Comprehend", role: "Personal-data detection", badge: "Real-time" },
  { name: "Amazon Polly", role: "Spoken guidance (voice Olivia)", badge: "On demand" },
];

const piiLabel = (t: string) => t.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Real privacy review for one stored document:
 * GET /files/{id}/security → POST …/privacy-scan (Textract + Comprehend) → POST …/privacy-voice (Polly MP3).
 */
export function PrivacyReview({
  fileId,
  classification,
  autoScan,
  canEdit,
  uploadedAt,
}: {
  fileId: string;
  /** When S3 confirmed this version — used to tell whether the one-time Macie job could have seen it. */
  uploadedAt?: string;
  classification: ClassificationLevel;
  /** Run the scan automatically when no review exists yet (used right after an upload). */
  autoScan?: boolean;
  canEdit?: boolean;
}) {
  const toast = useToast();
  const [review, setReview] = useState<Review | null>(null);
  const [phase, setPhase] = useState<"loading" | "idle" | "scanning" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<"idle" | "loading" | "playing">("idle");
  const [applying, setApplying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const autoRan = useRef(false);

  const scan = async () => {
    setPhase("scanning");
    setError(null);
    try {
      const r = await runPrivacyScan(fileId);
      setReview(r.privacyReview);
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The privacy scan failed.");
      setPhase("error");
    }
  };

  useEffect(() => {
    let alive = true;
    getSecurity(fileId)
      .then((r) => {
        if (!alive) return;
        setReview(r.privacyReview);
        setPhase("idle");
        if (!r.privacyReview && autoScan && !autoRan.current) {
          autoRan.current = true;
          void scan();
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Couldn't load the privacy review.");
        setPhase("error");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // Stop audio and release the object URL when leaving.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const playVoice = async () => {
    if (voice === "playing") {
      audioRef.current?.pause();
      setVoice("idle");
      return;
    }
    setVoice("loading");
    try {
      const blob = await getPrivacyVoice(fileId);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      const audio = new Audio(urlRef.current);
      audioRef.current = audio;
      audio.onended = () => setVoice("idle");
      audio.onerror = () => setVoice("idle");
      await audio.play();
      setVoice("playing");
    } catch (e) {
      setVoice("idle");
      toast({ tone: "danger", title: "Spoken guidance unavailable", body: e instanceof Error ? e.message : undefined });
    }
  };

  const recommended = classifications.find((c) => c === review?.recommendedClassification);

  const apply = async () => {
    if (!recommended) return;
    setApplying(true);
    try {
      await updateMetadata(fileId, { classification: recommended });
      await filesResource.load();
      toast({ tone: "success", title: `Privacy level set to ${recommended}` });
    } catch (e) {
      toast({ tone: "danger", title: "Couldn't change the privacy level", body: e instanceof Error ? e.message : undefined });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3 text-[12.5px]">
      {phase === "loading" && (
        <p className="flex items-center gap-2 text-ink-3" role="status">
          <Loader2 className="size-3.5 animate-spin" /> Loading privacy review…
        </p>
      )}

      {phase === "scanning" && (
        <p className="flex items-center gap-2 text-ink-2" role="status">
          <Loader2 className="size-3.5 animate-spin" /> Scanning with Textract and Comprehend…
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 text-danger" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
        </p>
      )}

      {review && phase !== "scanning" && (
        <div className="space-y-2.5 rounded-xl border border-line bg-surface-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn("inline-flex items-center gap-1.5 font-medium", review.status === "COMPLETE" ? "text-success" : "text-warning")}>
              {review.status === "COMPLETE" ? <CircleCheck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
              {review.status === "COMPLETE" ? "Review complete" : "Review required"}
            </span>
            {review.scannedAt && <span className="text-[11px] text-ink-3">{formatFull(review.scannedAt)}</span>}
          </div>
          {recommended && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-3">Recommended</span>
              <ClassificationTag level={recommended} compact />
              {recommended !== classification && canEdit && (
                <button type="button" onClick={apply} disabled={applying} className="font-medium text-primary-hi hover:text-white disabled:opacity-50">
                  {applying ? "Applying…" : `Apply ${recommended}`}
                </button>
              )}
              {recommended === classification && <span className="text-[11.5px] text-ink-3">matches current level</span>}
            </div>
          )}
          <div>
            <p className="text-ink-3">Personal data detected</p>
            {review.piiTypes && review.piiTypes.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {review.piiTypes.map((t) => (
                  <li key={t} className="rounded-md border border-warning/30 bg-warning/[0.08] px-1.5 py-0.5 text-[11.5px] text-warning">
                    {piiLabel(t)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-2">None found in the reviewed text.</p>
            )}
          </div>
          <p className="text-[11px] text-ink-3">
            {review.engine ?? "Textract+Comprehend"}
            {review.reviewedTextCharacters !== undefined && ` · ${review.reviewedTextCharacters.toLocaleString()} characters reviewed`}
            {review.partialTextReview && " · partial review"}
            {" · "}raw personal data isn&apos;t stored
          </p>
        </div>
      )}

      {phase !== "loading" && !review && phase !== "scanning" && !error && (
        <p className="text-ink-3">Not scanned yet. Supports small, single-page English PDFs.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={scan} disabled={phase === "scanning" || phase === "loading"}>
          <ScanText /> {review ? "Scan again" : "Run privacy scan"}
        </Button>
        <Button size="sm" variant="ghost" onClick={playVoice} disabled={!review || voice === "loading"} aria-pressed={voice === "playing"} title={review ? undefined : "Available after a successful scan"}>
          {voice === "loading" ? <Loader2 className="animate-spin" /> : voice === "playing" ? <Square /> : <Volume2 />}
          {voice === "playing" ? "Stop" : "Hear privacy advice"}
        </Button>
      </div>

      <div className="border-t border-line pt-2.5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Amazon Macie · batch discovery</p>
        <FileMacieCard fileId={fileId} uploadedAt={uploadedAt} />
      </div>

      <ul className="grid gap-1 border-t border-line pt-2.5 sm:grid-cols-2">
        {SERVICES.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="min-w-0">
              <span className="text-ink-2">{s.name}</span> <span className="text-ink-3">· {s.role}</span>
            </span>
            <span className={cn("shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium", "bg-success/10 text-success")}>
              {s.badge}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
