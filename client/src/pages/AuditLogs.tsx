import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAuditLogs, getAuditLogStats, cleanupAuditLogs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AuditLogsCleanupPanel } from "@/pages/audit-logs/AuditLogsCleanupPanel";
import { AuditLogsFiltersPanel } from "@/pages/audit-logs/AuditLogsFiltersPanel";
import { AuditLogsRecordsList } from "@/pages/audit-logs/AuditLogsRecordsList";
import type { AuditLogRecord, AuditLogsResponse, AuditLogStats } from "@/pages/audit-logs/types";
import {
  exportAuditLogsToCsv,
  exportAuditLogsToPdf,
  getAuditDateRange,
  getLogsToDeleteCount,
} from "@/pages/audit-logs/utils";
import { resolveAuditLogsExportBlockReason } from "@/pages/audit-logs/export-guards";

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const exportInFlightRef = useRef(false);
  const { toast } = useToast();
  const deferredSearchText = useDeferredValue(searchText.trim());

  const fetchStats = useCallback(async () => {
    try {
      const response = await getAuditLogStats();
      setStats(response);
    } catch (error) {
      console.error("Failed to fetch audit log stats:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const dateRange = getAuditDateRange(datePreset, dateFrom, dateTo);
        const response = await getAuditLogs({
          page,
          pageSize,
          action: actionFilter === "all" ? undefined : actionFilter,
          performedBy: performedByFilter.trim() || undefined,
          targetUser: targetUserFilter.trim() || undefined,
          search: deferredSearchText || undefined,
          dateFrom: dateRange.from ? dateRange.from.toISOString() : undefined,
          dateTo: dateRange.to ? dateRange.to.toISOString() : undefined,
          sortBy: "newest",
        }) as AuditLogsResponse;
        if (cancelled) return;

        const items = Array.isArray(response?.logs) ? response.logs : [];
        setLogs(items);
        setPagination({
          page: Math.max(1, Number(response?.pagination?.page || page)),
          pageSize: Math.max(1, Number(response?.pagination?.pageSize || pageSize)),
          total: Math.max(0, Number(response?.pagination?.total || items.length)),
          totalPages: Math.max(1, Number(response?.pagination?.totalPages || 1)),
        });
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to fetch audit logs:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    actionFilter,
    dateFrom,
    datePreset,
    dateTo,
    deferredSearchText,
    page,
    pageSize,
    performedByFilter,
    refreshNonce,
    targetUserFilter,
  ]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const filteredLogs = logs;

  const clearAllFilters = useCallback(() => {
    setSearchText("");
    setPerformedByFilter("");
    setTargetUserFilter("");
    setActionFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }, []);

  const hasActiveFilters =
    Boolean(searchText) ||
    Boolean(performedByFilter) ||
    Boolean(targetUserFilter) ||
    actionFilter !== "all" ||
    datePreset !== "all";

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

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
      setPage(1);
      setRefreshNonce((value) => value + 1);
      await fetchStats();
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
    const blockReason = resolveAuditLogsExportBlockReason({
      logsLength: filteredLogs.length,
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
      await exportAuditLogsToPdf(filteredLogs);
    } catch (error: unknown) {
      console.error("Failed to export PDF:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export PDF",
        variant: "destructive",
      });
    } finally {
      exportInFlightRef.current = false;
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
                  disabled={exportingPdf}
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
            onClick={() => setRefreshNonce((value) => value + 1)}
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
        onActionFilterChange={(value) => {
          setActionFilter(value);
          setPage(1);
        }}
        onClearFilters={clearAllFilters}
        onDateFromChange={(value) => {
          setDateFrom(value);
          setPage(1);
        }}
        onDatePresetChange={(value) => {
          setDatePreset(value);
          if (value !== "custom") {
            setDateFrom("");
            setDateTo("");
          }
          setPage(1);
        }}
        onDateToChange={(value) => {
          setDateTo(value);
          setPage(1);
        }}
        onFiltersOpenChange={setFiltersOpen}
        onPerformedByFilterChange={(value) => {
          setPerformedByFilter(value);
          setPage(1);
        }}
        onSearchTextChange={(value) => {
          setSearchText(value);
          setPage(1);
        }}
        onTargetUserFilterChange={(value) => {
          setTargetUserFilter(value);
          setPage(1);
        }}
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
        onClearFilters={clearAllFilters}
        onRecordsOpenChange={setRecordsOpen}
        recordsOpen={recordsOpen}
        totalLogs={pagination.total}
      />

      <AppPaginationBar
        disabled={loading}
        page={pagination.page}
        totalPages={pagination.totalPages}
        pageSize={pagination.pageSize}
        totalItems={pagination.total}
        itemLabel="audit logs"
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />
    </div>
  );
}
