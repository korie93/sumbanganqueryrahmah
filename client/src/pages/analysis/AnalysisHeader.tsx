import {
  ArrowLeft,
  BarChart3,
  FileStack,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  OperationalPageHeader,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import type { AnalysisData, AnalysisMode, AllAnalysisResult } from "@/pages/analysis/types";

type AnalysisHeaderProps = {
  isMobile: boolean;
  mode: AnalysisMode;
  allResult: AllAnalysisResult | null;
  analysis: AnalysisData | null;
  totalRows: number;
  headerDescription: string;
  loading: boolean;
  onBackToSaved: () => void;
  onReset: () => void;
  onRefresh: () => void;
};

export function AnalysisHeader({
  isMobile,
  mode,
  allResult,
  analysis,
  totalRows,
  headerDescription,
  loading,
  onBackToSaved,
  onReset,
  onRefresh,
}: AnalysisHeaderProps) {
  return (
    <OperationalPageHeader
      title={<span data-testid="text-analysis-title">Data Analysis</span>}
      eyebrow="Insights"
      description={headerDescription}
      badge={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {mode === "all" ? "All Files" : "Single File"}
          </span>
          {mode === "all" && allResult ? (
            <span className="inline-flex items-center tabular-nums" data-testid="badge-total-files">
              <FileStack className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {allResult.totalImports} files
            </span>
          ) : null}
          {analysis ? (
            <span className="inline-flex items-center tabular-nums">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {totalRows.toLocaleString()} rows
            </span>
          ) : null}
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={onBackToSaved}
            data-testid="button-back"
            className={isMobile ? "flex-1" : ""}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Saved
          </Button>
          {mode === "single" ? (
            <Button
              variant="outline"
              onClick={onReset}
              data-testid="button-reset"
              className={isMobile ? "flex-1" : ""}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset (View All)
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            data-testid="button-refresh"
            className={isMobile ? "flex-1" : ""}
          >
            <RefreshCw className={`w-4 h-4 mr-2 motion-reduce:animate-none ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    />
  );
}
