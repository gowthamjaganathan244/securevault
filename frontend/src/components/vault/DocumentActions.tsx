"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, FilePen, Loader2, Replace, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteFile, integrations, pendingEndpoints, putToS3, requestReplaceUrl, updateMetadata } from "@/lib/api";
import { useSession } from "@/lib/session";
import { filesResource } from "@/lib/store";
import { formatBytes } from "@/lib/format";
import { handOffRetry } from "@/lib/handoff";
import { classificationCopy, classifications, fileKind, kindLabel, uploadState, validateUpload, ACCEPTED_EXTENSIONS } from "@/lib/vault";
import type { ClassificationLevel, VaultFile } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Dialog, PendingIntegration } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ClassificationTag, FileGlyph, classificationHex, classificationStyle } from "./tags";

type Kind = "delete" | "replace" | "edit";
type Phase = { k: "idle" } | { k: "working" } | { k: "error"; message: string };

const ActionsContext = createContext<{ open: (kind: Kind, file: VaultFile) => void; retry: (file: VaultFile) => void }>({
  open: () => {},
  retry: () => {},
});
export const useDocumentActions = () => useContext(ActionsContext);

export function DocumentActionsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState<{ kind: Kind; file: VaultFile } | null>(null);

  const open = useCallback((kind: Kind, file: VaultFile) => setActive({ kind, file }), []);
  // Re-upload uses the existing, working upload flow: it creates a new verified record.
  const retry = useCallback(
    (file: VaultFile) => {
      handOffRetry({ fileId: file.fileId, fileName: file.fileName, classification: file.classification, auditNote: file.auditNote });
      router.push("/upload");
    },
    [router],
  );
  const value = useMemo(() => ({ open, retry }), [open, retry]);
  const close = () => setActive(null);

  return (
    <ActionsContext.Provider value={value}>
      {children}
      {active?.kind === "delete" && <DeleteDialog file={active.file} onClose={close} />}
      {active?.kind === "replace" && <ReplaceDialog file={active.file} onClose={close} />}
      {active?.kind === "edit" && <EditMetadataDialog file={active.file} onClose={close} />}
    </ActionsContext.Provider>
  );
}

function FileSummary({ file, label }: { file: { name: string; type?: string; size?: number; level?: ClassificationLevel }; label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
      <FileGlyph name={file.name} contentType={file.type} />
      <div className="min-w-0 flex-1">
        {label && <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>}
        <p className="truncate text-[13.5px] text-foreground" title={file.name}>
          {file.name}
        </p>
        <p className="text-[12px] text-ink-3">
          {kindLabel[fileKind(file.name, file.type)]} · {formatBytes(file.size)}
        </p>
      </div>
      {file.level && <ClassificationTag level={file.level} compact />}
    </div>
  );
}

function useRun(onDone: () => void) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const toast = useToast();
  const run = async (fn: () => Promise<void>, success: string) => {
    setPhase({ k: "working" });
    try {
      await fn();
      await filesResource.load();
      toast({ tone: "success", title: success });
      onDone();
    } catch (err) {
      setPhase({ k: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };
  return { phase, run };
}

/* ── Delete ─────────────────────────────────────────────── */

function DeleteDialog({ file, onClose }: { file: VaultFile; onClose: () => void }) {
  const { email, role } = useSession();
  const { phase, run } = useRun(onClose);
  const connected = integrations.deleteFile;
  const working = phase.k === "working";

  return (
    <Dialog
      tone="danger"
      icon={<Trash2 />}
      title="Delete this document?"
      description="This permanently removes it from the vault."
      onClose={onClose}
      busy={working}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={working} data-autofocus>
            Cancel
          </Button>
          <Button
            size="lg"
            className="bg-danger text-white hover:bg-[#f43f5e]"
            disabled={!connected || working}
            onClick={() => run(() => deleteFile(file.fileId, email, role), `Deleted ${file.fileName}`)}
          >
            {working ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {working ? "Deleting…" : "Confirm delete"}
          </Button>
        </>
      }
    >
      <FileSummary file={{ name: file.fileName, type: file.contentType, size: file.objectSize, level: file.classification }} />
      <ul className="mt-4 space-y-1.5 text-[12.5px] text-ink-2">
        <li className="flex gap-2">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-danger" aria-hidden />
          The file is removed from the private S3 bucket and can&apos;t be downloaded again.
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-danger" aria-hidden />
          Its record disappears from Explorer for everyone.
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
          The audit trail keeps a record of the deletion and past access.
        </li>
      </ul>
      {phase.k === "error" && (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-4">
          {phase.message}
        </Notice>
      )}
      {!connected && <PendingIntegration action="Deletion" endpoint={pendingEndpoints.deleteFile} />}
    </Dialog>
  );
}

/* ── Replace ────────────────────────────────────────────── */

function ReplaceDialog({ file, onClose }: { file: VaultFile; onClose: () => void }) {
  const { email, role } = useSession();
  const { phase, run } = useRun(onClose);
  const [next, setNext] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const connected = integrations.replaceFile;
  const working = phase.k === "working";
  const problem = next ? validateUpload(next) : null;

  return (
    <Dialog
      icon={<Replace />}
      title="Replace file"
      description="Upload a new version of this document. Its ID, privacy level and history stay the same."
      onClose={onClose}
      busy={working}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!connected || !next || !!problem || working}
            onClick={() =>
              next &&
              run(async () => {
                const ticket = await requestReplaceUrl(file.fileId, { file: next, userEmail: email, userRole: role });
                await putToS3(ticket.uploadUrl, next, () => {});
              }, `Replacement uploaded — waiting for S3 to confirm`)
            }
          >
            {working ? <Loader2 className="animate-spin" /> : <Replace />}
            {working ? "Uploading…" : "Confirm replacement"}
          </Button>
        </>
      }
    >
      <FileSummary label="Current" file={{ name: file.fileName, type: file.contentType, size: file.objectSize, level: file.classification }} />
      <div className="my-2 flex justify-center text-ink-3" aria-hidden>
        <ArrowRight className="size-4 rotate-90" />
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setNext(f);
          e.target.value = "";
        }}
      />
      {next ? (
        <div>
          <FileSummary label="Replacement" file={{ name: next.name, type: next.type, size: next.size, level: file.classification }} />
          <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
            <span className={cn(problem ? "text-danger" : "text-success")}>{problem ?? "Ready — keeps the current privacy level"}</span>
            <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-primary-hi hover:text-white">
              Choose another
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-autofocus
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setNext(f);
          }}
          className={cn(
            "flex w-full flex-col items-center rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-primary bg-primary/[0.08]" : "border-line-strong hover:border-primary/50 hover:bg-primary/[0.04]",
          )}
        >
          <Upload className="mb-2 size-5 text-primary-hi" aria-hidden />
          <span className="text-[13.5px] font-medium">Drop the replacement here</span>
          <span className="mt-0.5 text-[12px] text-ink-3">or choose a file · PDF, Word, Excel or ZIP · up to 500 MB</span>
        </button>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
        Safe by design: the new file is uploaded beside the original and only becomes current after S3 confirms it. The original is
        never overwritten before then.
      </p>
      {phase.k === "error" && (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-4">
          {phase.message}
        </Notice>
      )}
      {!connected && <PendingIntegration action="Replacement" endpoint={pendingEndpoints.replaceFile} />}
    </Dialog>
  );
}

/* ── Edit metadata ──────────────────────────────────────── */

function EditMetadataDialog({ file, onClose }: { file: VaultFile; onClose: () => void }) {
  const { email, role } = useSession();
  const { phase, run } = useRun(onClose);
  const [level, setLevel] = useState<ClassificationLevel>(file.classification);
  const [note, setNote] = useState(file.auditNote ?? "");
  const connected = integrations.updateMetadata;
  const working = phase.k === "working";
  const changed = level !== file.classification || note.trim() !== (file.auditNote ?? "").trim();
  const tooLong = note.length > 280;
  const lowering = classifications.indexOf(level) < classifications.indexOf(file.classification);

  return (
    <Dialog
      icon={<FilePen />}
      title="Edit details"
      description={file.fileName}
      onClose={onClose}
      busy={working}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!connected || !changed || tooLong || working}
            onClick={() =>
              run(async () => {
                await updateMetadata(file.fileId, { classification: level, auditNote: note.trim(), userEmail: email, userRole: role });
              }, "Details saved")
            }
          >
            {working ? <Loader2 className="animate-spin" /> : null}
            {working ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="text-[12.5px] font-medium text-ink-2">Privacy level</legend>
        <div role="radiogroup" aria-label="Privacy level" className="mt-2 grid grid-cols-2 gap-1.5">
          {classifications.map((c) => {
            const on = c === level;
            const Icon = classificationStyle[c].icon;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                data-autofocus={on || undefined}
                onClick={() => setLevel(c)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-[border-color,background-color]",
                  on ? "bg-white/[0.05]" : "border-line hover:border-line-strong",
                )}
                style={on ? { borderColor: `${classificationHex[c]}80` } : undefined}
              >
                <Icon className={cn("size-3.5", classificationStyle[c].text)} aria-hidden />
                <span className="flex-1 font-medium">{c}</span>
                {c === file.classification && <span className="text-[10.5px] text-ink-3">current</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-ink-3">{classificationCopy[level].summary}</p>
        {lowering && <p className="mt-1 text-[12px] text-warning">Lowering the privacy level widens who it&apos;s intended for.</p>}
      </fieldset>

      <label className="mt-4 block">
        <span className="flex items-center justify-between text-[12.5px] font-medium text-ink-2">
          Audit note
          <span className={cn("tabular text-[11.5px] font-normal", tooLong ? "text-danger" : "text-ink-3")}>{note.length}/280</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Why does this document exist?"
          aria-invalid={tooLong}
          className="mt-1.5 w-full resize-none rounded-xl border border-line-strong bg-white/[0.03] px-3 py-2.5 text-[13.5px] outline-none transition-[border-color,box-shadow] focus:border-primary/60 focus:shadow-[0_0_0_4px_rgba(52,121,237,0.18)] focus-visible:outline-none"
        />
      </label>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Requires Admin, or the document&apos;s owner. The change is recorded in the audit trail.
        {uploadState(file) !== "stored" && " This upload isn't confirmed by S3 yet."}
      </p>
      {phase.k === "error" && (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-4">
          {phase.message}
        </Notice>
      )}
      {!connected && <PendingIntegration action="Saving metadata" endpoint={pendingEndpoints.updateMetadata} />}
    </Dialog>
  );
}
