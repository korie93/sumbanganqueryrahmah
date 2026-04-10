import {
  AlertTriangle,
} from "lucide-react";
import { OperationalPage, OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { isMobileViewportWidth } from "@/lib/responsive";
import { AnalysisLoadingSkeleton } from "@/pages/analysis/AnalysisLoadingSkeleton";
import { AnalysisChartsSection } from "@/pages/analysis/AnalysisChartsSection";
import { AnalysisDetailsSection } from "@/pages/analysis/AnalysisDetailsSection";
import { AnalysisHeader } from "@/pages/analysis/AnalysisHeader";
import { AnalysisSummarySection } from "@/pages/analysis/AnalysisSummarySection";
import { useAnalysisDataState } from "@/pages/analysis/useAnalysisDataState";
import { useAnalysisDisplayState } from "@/pages/analysis/useAnalysisDisplayState";
import { useDeferredAnalysisSectionMount } from "@/pages/analysis/useDeferredAnalysisSectionMount";
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
  const chartsSection = useDeferredAnalysisSectionMount({
    enabled: shouldDeferSecondaryMobileSections,
    rootMargin: "220px 0px",
    timeoutMs: 900,
  });
  const detailsSection = useDeferredAnalysisSectionMount({
    enabled: shouldDeferSecondaryMobileSections,
    rootMargin: "420px 0px",
    timeoutMs: 1500,
  });

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
          <>
            <AnalysisSummarySection snapshotItems={displayState.snapshotItems} />
            <AnalysisChartsSection
              section={chartsSection}
              categoryBarData={displayState.categoryBarData}
              genderPieData={displayState.genderPieData}
            />
            <AnalysisDetailsSection
              section={detailsSection}
              analysis={dataState.analysis}
              mode={dataState.mode}
              allResult={dataState.allResult}
              displayState={{
                copiedItems: displayState.copiedItems,
                expandedSections: displayState.expandedSections,
                specialIdPagedSections: displayState.specialIdPagedSections,
                filesPaged: displayState.filesPaged,
                duplicatesPaged: displayState.duplicatesPaged,
                filesListOpen: displayState.filesListOpen,
                duplicatesOpen: displayState.duplicatesOpen,
                setFilesListOpen: displayState.setFilesListOpen,
                setDuplicatesOpen: displayState.setDuplicatesOpen,
                setPage: displayState.setPage,
                toggleSection: displayState.toggleSection,
                copyToClipboard: displayState.copyToClipboard,
                copyAllToClipboard: displayState.copyAllToClipboard,
              }}
            />
          </>
        ) : null}
      </div>
    </OperationalPage>
  );
}
