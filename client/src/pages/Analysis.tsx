import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, FileStack, Plane, RefreshCw, RotateCcw, Shield, Users } from "lucide-react";
import {
  OperationalMetric,
  OperationalPage,
  OperationalPageHeader,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyzeAll, analyzeImport } from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { AnalysisCategoryCard } from "@/pages/analysis/AnalysisCategoryCard";
import { AnalysisChartsSkeleton } from "@/pages/analysis/AnalysisChartsSkeleton";
import { AnalysisLoadingSkeleton } from "@/pages/analysis/AnalysisLoadingSkeleton";
import {
  buildAnalysisHeaderDescription,
  buildAnalysisSnapshotItems,
} from "@/pages/analysis/analysis-shell-utils";
import type { AllAnalysisResult, AnalysisData, AnalysisMode, AnalysisProps, SingleAnalysisResult } from "@/pages/analysis/types";
import { getCategoryBarData, getGenderPieData, getPaginatedItems, TABLE_PAGE_SIZE } from "@/pages/analysis/utils";

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

type DeferredAnalysisSectionOptions = {
  enabled: boolean;
  rootMargin?: string;
  timeoutMs?: number;
};

function useDeferredAnalysisSectionMount({
  enabled,
  rootMargin = "320px 0px",
  timeoutMs = 1400,
}: DeferredAnalysisSectionOptions) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(() => !enabled);

  useEffect(() => {
    if (!enabled) {
      setShouldRender(true);
      return;
    }

    if (shouldRender) {
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let timeoutHandle: number | null = null;

    const markReady = () => {
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setShouldRender(true);
      });
    };

    if (typeof window.IntersectionObserver === "function" && triggerRef.current) {
      observer = new window.IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }

          observer?.disconnect();
          observer = null;
          markReady();
        },
        {
          rootMargin,
        },
      );
      observer.observe(triggerRef.current);
    } else {
      timeoutHandle = window.setTimeout(markReady, timeoutMs);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [enabled, rootMargin, shouldRender, timeoutMs]);

  return { shouldRender, triggerRef };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function Analysis({ onNavigate }: AnalysisProps) {
  const isMobile = useIsMobile();
  const shouldDeferSecondaryMobileSections =
    isMobile || (typeof window !== "undefined" && window.innerWidth < 768);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("single");
  const [singleResult, setSingleResult] = useState<SingleAnalysisResult | null>(null);
  const [allResult, setAllResult] = useState<AllAnalysisResult | null>(null);
  const [importName, setImportName] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [duplicatesOpen, setDuplicatesOpen] = useState(true);
  const [filesListOpen, setFilesListOpen] = useState(true);
  const [tablePages, setTablePages] = useState<Record<string, number>>({});
  const copyTimersRef = useRef<number[]>([]);
  const analysisAbortControllerRef = useRef<AbortController | null>(null);
  const analysisRequestIdRef = useRef(0);
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
  const { toast } = useToast();

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const setPage = useCallback((key: string, page: number, totalItems: number) => {
    const maxPage = Math.max(0, Math.ceil(totalItems / TABLE_PAGE_SIZE) - 1);
    const nextPage = Math.max(0, Math.min(maxPage, page));
    setTablePages((previous) => {
      if (previous[key] === nextPage) return previous;
      return { ...previous, [key]: nextPage };
    });
  }, []);

  const fetchAllAnalysis = useCallback(async () => {
    analysisAbortControllerRef.current?.abort();
    const controller = new AbortController();
    analysisAbortControllerRef.current = controller;
    const requestId = ++analysisRequestIdRef.current;
    setLoading(true);
    setError("");
    setMode("all");
    try {
      const data = await analyzeAll({ signal: controller.signal });
      if (requestId !== analysisRequestIdRef.current) {
        return;
      }
      if (data.totalImports === 0) {
        setError("No saved files to analyze. Please import a file first.");
      } else {
        setAllResult(data);
      }
    } catch (fetchError: unknown) {
      if (isAbortError(fetchError) || requestId !== analysisRequestIdRef.current) {
        return;
      }
      setError(fetchError instanceof Error ? fetchError.message : "Failed to analyze data.");
    } finally {
      if (requestId === analysisRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const fetchSingleAnalysis = useCallback(async () => {
    const importId = localStorage.getItem("analysisImportId");
    const name = localStorage.getItem("analysisImportName") || "Data";
    setImportName(name);

    if (!importId) {
      await fetchAllAnalysis();
      return;
    }

    analysisAbortControllerRef.current?.abort();
    const controller = new AbortController();
    analysisAbortControllerRef.current = controller;
    const requestId = ++analysisRequestIdRef.current;
    setLoading(true);
    setError("");
    setMode("single");
    try {
      const data = await analyzeImport(importId, { signal: controller.signal });
      if (requestId !== analysisRequestIdRef.current) {
        return;
      }
      setSingleResult(data);
    } catch (fetchError: unknown) {
      if (isAbortError(fetchError) || requestId !== analysisRequestIdRef.current) {
        return;
      }
      setError(fetchError instanceof Error ? fetchError.message : "Failed to analyze data.");
    } finally {
      if (requestId === analysisRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [fetchAllAnalysis]);

  useEffect(() => {
    void fetchSingleAnalysis();
  }, [fetchSingleAnalysis]);

  useEffect(() => {
    return () => {
      analysisAbortControllerRef.current?.abort();
      copyTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      copyTimersRef.current = [];
    };
  }, []);

  const markCopied = useCallback((key: string) => {
    setCopiedItems((previous) => ({ ...previous, [key]: true }));
    const timerId = window.setTimeout(() => {
      setCopiedItems((previous) => ({ ...previous, [key]: false }));
      copyTimersRef.current = copyTimersRef.current.filter((id) => id !== timerId);
    }, 2000);
    copyTimersRef.current.push(timerId);
  }, []);

  const copyToClipboard = useCallback((text: string, itemKey?: string) => {
    void navigator.clipboard.writeText(text);
    if (itemKey) {
      markCopied(itemKey);
    }
    toast({
      title: "Copied",
      description: "Text has been copied to clipboard.",
    });
  }, [markCopied, toast]);

  const copyAllToClipboard = useCallback((items: string[], sectionKey: string) => {
    void navigator.clipboard.writeText(items.join("\n"));
    markCopied(`all-${sectionKey}`);
    toast({
      title: "Copied",
      description: `${items.length} items have been copied to clipboard.`,
    });
  }, [markCopied, toast]);

  const handleReset = useCallback(() => {
    localStorage.removeItem("analysisImportId");
    localStorage.removeItem("analysisImportName");
    void fetchAllAnalysis();
  }, [fetchAllAnalysis]);

  const analysis: AnalysisData | null = useMemo(() => {
    if (mode === "single" && singleResult) return singleResult.analysis;
    if (mode === "all" && allResult) return allResult.analysis;
    return null;
  }, [allResult, mode, singleResult]);

  const totalRows = useMemo(() => {
    if (mode === "single" && singleResult) return singleResult.totalRows;
    if (mode === "all" && allResult) return allResult.totalRows;
    return 0;
  }, [allResult, mode, singleResult]);

  const genderPieData = useMemo(() => getGenderPieData(analysis), [analysis]);
  const categoryBarData = useMemo(() => getCategoryBarData(analysis), [analysis]);
  const filesPaged = useMemo(
    () => getPaginatedItems("files-list", allResult?.imports || [], tablePages),
    [allResult?.imports, tablePages],
  );
  const duplicatesPaged = useMemo(
    () => getPaginatedItems("duplicates-list", analysis?.duplicates.items || [], tablePages),
    [analysis?.duplicates.items, tablePages],
  );
  const specialIdPagedSections = useMemo(
    () => ({
      polis: getPaginatedItems("polis", analysis?.noPolis.samples || [], tablePages),
      tentera: getPaginatedItems("tentera", analysis?.noTentera.samples || [], tablePages),
      passportMY: getPaginatedItems("passportMY", analysis?.passportMY.samples || [], tablePages),
      passportLN: getPaginatedItems(
        "passportLN",
        analysis?.passportLuarNegara.samples || [],
        tablePages,
      ),
    }),
    [
      analysis?.noPolis.samples,
      analysis?.noTentera.samples,
      analysis?.passportLuarNegara.samples,
      analysis?.passportMY.samples,
      tablePages,
    ],
  );
  const headerDescription = useMemo(
    () => buildAnalysisHeaderDescription({ importName, mode }),
    [importName, mode],
  );
  const snapshotItems = useMemo(
    () =>
      buildAnalysisSnapshotItems({
        allResult,
        analysis,
        mode,
        singleResult,
        totalRows,
      }),
    [allResult, analysis, mode, singleResult, totalRows],
  );

  return (
    <OperationalPage width="content">
      <OperationalPageHeader
        title={<span data-testid="text-analysis-title">Data Analysis</span>}
        eyebrow="Insights"
        description={headerDescription}
        badge={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {mode === "all" ? "All Files" : "Single File"}
            </Badge>
            {mode === "all" && allResult ? (
              <Badge variant="outline" className="rounded-full px-3 py-1" data-testid="badge-total-files">
                <FileStack className="mr-1.5 h-3 w-3" />
                {allResult.totalImports} files
              </Badge>
            ) : null}
            {analysis ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <BarChart3 className="mr-1.5 h-3 w-3" />
                {totalRows.toLocaleString()} rows
              </Badge>
            ) : null}
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => onNavigate("saved")}
              data-testid="button-back"
              className={isMobile ? "w-full" : "w-full sm:w-auto"}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Saved
            </Button>
            {mode === "single" ? (
              <Button variant="outline" onClick={handleReset} data-testid="button-reset" className={isMobile ? "w-full" : "w-full sm:w-auto"}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset (View All)
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                void (mode === "single" ? fetchSingleAnalysis() : fetchAllAnalysis());
              }}
              disabled={loading}
              data-testid="button-refresh"
              className={isMobile ? "w-full" : "w-full sm:w-auto"}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
        className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
      />

      <div className="space-y-4 sm:space-y-6">

        {error ? (
          <OperationalSectionCard
            title="Analysis unavailable"
            description={error}
            className="border-destructive/30 bg-background/90"
            contentClassName="flex flex-col items-center gap-4 py-6 text-center"
          >
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <Button onClick={() => onNavigate("saved")} data-testid="button-go-saved">
              Go to Saved
            </Button>
          </OperationalSectionCard>
        ) : null}

        {loading ? <AnalysisLoadingSkeleton /> : null}

        {!loading && !error && analysis ? (
          <>
            <OperationalSectionCard
              title="Quick Snapshot"
              description="Scope, row volume, duplicate pressure, and special ID totals in the shared admin summary pattern."
              contentClassName="space-y-0"
            >
              <OperationalSummaryStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {snapshotItems.map((item) => (
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
                  <AnalysisCharts categoryBarData={categoryBarData} genderPieData={genderPieData} />
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
                    <AnalysisCategoryCard title="IC Male" icon={Users} category={analysis.icLelaki} colorClass="text-blue-500" onCopySample={copyToClipboard} />
                    <AnalysisCategoryCard title="IC Female" icon={Users} category={analysis.icPerempuan} colorClass="text-pink-500" onCopySample={copyToClipboard} />
                    <AnalysisCategoryCard title="Police No." icon={Shield} category={analysis.noPolis} colorClass="text-yellow-600" onCopySample={copyToClipboard} />
                    <AnalysisCategoryCard title="Military No." icon={Shield} category={analysis.noTentera} colorClass="text-green-600" onCopySample={copyToClipboard} />
                    <AnalysisCategoryCard title="Passport Malaysia" icon={Plane} category={analysis.passportMY} colorClass="text-purple-500" onCopySample={copyToClipboard} />
                    <AnalysisCategoryCard title="Foreign Passport" icon={Plane} category={analysis.passportLuarNegara} colorClass="text-orange-500" onCopySample={copyToClipboard} />
                  </div>

                  {(analysis.noPolis.samples?.length > 0 ||
                    analysis.noTentera.samples?.length > 0 ||
                    analysis.passportMY.samples?.length > 0 ||
                    analysis.passportLuarNegara.samples?.length > 0) ? (
                    <>
                      <h2 className="text-lg font-semibold text-foreground mb-4">Special ID List (Click to view, up to 50 samples)</h2>
                      <Suspense fallback={<AnalysisSectionFallback label="Loading special ID lists..." />}>
                        <div className="space-y-3 mb-8">
                          <AnalysisExpandableSection
                            copiedItems={copiedItems}
                            isExpanded={expandedSections.polis || false}
                            items={analysis.noPolis.samples || []}
                            onCopyAll={copyAllToClipboard}
                            onCopyItem={copyToClipboard}
                            onPageChange={setPage}
                            onToggle={() => toggleSection("polis")}
                            page={specialIdPagedSections.polis.page}
                            pagedItems={specialIdPagedSections.polis.items}
                            sectionKey="polis"
                            start={specialIdPagedSections.polis.start}
                            totalPages={specialIdPagedSections.polis.totalPages}
                            title="Police No."
                            colorClass="text-yellow-600"
                            icon={Shield}
                          />
                          <AnalysisExpandableSection
                            copiedItems={copiedItems}
                            isExpanded={expandedSections.tentera || false}
                            items={analysis.noTentera.samples || []}
                            onCopyAll={copyAllToClipboard}
                            onCopyItem={copyToClipboard}
                            onPageChange={setPage}
                            onToggle={() => toggleSection("tentera")}
                            page={specialIdPagedSections.tentera.page}
                            pagedItems={specialIdPagedSections.tentera.items}
                            sectionKey="tentera"
                            start={specialIdPagedSections.tentera.start}
                            totalPages={specialIdPagedSections.tentera.totalPages}
                            title="Military No."
                            colorClass="text-green-600"
                            icon={Shield}
                          />
                          <AnalysisExpandableSection
                            copiedItems={copiedItems}
                            isExpanded={expandedSections.passportMY || false}
                            items={analysis.passportMY.samples || []}
                            onCopyAll={copyAllToClipboard}
                            onCopyItem={copyToClipboard}
                            onPageChange={setPage}
                            onToggle={() => toggleSection("passportMY")}
                            page={specialIdPagedSections.passportMY.page}
                            pagedItems={specialIdPagedSections.passportMY.items}
                            sectionKey="passportMY"
                            start={specialIdPagedSections.passportMY.start}
                            totalPages={specialIdPagedSections.passportMY.totalPages}
                            title="Passport Malaysia"
                            colorClass="text-purple-500"
                            icon={Plane}
                          />
                          <AnalysisExpandableSection
                            copiedItems={copiedItems}
                            isExpanded={expandedSections.passportLN || false}
                            items={analysis.passportLuarNegara.samples || []}
                            onCopyAll={copyAllToClipboard}
                            onCopyItem={copyToClipboard}
                            onPageChange={setPage}
                            onToggle={() => toggleSection("passportLN")}
                            page={specialIdPagedSections.passportLN.page}
                            pagedItems={specialIdPagedSections.passportLN.items}
                            sectionKey="passportLN"
                            start={specialIdPagedSections.passportLN.start}
                            totalPages={specialIdPagedSections.passportLN.totalPages}
                            title="Foreign Passport"
                            colorClass="text-orange-500"
                            icon={Plane}
                          />
                        </div>
                      </Suspense>
                    </>
                  ) : null}

                  {mode === "all" && allResult ? (
                    <Suspense fallback={<AnalysisSectionFallback label="Loading analyzed files..." />}>
                      <AnalysisFilesList
                        allResult={allResult}
                        filesListOpen={filesListOpen}
                        filesPaged={filesPaged}
                        onFilesListOpenChange={setFilesListOpen}
                        onPageChange={setPage}
                      />
                    </Suspense>
                  ) : null}

                  <Suspense fallback={<AnalysisSectionFallback label="Loading duplicates list..." />}>
                    <AnalysisDuplicatesPanel
                      count={analysis.duplicates.count}
                      duplicates={analysis.duplicates.items}
                      duplicatesOpen={duplicatesOpen}
                      duplicatesPaged={duplicatesPaged}
                      onCopyDuplicate={copyToClipboard}
                      onDuplicatesOpenChange={setDuplicatesOpen}
                      onPageChange={setPage}
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
