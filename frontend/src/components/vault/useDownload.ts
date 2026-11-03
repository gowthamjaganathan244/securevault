"use client";

import { useCallback, useState } from "react";
import { requestDownload } from "@/lib/api";
import { useSession } from "@/lib/session";
import { auditResource } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import type { VaultFile } from "@/lib/types";

/**
 * Requests a short-lived presigned link and opens it. The link is handed
 * straight to the browser and never rendered, copied or cached.
 */
export function useDownload() {
  const { email, role } = useSession();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const download = useCallback(
    async (file: VaultFile) => {
      setBusyId(file.fileId);
      const outcome = await requestDownload(file.fileId, email, role);
      setBusyId(null);
      // Both granted and denied attempts are written to the audit log by the API.
      void auditResource.load();

      if (!outcome.ok) {
        toast({ tone: "danger", title: "Download not available", body: outcome.reason });
        return;
      }
      // "noopener" would make window.open return null, so detach the opener manually.
      const opened = window.open(outcome.url, "_blank");
      if (opened) opened.opener = null;
      if (!opened) {
        // Some browsers drop popups after an await; offer a direct click instead.
        const url = outcome.url;
        toast({
          tone: "info",
          title: "Your secure link is ready",
          body: "It expires shortly.",
          action: { label: "Open download", onClick: () => window.open(url, "_blank", "noopener,noreferrer") },
        });
      } else {
        toast({ tone: "success", title: "Download started", body: file.fileName });
      }
    },
    [email, role, toast],
  );

  return { download, busyId };
}
