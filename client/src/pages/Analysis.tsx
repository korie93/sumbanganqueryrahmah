import { Suspense, lazy } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  FileStack,
  Plane,
  RefreshCw,
  RotateCcw,
  Shield,
  Users,
} from "lucide-react";
import {
  OperationalMetric,
  OperationalPage,
  OperationalPageHeader,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnalysisCategoryCard } from "@/pages/analysis/AnalysisCategoryCard";
import { AnalysisChartsSkeleton } from "@/pages/analysis/AnalysisChartsSkeleton";
import { AnalysisLoadingSkeleton } from "@/pages/analysis/AnalysisLoadingSkeleton";
import { useAnalysisDataState } from "@/pages/analysis/useAnalysisDataState";
import { useAnalysisDisplayState } from "@/pages/analysis/useAnalysisDisplayState";
import { useDeferredAnalysisSectionMount } from "@/pages/analysis/useDeferredAnalysisSectionMount";
import type { AnalysisProps } from "@/pages/analysis/types";

const AnalysisCharts = lazy(() =>
  import("@/pages/analysis/AnalysisCharts").then((module) => ({ default: module.AnalysisCharts })),
);
const AnalysisExpandableSection = lazy(() =>
  import("@/pages/analysis/AnalysisExpandableSection").then((module) => ({
    default: module.AnalysisExpandableSection,
  })),
);
const AnalysisFilesList = lazy(() =>
  import("@/pages/analysis/AnalysisTables").then((module) => ({
    default: module.AnalysisFilesList,
  })),
);
const AnalysisDuplicatesPanel = lazy(() =>
  import("@/pages/analysis/AnalysisTables").then((module) => ({
    default: module.AnalysisDuplicatesPanel,
  })),
);

function AnalysisSectionFallback({ label }: { label: string }) {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="p-4 text-sm text-muted-foreground">
      <div role="status" aria-live="polite">
        {label}
      </div>
    </OperationalSectionCard>
  );
}

export default function Analysis(props: AnalysisProps) {
  const { onNavigate } = props;
  const isMobile = useIsMobile();
  const shouldDeferSecondaryMobileSections =
    isMobile || (typeof window !== "undefined" && window.innerWidth < 768);

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
      <OperationalPageHeader
        title={<span data-testid="text-analysis-title">Data Analysis</span>}
        eyebrow="Insights"
        description={displayState.headerDescription}
        badge={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {dataState.mode === "all" ? "All Files" : "Single File"}
            </Badge>
            {dataState.mode === "all" && dataState.allResult ? (
              <Badge variant="outline" className="rounded-full px-3 py-1" data-testid="badge-total-files">
                <FileStack className="mr-1.5 h-3 w-3" />
                {dataState.allResult.totalImports} files
              </Badge>
            ) : null}
            {dataState.analysis ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <BarChart3 className="mr-1.5 h-3 w-3" />
                {dataState.totalRows.toLocaleString()} rows
              </Badge>
            ) : null}
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={dataState.handleBackToSaved}
              data-testid="button-back"
              className={isMobile ? "w-full" : "w-full sm:w-auto"}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Saved
            </Button>
            {dataState.mode === "single" ? (
              <Button
                variant="outline"
                onClick={dataState.handleReset}
                data-testid="button-reset"
                className={isMobile ? "w-full" : "w-full sm:w-auto"}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset (View All)
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={dataState.handleRefresh}
              disabled={dataState.loading}
              data-testid="button-refresh"
              className={isMobile ? "w-full" : "w-full sm:w-auto"}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${dataState.loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
        className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
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
            <OperationalSectionCard
              title="Quick Snapshot"
              description="Scope, row volume, duplicate pressure, and special ID totals in the shared admin summary pattern."
              contentClassName="space-y-0"
            >
              <OperationalSummaryStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {displayState.snapshotItems.map((item) => (
                  <OperationalMetric
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    supporting={item.supporting}
                    tone={item.tone}
                  />
                ))}
              </OperationalSummaryStrip>
            </OperationalSectionCard>

            <div ref={chartsSection.triggerRef}>
              {chartsSection.shouldRender ? (
                <Suspense fallback={<AnalysisChartsSkeleton />}>
                  <AnalysisCharts
                    categoryBarData={displayState.categoryBarData}
                    genderPieData={displayState.genderPieData}
                  />
                </Suspense>
              ) : (
                <AnalysisChartsSkeleton />
              )}
            </div>

            <div ref={detailsSection.triggerRef}>
              {detailsSection.shouldRender ? (
                <>
                  <h2 className="text-lg font-semibold text-foreground mb-4">ID Type Detection</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    <AnalysisCategoryCard
                      title="IC Male"
                      icon={Users}
                      category={dataState.analysis.icLelaki}
                      colorClass="text-blue-500"
                      onCopySample={displayState.copyToClipboard}
                    />
                    <AnalysisCategoryCard
                      title="IC Female"
                      icon={Users}
                      category={dataState.analysis.icPerempuan}
                      colorClass="text-pink-500"
                      onCopySample={displayState.copyToClipboard}
                    />
                    <AnalysisCategoryCard
                      title="Police No."
                      icon={Shield}
                      category={dataState.analysis.noPolis}
                      colorClass="text-yellow-600"
                      onCopySample={displayState.copyToClipboard}
                    />
                    <AnalysisCategoryCard
                      title="Military No."
                      icon={Shield}
                      category={dataState.analysis.noTentera}
                      colorClass="text-green-600"
                      onCopySample={displayState.copyToClipboard}
                    />
                    <AnalysisCategoryCard
                      title="Passport Malaysia"
                      icon={Plane}
                      category={dataState.analysis.passportMY}
                      colorClass="text-purple-500"
                      onCopySample={displayState.copyToClipboard}
                    />
                    <AnalysisCategoryCard
                      title="Foreign Passport"
                      icon={Plane}
                      category={dataState.analysis.passportLuarNegara}
                      colorClass="text-orange-500"
                      onCopySample={displayState.copyToClipboard}
                    />
                  </div>

                  {(dataState.analysis.noPolis.samples?.length > 0 ||
                    dataState.analysis.noTentera.samples?.length > 0 ||
                    dataState.analysis.passportMY.samples?.length > 0 ||
                    dataState.analysis.passportLuarNegara.samples?.length > 0) ? (
                    <>
                      <h2 className="text-lg font-semibold text-foreground mb-4">
                        Special ID List (Click to view, up to 50 samples)
                      </h2>
                      <Suspense fallback={<AnalysisSectionFallback label="Loading special ID lists..." />}>
                        <div className="space-y-3 mb-8">
                          <AnalysisExpandableSection
                            copiedItems={displayState.copiedItems}
                            isExpanded={displayState.expandedSections.polis || false}
                            items={dataState.analysis.noPolis.samples || []}
                            onCopyAll={displayState.copyAllToClipboard}
                            onCopyItem={displayState.copyToClipboard}
                            onPageChange={displayState.setPage}
                            onToggle={() => displayState.toggleSection("polis")}
                            page={displayState.specialIdPagedSections.polis.page}
                            pagedItems={displayState.specialIdPagedSections.polis.items}
                            sectionKey="polis"
                            start={displayState.specialIdPagedSections.polis.start}
                            totalPages={displayState.specialIdPagedSections.polis.totalPages}
                            title="Police No."
                            colorClass="text-yellow-600"
                            icon={Shield}
                          />
                          <AnalysisExpandableSection
                            copiedItems={displayState.copiedItems}
                            isExpanded={displayState.expandedSections.tentera || false}
                            items={dataState.analysis.noTentera.samples || []}
                            onCopyAll={displayState.copyAllToClipboard}
                            onCopyItem={displayState.copyToClipboard}
                            onPageChange={displayState.setPage}
                            onToggle={() => displayState.toggleSection("tentera")}
                            page={displayState.specialIdPagedSections.tentera.page}
                            pagedItems={displayState.specialIdPagedSections.tentera.items}
                            sectionKey="tentera"
                            start={displayState.specialIdPagedSections.tentera.start}
                            totalPages={displayState.specialIdPagedSections.tentera.totalPages}
                            title="Military No."
                            colorClass="text-green-600"
                            icon={Shield}
                          />
                          <AnalysisExpandableSection
                            copiedItems={displayState.copiedItems}
                            isExpanded={displayState.expandedSections.passportMY || false}
                            items={dataState.analysis.passportMY.samples || []}
                            onCopyAll={displayState.copyAllToClipboard}
                            onCopyItem={displayState.copyToClipboard}
                            onPageChange={displayState.setPage}
                            onToggle={() => displayState.toggleSection("passportMY")}
                            page={displayState.specialIdPagedSections.passportMY.page}
                            pagedItems={displayState.specialIdPagedSections.passportMY.items}
                            sectionKey="passportMY"
                            start={displayState.specialIdPagedSections.passportMY.start}
                            totalPages={displayState.specialIdPagedSections.passportMY.totalPages}
                            title="Passport Malaysia"
                            colorClass="text-purple-500"
                            icon={Plane}
                          />
                          <AnalysisExpandableSection
                            copiedItems={displayState.copiedItems}
                            isExpanded={displayState.expandedSections.passportLN || false}
                            items={dataState.analysis.passportLuarNegara.samples || []}
                            onCopyAll={displayState.copyAllToClipboard}
                            onCopyItem={displayState.copyToClipboard}
                            onPageChange={displayState.setPage}
                            onToggle={() => displayState.toggleSection("passportLN")}
                            page={displayState.specialIdPagedSections.passportLN.page}
                            pagedItems={displayState.specialIdPagedSections.passportLN.items}
                            sectionKey="passportLN"
                            start={displayState.specialIdPagedSections.passportLN.start}
                            totalPages={displayState.specialIdPagedSections.passportLN.totalPages}
                            title="Foreign Passport"
                            colorClass="text-orange-500"
                            icon={Plane}
                          />
                        </div>
                      </Suspense>
                    </>
                  ) : null}

                  {dataState.mode === "all" && dataState.allResult ? (
                    <Suspense fallback={<AnalysisSectionFallback label="Loading analyzed files..." />}>
                      <AnalysisFilesList
                        allResult={dataState.allResult}
                        filesListOpen={displayState.filesListOpen}
                        filesPaged={displayState.filesPaged}
                        onFilesListOpenChange={displayState.setFilesListOpen}
                        onPageChange={displayState.setPage}
                      />
                    </Suspense>
                  ) : null}

                  <Suspense fallback={<AnalysisSectionFallback label="Loading duplicates list..." />}>
                    <AnalysisDuplicatesPanel
                      count={dataState.analysis.duplicates.count}
                      duplicates={dataState.analysis.duplicates.items}
                      duplicatesOpen={displayState.duplicatesOpen}
                      duplicatesPaged={displayState.duplicatesPaged}
                      onCopyDuplicate={displayState.copyToClipboard}
                      onDuplicatesOpenChange={displayState.setDuplicatesOpen}
                      onPageChange={displayState.setPage}
                    />
                  </Suspense>
                </>
              ) : (
                <AnalysisSectionFallback label="Detailed analysis sections will load as you scroll." />
              )}
            </div>
          </>
        ) : null}
      </div>
    </OperationalPage>
  );
}
