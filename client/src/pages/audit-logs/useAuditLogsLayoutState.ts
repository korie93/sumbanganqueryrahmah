import { useEffect, useMemo, useRef, useState } from "react";
import { resolveInitialAuditLogsLayoutState } from "@/pages/audit-logs/audit-log-page-state-utils";

export function useAuditLogsLayoutState(isMobile: boolean) {
  const initialLayoutState = useMemo(
    () => resolveInitialAuditLogsLayoutState(typeof window !== "undefined" ? window.innerWidth : undefined),
    [],
  );
  const [filtersOpen, setFiltersOpen] = useState(initialLayoutState.filtersOpen);
  const [recordsOpen, setRecordsOpen] = useState(initialLayoutState.recordsOpen);
  const [cleanupOpen, setCleanupOpen] = useState(initialLayoutState.cleanupOpen);
  const wasMobileRef = useRef(initialLayoutState.cleanupOpen === false);

  useEffect(() => {
    if (isMobile === wasMobileRef.current) {
      return;
    }

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

  return {
    filtersOpen,
    setFiltersOpen,
    recordsOpen,
    setRecordsOpen,
    cleanupOpen,
    setCleanupOpen,
  };
}
