import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAuditLogs, getAuditLogStats, cleanupAuditLogs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AuditLogsCleanupPanel } from "@/pages/audit-logs/AuditLogsCleanupPanel";
import { AuditLogsFiltersPanel } from "@/pages/audit-logs/AuditLogsFiltersPanel";
import { AuditLogsRecordsList } from "@/pages/audit-logs/AuditLogsRecordsList";
import type { AuditLogRecord, AuditLogStats } from "@/pages/audit-logs/types";
import {
  exportAuditLogsToCsv,
  exportAuditLogsToPdf,
  filterAuditLogs,
  getLogsToDeleteCount,
} from "@/pages/audit-logs/utils";

export default function AuditLogs() {
  const currentRole = (() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return "";
      const parsed = JSON.parse(raw) as { role?: string };
      return parsed.role || "";
    } catch {
      return "";
    }
  })();

  const canCleanupLogs = currentRole === "superuser";
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(true);
  const [cleanupOpen, setCleanupOpen] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [performedByFilter, setPerformedByFilter] = useState("");
  const [targetUserFilter, setTargetUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cleanupDays, setCleanupDays] = useState("30");
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { toast } = useToast();
  const deferredSearchText = useDeferredValue(searchText.trim());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAuditLogs();
      setLogs(response.logs || []);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await getAuditLogStats();
      setStats(response);
    } catch (error) {
      console.error("Failed to fetch audit log stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const filteredLogs = useMemo(
    () =>
      filterAuditLogs(logs, {
        actionFilter,
        dateFrom,
        datePreset,
        dateTo,
        performedByFilter,
        searchText: deferredSearchText,
        targetUserFilter,
      }),
    [actionFilter, dateFrom, datePreset, dateTo, deferredSearchText, logs, performedByFilter, targetUserFilter],
  );

  const clearAllFilters = useCallback(() => {
    setSearchText("");
    setPerformedByFilter("");
    setTargetUserFilter("");
    setActionFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const hasActiveFilters =
    Boolean(searchText) ||
    Boolean(performedByFilter) ||
    Boolean(targetUserFilter) ||
    actionFilter !== "all" ||
    datePreset !== "all";

  const logsToDeleteCount = useMemo(() => getLogsToDeleteCount(stats, cleanupDays), [cleanupDays, stats]);

  const handleCleanup = async () => {
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
      await Promise.all([fetchLogs(), fetchStats()]);
    } catch (error: unknown) {
      toast({
        title: "Cleanup Failed",
        description: error instanceof Error ? error.message : "Failed to cleanup audit logs.",
        variant: "destructive",
      });
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (filteredLogs.length === 0) return;

    setExportingPdf(true);
    try {
      await exportAuditLogsToPdf(filteredLogs);
    } catch (error: unknown) {
      console.error("Failed to export PDF:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export PDF",
        variant: "destructive",
      });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-audit-logs-title">
              Audit Logs
            </h1>
            <p className="text-sm text-muted-foreground">
              Records of all administrator actions in the system
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={loading || filteredLogs.length === 0 || exportingPdf}
                data-testid="button-export-logs"
              >
                {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48" align="end">
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => exportAuditLogsToCsv(filteredLogs)}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  data-testid="button-export-pdf"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            onClick={fetchLogs}
            disabled={loading}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <AuditLogsFiltersPanel
        actionFilter={actionFilter}
        dateFrom={dateFrom}
        datePreset={datePreset}
        dateTo={dateTo}
        filtersOpen={filtersOpen}
        hasActiveFilters={hasActiveFilters}
        onActionFilterChange={setActionFilter}
        onClearFilters={clearAllFilters}
        onDateFromChange={setDateFrom}
        onDatePresetChange={(value) => {
          setDatePreset(value);
          if (value !== "custom") {
            setDateFrom("");
            setDateTo("");
          }
        }}
        onDateToChange={setDateTo}
        onFiltersOpenChange={setFiltersOpen}
        onPerformedByFilterChange={setPerformedByFilter}
        onSearchTextChange={setSearchText}
        onTargetUserFilterChange={setTargetUserFilter}
        performedByFilter={performedByFilter}
        searchText={searchText}
        targetUserFilter={targetUserFilter}
      />

      <AuditLogsCleanupPanel
        cleanupDays={cleanupDays}
        cleanupDialogOpen={canCleanupLogs && cleanupDialogOpen}
        cleanupLoading={cleanupLoading}
        cleanupOpen={cleanupOpen}
        canCleanupLogs={canCleanupLogs}
        logs={logs}
        logsToDeleteCount={logsToDeleteCount}
        onCleanupDaysChange={setCleanupDays}
        onCleanupDialogOpenChange={setCleanupDialogOpen}
        onCleanupOpenChange={setCleanupOpen}
        onConfirmCleanup={handleCleanup}
        stats={stats}
      />

      <AuditLogsRecordsList
        filteredLogs={filteredLogs}
        loading={loading}
        logs={logs}
        onClearFilters={clearAllFilters}
        onRecordsOpenChange={setRecordsOpen}
        recordsOpen={recordsOpen}
      />
    </div>
  );
}
