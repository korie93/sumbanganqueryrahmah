import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  getBrowserSessionStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
} from "@/lib/browser-storage";
import {
  buildAnalysisWorkspaceLocation,
  isAnalysisWorkspaceSection,
  resolveAnalysisWorkspaceSection,
  type AnalysisWorkspaceSection,
} from "@/pages/analysis/analysis-workspace";

export function useAnalysisWorkspaceNavigation() {
  const [pathname, navigate] = useLocation();
  const search = useSearch();
  const location = `${pathname}${search ? `?${search}` : ""}`;
  const [requestedSection] = useState<AnalysisWorkspaceSection | null>(() => {
    const storage = getBrowserSessionStorage();
    const stored = safeGetStorageItem(storage, "analysisWorkspaceSection");
    safeRemoveStorageItem(storage, "analysisWorkspaceSection");
    return isAnalysisWorkspaceSection(stored) ? stored : null;
  });
  const [activeSection, setActiveSection] =
    useState<AnalysisWorkspaceSection>(() =>
      requestedSection ?? resolveAnalysisWorkspaceSection(location),
    );
  const handoffAppliedRef = useRef(false);

  useEffect(() => {
    if (!requestedSection || handoffAppliedRef.current) return;
    handoffAppliedRef.current = true;
    const nextLocation = buildAnalysisWorkspaceLocation(location, requestedSection);
    if (nextLocation !== location) {
      navigate(nextLocation, { replace: true });
    }
  }, [location, navigate, requestedSection]);

  useEffect(() => {
    const sectionFromLocation =
      resolveAnalysisWorkspaceSection(location);
    setActiveSection((current) =>
      current === sectionFromLocation ? current : sectionFromLocation,
    );
  }, [location]);

  const selectSection = useCallback(
    (section: string) => {
      if (!isAnalysisWorkspaceSection(section)) {
        return;
      }

      const nextLocation = buildAnalysisWorkspaceLocation(
        location,
        section,
      );
      startTransition(() => {
        setActiveSection(section);
        navigate(nextLocation);
      });
    },
    [location, navigate],
  );

  return {
    activeSection,
    selectSection,
  };
}
