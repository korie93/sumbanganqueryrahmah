import {
  AlertTriangle,
} from "lucide-react";
import { OperationalPage, OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { isMobileViewportWidth } from "@/lib/responsive";
import { AnalysisLoadingSkeleton } from "@/pages/analysis/AnalysisLoadingSkeleton";
import { AnalysisHeader } from "@/pages/analysis/AnalysisHeader";
import { AnalysisWorkspaceContent } from "@/pages/analysis/AnalysisWorkspaceContent";
import { AnalysisWorkspaceNavigation } from "@/pages/analysis/AnalysisWorkspaceNavigation";
import { useAnalysisDataState } from "@/pages/analysis/useAnalysisDataState";
import { useAnalysisDisplayState } from "@/pages/analysis/useAnalysisDisplayState";
import { useAnalysisWorkspaceNavigation } from "@/pages/analysis/useAnalysisWorkspaceNavigation";
import type { AnalysisProps } from "@/pages/analysis/types";

export default function Analysis(props: AnalysisProps) {
  const { onNavigate } = props;
  const isMobile = useIsMobile();
  const shouldDeferSecondaryMobileSections =
    isMobile || (typeof window !== "undefined" && isMobileViewportWidth(window.innerWidth));

  const dataState = useAnalysisDataState(props);
  const displayState = useAnalysisDisplayState({
    allResult: dataState.allResult,
    analysis: dataState.analysis,
    importName: dataState.importName,
    mode: dataState.mode,
    singleResult: dataState.singleResult,
    totalRows: dataState.totalRows,
  });
  const workspaceNavigation = useAnalysisWorkspaceNavigation();

  return (
    <OperationalPage width="content">
      <AnalysisHeader
        isMobile={isMobile}
        mode={dataState.mode}
        allResult={dataState.allResult}
        analysis={dataState.analysis}
        totalRows={dataState.totalRows}
        headerDescription={displayState.headerDescription}
        loading={dataState.loading}
        onBackToSaved={dataState.handleBackToSaved}
        onReset={dataState.handleReset}
        onRefresh={dataState.handleRefresh}
      />

      <div className="space-y-4 sm:space-y-6">
        {dataState.error ? (
          <OperationalSectionCard
            title="Analysis unavailable"
            description={dataState.error}
            className="border-destructive/30 bg-background/90"
            contentClassName="flex flex-col items-center gap-4 py-6 text-center"
          >
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <Button onClick={() => onNavigate("saved")} data-testid="button-go-saved">
              Go to Saved
            </Button>
          </OperationalSectionCard>
        ) : null}

        {dataState.loading ? <AnalysisLoadingSkeleton /> : null}

        {!dataState.loading && !dataState.error && dataState.analysis ? (
          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start">
            <AnalysisWorkspaceNavigation
              activeSection={workspaceNavigation.activeSection}
              allResult={dataState.allResult}
              analysis={dataState.analysis}
              mode={dataState.mode}
              onSelect={workspaceNavigation.selectSection}
            />
            <section
              className="min-w-0 flex-1"
              aria-label={`${workspaceNavigation.activeSection} analysis section`}
            >
              <AnalysisWorkspaceContent
                activeSection={workspaceNavigation.activeSection}
                dataState={dataState}
                deferSecondarySections={shouldDeferSecondaryMobileSections}
                displayState={displayState}
              />
            </section>
          </div>
        ) : null}
      </div>
    </OperationalPage>
  );
}
