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
import { Badge } from "@/components/ui/badge";
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
            onClick={onBackToSaved}
            data-testid="button-back"
            className={isMobile ? "w-full" : "w-full sm:w-auto"}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Saved
          </Button>
          {mode === "single" ? (
            <Button
              variant="outline"
              onClick={onReset}
              data-testid="button-reset"
              className={isMobile ? "w-full" : "w-full sm:w-auto"}
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
            className={isMobile ? "w-full" : "w-full sm:w-auto"}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </>
      }
      className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
    />
  );
}
