import { Suspense, lazy } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AuditLogsFiltersPanel } from "@/pages/audit-logs/AuditLogsFiltersPanel";
import { useAuditLogsPageState } from "@/pages/audit-logs/useAuditLogsPageState";

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
  const {
    isMobile,
    filtersOpen,
    setFiltersOpen,
    recordsOpen,
    setRecordsOpen,
    cleanupOpen,
    setCleanupOpen,
    logs,
    stats,
    loading,
    page,
    setPage,
    pagination,
    searchText,
    performedByFilter,
    targetUserFilter,
    actionFilter,
    datePreset,
    dateFrom,
    dateTo,
    hasActiveFilters,
    clearAllFilters,
    refreshNow,
    setSearchText,
    setPerformedByFilter,
    setTargetUserFilter,
    setActionFilter,
    setDatePreset,
    setDateFrom,
    setDateTo,
    handlePageSizeChange,
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
  } = useAuditLogsPageState();

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
                disabled={loading || logs.length === 0 || exportingPdf}
                className="w-full"
                data-testid="button-export-logs"
              >
                {exportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
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
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => void handleExportPdf()}
                  disabled={exportingPdf}
                  data-testid="button-export-pdf"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            onClick={refreshNow}
            disabled={loading}
            className="w-full"
            data-testid="button-refresh-logs"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
        onDatePresetChange={setDatePreset}
        onDateToChange={setDateTo}
        onFiltersOpenChange={setFiltersOpen}
        onPerformedByFilterChange={setPerformedByFilter}
        onSearchTextChange={setSearchText}
        onTargetUserFilterChange={setTargetUserFilter}
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
            onConfirmCleanup={() => void handleCleanup()}
            stats={stats}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={<AuditLogsRecordsFallback />}>
        <AuditLogsRecordsList
          filteredLogs={logs}
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
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}
