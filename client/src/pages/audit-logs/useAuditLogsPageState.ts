import { useIsMobile } from "@/hooks/use-mobile";
import { getStoredRole } from "@/lib/auth-session";
import { useAuditLogsActionState } from "@/pages/audit-logs/useAuditLogsActionState";
import { useAuditLogsDataState } from "@/pages/audit-logs/useAuditLogsDataState";
import { useAuditLogsLayoutState } from "@/pages/audit-logs/useAuditLogsLayoutState";

export function useAuditLogsPageState() {
  const isMobile = useIsMobile();
  const currentRole = getStoredRole();
  const {
    filtersOpen,
    setFiltersOpen,
    recordsOpen,
    setRecordsOpen,
    cleanupOpen,
    setCleanupOpen,
  } = useAuditLogsLayoutState(isMobile);
  const dataState = useAuditLogsDataState();
  const actionState = useAuditLogsActionState({
    currentRole,
    logs: dataState.logs,
    stats: dataState.stats,
    onRefresh: dataState.refreshNow,
    onFetchStats: dataState.fetchStats,
    onResetPage: () => dataState.setPage(1),
  });

  return {
    isMobile,
    filtersOpen,
    setFiltersOpen,
    recordsOpen,
    setRecordsOpen,
    cleanupOpen,
    setCleanupOpen,
    ...dataState,
    ...actionState,
  };
}
