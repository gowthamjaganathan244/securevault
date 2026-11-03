"use client";

import Link from "next/link";
import { ChevronLeft, CircleAlert, FileQuestion } from "lucide-react";
import { useFiles } from "@/lib/store";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { EmptyState, Notice, Panel, Skeleton } from "@/components/ui/primitives";
import { DocumentPassport } from "@/components/vault/DocumentPassport";

export function PassportView({ fileId }: { fileId: string }) {
  const { files, loading, error, refresh } = useFiles();
  const file = files.find((f) => f.fileId === fileId);

  return (
    <div className="min-h-full">
      <PageToolbar title="Document passport" />
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
        <Link
          href={`/files?doc=${encodeURIComponent(fileId)}`}
          className="mb-4 inline-flex items-center gap-1 rounded-md text-[13px] text-ink-3 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Explorer
        </Link>

        {error && !file ? (
          <Notice
            tone="danger"
            icon={<CircleAlert />}
            action={
              <Button size="sm" onClick={() => refresh()}>
                Try again
              </Button>
            }
          >
            {error}
          </Notice>
        ) : loading ? (
          <Panel className="space-y-3 p-5">
            <Skeleton className="h-12 w-10" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </Panel>
        ) : !file ? (
          <Panel>
            <EmptyState
              icon={<FileQuestion />}
              title="Document not found"
              action={<ButtonLink href="/files">Open Explorer</ButtonLink>}
            >
              No vault record matches this ID. It may have been removed, or the link is incomplete.
            </EmptyState>
          </Panel>
        ) : (
          <Panel className="animate-rise overflow-hidden">
            <DocumentPassport file={file} variant="page" />
          </Panel>
        )}
      </div>
    </div>
  );
}
