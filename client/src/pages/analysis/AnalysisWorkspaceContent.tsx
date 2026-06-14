import { FileStack } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { AnalysisChartsSkeleton } from "@/pages/analysis/AnalysisChartsSkeleton";
import { AnalysisChartsSection } from "@/pages/analysis/AnalysisChartsSection";
import { AnalysisComparisonSection } from "@/pages/analysis/AnalysisComparisonSection";
import { AnalysisDataQualitySection } from "@/pages/analysis/AnalysisDataQualitySection";
import { AnalysisDetailsSection } from "@/pages/analysis/AnalysisDetailsSection";
import { AnalysisSectionFallback } from "@/pages/analysis/AnalysisSectionFallback";
import { AnalysisSummarySection } from "@/pages/analysis/AnalysisSummarySection";
import type { useAnalysisDataState } from "@/pages/analysis/useAnalysisDataState";
import { useDeferredAnalysisSectionMount } from "@/pages/analysis/useDeferredAnalysisSectionMount";
import type { useAnalysisDisplayState } from "@/pages/analysis/useAnalysisDisplayState";
import type { AnalysisWorkspaceSection } from "@/pages/analysis/analysis-workspace";

type AnalysisDataState = ReturnType<typeof useAnalysisDataState>;
type AnalysisDisplayState = ReturnType<typeof useAnalysisDisplayState>;

type AnalysisWorkspaceContentProps = {
  activeSection: AnalysisWorkspaceSection;
  dataState: AnalysisDataState;
  deferSecondarySections: boolean;
  displayState: AnalysisDisplayState;
};

function CompareUnavailable({
  reason,
  onAction,
}: {
  reason: "single-scope" | "insufficient-files";
  onAction: () => void;
}) {
  const singleScope = reason === "single-scope";

  return (
    <OperationalSectionCard
      title="Compare Saved Files"
      description={
        singleScope
          ? "File comparison is available when Analysis is using the combined saved-file scope."
          : "At least two saved files are required before a comparison can be prepared."
      }
      contentClassName="flex min-h-48 flex-col items-center justify-center gap-3 text-center"
    >
      <FileStack className="h-8 w-8 text-muted-foreground" />
      <p className="max-w-md text-sm text-muted-foreground">
        {singleScope
          ? "Switch to all saved files to choose a baseline and review row, quality, and schema differences."
          : "Save another import, then return here to compare its structure and quality with the existing file."}
      </p>
      <Button type="button" onClick={onAction}>
        {singleScope ? "Analyze All Files" : "Go to Saved Files"}
      </Button>
    </OperationalSectionCard>
  );
}

export function AnalysisWorkspaceContent({
  activeSection,
  dataState,
  deferSecondarySections,
  displayState,
}: AnalysisWorkspaceContentProps) {
  const trendsSection = useDeferredAnalysisSectionMount({
    enabled: deferSecondarySections,
    rootMargin: "220px 0px",
    timeoutMs: 900,
  });
  const issuesSection = useDeferredAnalysisSectionMount({
    enabled: deferSecondarySections,
    rootMargin: "420px 0px",
    timeoutMs: 1500,
  });
  const analysis = dataState.analysis;
  if (!analysis) return null;

  if (activeSection === "overview") {
    return (
      <div data-testid="analysis-workspace-overview">
        <AnalysisSummarySection snapshotItems={displayState.snapshotItems} />
      </div>
    );
  }

  if (activeSection === "quality") {
    return (
      <div data-testid="analysis-workspace-quality">
        <AnalysisDataQualitySection
          analysis={analysis}
          mode={dataState.mode}
          onInspectColumn={(focusColumn) =>
            dataState.handleInspectInViewer({ focusColumn })}
        />
      </div>
    );
  }

  if (activeSection === "compare") {
    const canCompare =
      dataState.mode === "all" &&
      Boolean(dataState.allResult && dataState.allResult.imports.length >= 2);

    return (
      <div data-testid="analysis-workspace-compare">
        {canCompare && dataState.allResult ? (
          <AnalysisComparisonSection allResult={dataState.allResult} />
        ) : (
          <CompareUnavailable
            reason={
              dataState.mode === "single"
                ? "single-scope"
                : "insufficient-files"
            }
            onAction={
              dataState.mode === "single"
                ? dataState.handleReset
                : dataState.handleBackToSaved
            }
          />
        )}
      </div>
    );
  }

  if (activeSection === "trends") {
    return (
      <div ref={trendsSection.triggerRef} data-testid="analysis-workspace-trends">
        {trendsSection.shouldRender ? (
          <AnalysisChartsSection
            categoryBarData={displayState.categoryBarData}
            genderPieData={displayState.genderPieData}
          />
        ) : (
          <AnalysisChartsSkeleton />
        )}
      </div>
    );
  }

  return (
    <div ref={issuesSection.triggerRef} data-testid="analysis-workspace-issues">
      {issuesSection.shouldRender ? (
        <AnalysisDetailsSection
          analysis={analysis}
          mode={dataState.mode}
          allResult={dataState.allResult}
          onInspectDuplicate={
            dataState.mode === "single"
              ? (search) => dataState.handleInspectInViewer({ search })
              : null
          }
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
      ) : (
        <AnalysisSectionFallback label="Loading issue details..." />
      )}
    </div>
  );
}
