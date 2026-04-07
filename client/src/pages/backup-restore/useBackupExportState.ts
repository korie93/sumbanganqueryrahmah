import { useCallback, useRef, useState } from "react";
import { logClientError } from "@/lib/client-logger";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import type { BackupRecord } from "@/pages/backup-restore/types";
import { resolveBackupsExportBlockReason } from "@/pages/backup-restore/export-guards";

let backupExportModulePromise: Promise<typeof import("@/pages/backup-restore/backup-export")> | null = null;

function loadBackupExportModule() {
  if (!backupExportModulePromise) {
    backupExportModulePromise = import("@/pages/backup-restore/backup-export");
  }

  return backupExportModulePromise;
}

export function useBackupExportState(visibleBackups: BackupRecord[]) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportInFlightRef = useRef(false);
  const { notifyMutationError } = useMutationFeedback();

  const handleExportCsv = useCallback(async () => {
    if (visibleBackups.length === 0) {
      return;
    }

    try {
      const { exportBackupsToCsv } = await loadBackupExportModule();
      exportBackupsToCsv(visibleBackups);
    } catch (error: unknown) {
      logClientError("Failed to export backup CSV:", error);
      notifyMutationError({
        title: "Export Failed",
        error,
        fallbackDescription: error instanceof Error ? error.message : "Failed to export CSV",
      });
    }
  }, [notifyMutationError, visibleBackups]);

  const handleExportPdf = useCallback(async () => {
    const blockReason = resolveBackupsExportBlockReason({
      backupsLength: visibleBackups.length,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) {
      return;
    }
    if (blockReason === "no_data") {
      return;
    }

    exportInFlightRef.current = true;
    setExportingPdf(true);
    try {
      const { exportBackupsToPdf } = await loadBackupExportModule();
      await exportBackupsToPdf(visibleBackups);
    } catch (error: unknown) {
      logClientError("Failed to export backup PDF:", error);
      notifyMutationError({
        title: "Export Failed",
        error,
        fallbackDescription: error instanceof Error ? error.message : "Failed to export PDF",
      });
    } finally {
      exportInFlightRef.current = false;
      setExportingPdf(false);
    }
  }, [exportingPdf, notifyMutationError, visibleBackups]);

  return {
    exportingPdf,
    handleExportCsv,
    handleExportPdf,
  };
}
