import { startTransition, useCallback, useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
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
  const [activeSection, setActiveSection] =
    useState<AnalysisWorkspaceSection>(() =>
      resolveAnalysisWorkspaceSection(location),
    );

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
