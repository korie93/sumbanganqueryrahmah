import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, FileStack, Plane, RefreshCw, RotateCcw, Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyzeAll, analyzeImport } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AnalysisCategoryCard } from "@/pages/analysis/AnalysisCategoryCard";
import { AnalysisChartsSkeleton } from "@/pages/analysis/AnalysisChartsSkeleton";
import { AnalysisExpandableSection } from "@/pages/analysis/AnalysisExpandableSection";
import { AnalysisLoadingSkeleton } from "@/pages/analysis/AnalysisLoadingSkeleton";
import { AnalysisDuplicatesPanel, AnalysisFilesList } from "@/pages/analysis/AnalysisTables";
import type { AllAnalysisResult, AnalysisData, AnalysisMode, AnalysisProps, SingleAnalysisResult } from "@/pages/analysis/types";
import { getCategoryBarData, getGenderPieData, getPaginatedItems, TABLE_PAGE_SIZE } from "@/pages/analysis/utils";

const AnalysisCharts = lazy(() =>
  import("@/pages/analysis/AnalysisCharts").then((module) => ({ default: module.AnalysisCharts })),
);

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function Analysis({ onNavigate }: AnalysisProps) {
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

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => onNavigate("saved")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-foreground">Data Analysis</h1>
                {mode === "all" && allResult ? (
                  <Badge variant="default" className="flex items-center gap-1" data-testid="badge-total-files">
                    <FileStack className="w-3 h-3" />
                    {allResult.totalImports} files
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground">
                {mode === "all" ? (
                  <span className="font-medium text-foreground">Analysis of All Files</span>
                ) : (
                  <>
                    ID Analysis for: <span className="font-medium text-foreground">{importName}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {mode === "single" ? (
              <Button variant="outline" onClick={handleReset} data-testid="button-reset">
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
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="glass-wrapper p-6 mb-6 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-destructive font-medium">{error}</p>
            <Button className="mt-4" onClick={() => onNavigate("saved")} data-testid="button-go-saved">
              Go to Saved
            </Button>
          </div>
        ) : null}

        {loading ? <AnalysisLoadingSkeleton /> : null}

        {!loading && !error && analysis ? (
          <>
            <div className="glass-wrapper p-4 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <span className="text-muted-foreground">Total Rows:</span>
                  <span className="font-bold text-foreground">{totalRows.toLocaleString()}</span>
                </div>
                {mode === "single" && singleResult ? <Badge variant="outline">{singleResult.import.filename}</Badge> : null}
                {mode === "all" && allResult ? <Badge variant="outline">{allResult.totalImports} files combined</Badge> : null}
              </div>
            </div>

            <Suspense fallback={<AnalysisChartsSkeleton />}>
              <AnalysisCharts categoryBarData={categoryBarData} genderPieData={genderPieData} />
            </Suspense>

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
                <div className="space-y-3 mb-8">
                  <AnalysisExpandableSection
                    copiedItems={copiedItems}
                    isExpanded={expandedSections.polis || false}
                    items={analysis.noPolis.samples || []}
                    onCopyAll={copyAllToClipboard}
                    onCopyItem={copyToClipboard}
                    onPageChange={setPage}
                    onToggle={() => toggleSection("polis")}
                    page={getPaginatedItems("polis", analysis.noPolis.samples || [], tablePages).page}
                    pagedItems={getPaginatedItems("polis", analysis.noPolis.samples || [], tablePages).items}
                    sectionKey="polis"
                    start={getPaginatedItems("polis", analysis.noPolis.samples || [], tablePages).start}
                    totalPages={getPaginatedItems("polis", analysis.noPolis.samples || [], tablePages).totalPages}
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
                    page={getPaginatedItems("tentera", analysis.noTentera.samples || [], tablePages).page}
                    pagedItems={getPaginatedItems("tentera", analysis.noTentera.samples || [], tablePages).items}
                    sectionKey="tentera"
                    start={getPaginatedItems("tentera", analysis.noTentera.samples || [], tablePages).start}
                    totalPages={getPaginatedItems("tentera", analysis.noTentera.samples || [], tablePages).totalPages}
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
                    page={getPaginatedItems("passportMY", analysis.passportMY.samples || [], tablePages).page}
                    pagedItems={getPaginatedItems("passportMY", analysis.passportMY.samples || [], tablePages).items}
                    sectionKey="passportMY"
                    start={getPaginatedItems("passportMY", analysis.passportMY.samples || [], tablePages).start}
                    totalPages={getPaginatedItems("passportMY", analysis.passportMY.samples || [], tablePages).totalPages}
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
                    page={getPaginatedItems("passportLN", analysis.passportLuarNegara.samples || [], tablePages).page}
                    pagedItems={getPaginatedItems("passportLN", analysis.passportLuarNegara.samples || [], tablePages).items}
                    sectionKey="passportLN"
                    start={getPaginatedItems("passportLN", analysis.passportLuarNegara.samples || [], tablePages).start}
                    totalPages={getPaginatedItems("passportLN", analysis.passportLuarNegara.samples || [], tablePages).totalPages}
                    title="Foreign Passport"
                    colorClass="text-orange-500"
                    icon={Plane}
                  />
                </div>
              </>
            ) : null}

            {mode === "all" && allResult ? (
              <AnalysisFilesList
                allResult={allResult}
                filesListOpen={filesListOpen}
                filesPaged={filesPaged}
                onFilesListOpenChange={setFilesListOpen}
                onPageChange={setPage}
              />
            ) : null}

            <AnalysisDuplicatesPanel
              count={analysis.duplicates.count}
              duplicates={analysis.duplicates.items}
              duplicatesOpen={duplicatesOpen}
              duplicatesPaged={duplicatesPaged}
              onCopyDuplicate={copyToClipboard}
              onDuplicatesOpenChange={setDuplicatesOpen}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
