import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAuditLogs, getAuditLogStats, cleanupAuditLogs } from "@/lib/api";
import { getStoredRole } from "@/lib/auth-session";
import { useToast } from "@/hooks/use-toast";
import { AuditLogsFiltersPanel } from "@/pages/audit-logs/AuditLogsFiltersPanel";
import type { AuditLogRecord, AuditLogsResponse, AuditLogStats } from "@/pages/audit-logs/types";
import {
  getAuditDateRange,
  getLogsToDeleteCount,
} from "@/pages/audit-logs/utils";
import { resolveAuditLogsExportBlockReason } from "@/pages/audit-logs/export-guards";

let auditLogsExportModulePromise: Promise<typeof import("@/pages/audit-logs/audit-logs-export")> | null = null;

function loadAuditLogsExportModule() {
  if (!auditLogsExportModulePromise) {
    auditLogsExportModulePromise = import("@/pages/audit-logs/audit-logs-export");
  }

  return auditLogsExportModulePromise;
}

const AuditLogsCleanupPanel = lazy(() =>
  import("@/pages/audit-logs/AuditLogsCleanupPanel").then((module) => ({
    default: module.AuditLogsCleanupPanel,
  })),
);

const AuditLogsRecordsList = lazy(() =>
  import("@/pages/audit-logs/AuditLogsRecordsList").then((module) => ({
    default: module.AuditLogsRecordsList,
  })),
);

function AuditLogsCleanupFallback() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
      Loading cleanup tools...
    </div>
  );
}

function AuditLogsRecordsFallback() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
      Loading activity records...
    </div>
  );
}

export default function AuditLogs() {
  const isMobile = useIsMobile();
  const currentRole = getStoredRole();
  const initialMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;

  const canCleanupLogs = currentRole === "superuser";
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(true);
  const [cleanupOpen, setCleanupOpen] = useState(() => !initialMobileViewport);
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
  const wasMobileRef = useRef(initialMobileViewport);
  const { toast } = useToast();
  const deferredSearchText = useDeferredValue(searchText.trim());

  useEffect(() => {
    if (isMobile === wasMobileRef.current) return;

    if (isMobile) {
      setFiltersOpen(false);
      setCleanupOpen(false);
      setRecordsOpen(true);
    } else {
      setCleanupOpen(true);
      setRecordsOpen(true);
    }

    wasMobileRef.current = isMobile;
  }, [isMobile]);

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
      const { exportAuditLogsToPdf } = await loadAuditLogsExportModule();
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

  const handleExportCsv = async () => {
    if (filteredLogs.length === 0) {
      return;
    }

    try {
      const { exportAuditLogsToCsv } = await loadAuditLogsExportModule();
      exportAuditLogsToCsv(filteredLogs);
    } catch (error: unknown) {
      console.error("Failed to export CSV:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export CSV",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div
        className={`flex flex-col gap-4 border border-border/60 bg-card/60 ${
          isMobile
            ? "rounded-[1.5rem] p-3.5"
            : "rounded-2xl p-4 sm:flex-row sm:items-start sm:justify-between"
        }`}
        data-floating-ai-avoid="true"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className={`bg-primary/10 ${isMobile ? "rounded-lg p-2" : "rounded-xl p-2.5"}`}>
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Insights
            </p>
            <h1 className={`${isMobile ? "mt-1 text-lg" : "text-xl sm:text-2xl"} font-bold`} data-testid="text-audit-logs-title">
              Audit Logs
            </h1>
            <p className={`mt-1 max-w-2xl leading-relaxed text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
              {isMobile
                ? "Review administrator actions and investigate recent activity."
                : "Records of all administrator actions in the system"}
            </p>
          </div>
        </div>

        <div className={`flex w-full gap-2 ${isMobile ? "grid grid-cols-2" : "flex-col sm:w-auto sm:flex-row"}`}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={loading || filteredLogs.length === 0 || exportingPdf}
                className="w-full"
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
                  onClick={() => void handleExportCsv()}
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
            className="w-full"
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

      {canCleanupLogs ? (
        <Suspense fallback={<AuditLogsCleanupFallback />}>
          <AuditLogsCleanupPanel
            cleanupDays={cleanupDays}
            cleanupDialogOpen={cleanupDialogOpen}
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
        </Suspense>
      ) : null}

      <Suspense fallback={<AuditLogsRecordsFallback />}>
        <AuditLogsRecordsList
          filteredLogs={filteredLogs}
          loading={loading}
          onClearFilters={clearAllFilters}
          onRecordsOpenChange={setRecordsOpen}
          recordsOpen={recordsOpen}
          totalLogs={pagination.total}
        />
      </Suspense>

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
