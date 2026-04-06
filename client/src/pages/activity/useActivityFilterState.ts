import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityFilters } from "@/lib/api";
import { toggleActivityStatusFilter } from "@/pages/activity/activity-page-state-utils";
import { DEFAULT_ACTIVITY_FILTERS } from "@/pages/activity/types";
import type { ActivityStatus } from "@/pages/activity/types";

export function useActivityFilterState() {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);

  const filtersRef = useRef<ActivityFilters>(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_ACTIVITY_FILTERS);
  }, []);

  const toggleStatusFilter = useCallback((status: ActivityStatus) => {
    setFilters((previous) => toggleActivityStatusFilter(previous, status));
  }, []);

  return {
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    dateFromOpen,
    setDateFromOpen,
    dateToOpen,
    setDateToOpen,
    logsOpen,
    setLogsOpen,
    filtersRef,
    handleClearFilters,
    toggleStatusFilter,
  };
}
