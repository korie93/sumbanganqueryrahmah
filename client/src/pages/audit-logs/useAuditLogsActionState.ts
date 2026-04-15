import { useCallback, useMemo, useRef, useState } from "react";
import { cleanupAuditLogs } from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";
import { useToast } from "@/hooks/use-toast";
import { getLogsToDeleteCount } from "@/pages/audit-logs/utils";
import { resolveAuditLogsExportBlockReason } from "@/pages/audit-logs/export-guards";
import type { AuditLogRecord, AuditLogStats } from "@/pages/audit-logs/types";

const loadAuditLogsExportModule = createRetryableModuleLoader<
  typeof import("@/pages/audit-logs/audit-logs-export")
>(() => import("@/pages/audit-logs/audit-logs-export"));

type UseAuditLogsActionStateOptions = {
  currentRole: string | null;
  logs: AuditLogRecord[];
  stats: AuditLogStats | null;
  onRefresh: () => void;
  onFetchStats: () => Promise<void>;
  onResetPage: () => void;
};

export function useAuditLogsActionState({
  currentRole,
  logs,
  stats,
  onRefresh,
  onFetchStats,
  onResetPage,
}: UseAuditLogsActionStateOptions) {
  const canCleanupLogs = currentRole === "superuser";
  const [cleanupDays, setCleanupDays] = useState("30");
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportInFlightRef = useRef(false);
  const { toast } = useToast();

  const logsToDeleteCount = useMemo(
    () => getLogsToDeleteCount(stats, cleanupDays),
    [cleanupDays, stats],
  );

  const handleCleanup = useCallback(async () => {
    const days = Number.parseInt(cleanupDays, 10);
    if (Number.isNaN(days) || days < 1) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid number of days.",
        variant: "destructive",
      });
      return;
    }

    setCleanupLoading(true);
    try {
      const response = await cleanupAuditLogs(days);
      toast({
        title: "Cleanup Complete",
        description: `Deleted ${response.deletedCount} audit log entries older than ${days} days.`,
      });
      setCleanupDialogOpen(false);
      onResetPage();
      onRefresh();
      await onFetchStats();
    } catch (error: unknown) {
      toast({
        title: "Cleanup Failed",
        description: error instanceof Error ? error.message : "Failed to cleanup audit logs.",
        variant: "destructive",
      });
    } finally {
      setCleanupLoading(false);
    }
  }, [cleanupDays, onFetchStats, onRefresh, onResetPage, toast]);

  const handleExportPdf = useCallback(async () => {
    const blockReason = resolveAuditLogsExportBlockReason({
      logsLength: logs.length,
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
      const { exportAuditLogsToPdf } = await loadAuditLogsExportModule();
      await exportAuditLogsToPdf(logs);
    } catch (error: unknown) {
      logClientError("Failed to export audit logs PDF:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export PDF",
        variant: "destructive",
      });
    } finally {
      exportInFlightRef.current = false;
      setExportingPdf(false);
    }
  }, [exportingPdf, logs, toast]);

  const handleExportCsv = useCallback(async () => {
    if (logs.length === 0) {
      return;
    }

    try {
      const { exportAuditLogsToCsv } = await loadAuditLogsExportModule();
      exportAuditLogsToCsv(logs);
    } catch (error: unknown) {
      logClientError("Failed to export audit logs CSV:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export CSV",
        variant: "destructive",
      });
    }
  }, [logs, toast]);

  return {
    canCleanupLogs,
    cleanupDays,
    setCleanupDays,
    cleanupDialogOpen,
    setCleanupDialogOpen,
    cleanupLoading,
    logsToDeleteCount,
    exportingPdf,
    handleCleanup,
    handleExportPdf,
    handleExportCsv,
  };
}
