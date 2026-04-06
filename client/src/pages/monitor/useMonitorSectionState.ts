import { startTransition, useCallback, useMemo, useState } from "react";
import type { ChaosType } from "@/lib/api";
import {
  resolveInitialMonitorPageState,
  resolveMonitorChaosProfile,
} from "@/pages/monitor/monitor-page-state-utils";

export function useMonitorSectionState() {
  const initialPageState = useMemo(
    () => resolveInitialMonitorPageState(typeof window !== "undefined" ? window.innerWidth : undefined),
    [],
  );
  const [metricsOpen, setMetricsOpen] = useState(() => initialPageState.metricsOpen);
  const [alertsOpen, setAlertsOpen] = useState(() => initialPageState.alertsOpen);
  const [alertHistoryOpen, setAlertHistoryOpen] = useState(false);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertHistoryPage, setAlertHistoryPage] = useState(1);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [chaosType, setChaosType] = useState<ChaosType>("cpu_spike");
  const [chaosMagnitude, setChaosMagnitude] = useState(String(resolveMonitorChaosProfile("cpu_spike").defaultMagnitude));
  const [chaosDurationMs, setChaosDurationMs] = useState(String(resolveMonitorChaosProfile("cpu_spike").defaultDurationMs));
  const [webVitalsOpen, setWebVitalsOpen] = useState(false);
  const [chaosSectionOpen, setChaosSectionOpen] = useState(false);
  const [technicalChartsOpen, setTechnicalChartsOpen] = useState(false);

  const selectedChaosProfile = useMemo(
    () => resolveMonitorChaosProfile(chaosType),
    [chaosType],
  );
  const includeMonitorHistory = metricsOpen || technicalChartsOpen;

  const handleChaosTypeChange = useCallback((nextType: ChaosType) => {
    setChaosType(nextType);
    const profile = resolveMonitorChaosProfile(nextType);
    setChaosMagnitude(String(profile.defaultMagnitude));
    setChaosDurationMs(String(profile.defaultDurationMs));
  }, []);

  const handleWebVitalsToggle = useCallback(() => {
    startTransition(() => {
      setWebVitalsOpen((previous) => !previous);
    });
  }, []);

  return {
    metricsOpen,
    setMetricsOpen,
    alertsOpen,
    setAlertsOpen,
    alertHistoryOpen,
    setAlertHistoryOpen,
    alertsPage,
    setAlertsPage,
    alertHistoryPage,
    setAlertHistoryPage,
    insightsOpen,
    setInsightsOpen,
    chaosType,
    chaosMagnitude,
    setChaosMagnitude,
    chaosDurationMs,
    setChaosDurationMs,
    webVitalsOpen,
    chaosSectionOpen,
    setChaosSectionOpen,
    technicalChartsOpen,
    setTechnicalChartsOpen,
    selectedChaosProfile,
    includeMonitorHistory,
    deferSecondaryMobileSections: initialPageState.deferSecondaryMobileSections,
    handleChaosTypeChange,
    handleWebVitalsToggle,
  };
}
