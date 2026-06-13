import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Columns3,
  GitCompareArrows,
  Search,
} from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ANALYSIS_COMPARISON_PAGE_SIZE,
  filterAnalysisComparisonColumns,
  formatAnalysisComparisonDelta,
  type AnalysisComparison,
  type AnalysisComparisonColumn,
  type AnalysisComparisonColumnStatus,
} from "@/pages/analysis/analysis-comparison-utils";
import { getAnalysisColumnTypeLabel } from "@/pages/analysis/analysis-quality-utils";
import type { AllAnalysisResult } from "@/pages/analysis/types";
import { useAnalysisComparisonState } from "@/pages/analysis/useAnalysisComparisonState";

type AnalysisComparisonSectionProps = {
  allResult: AllAnalysisResult;
};

const statusLabels: Record<AnalysisComparisonColumnStatus, string> = {
  added: "Added",
  changed: "Changed",
  removed: "Removed",
  unchanged: "Unchanged",
};

function getStatusClassName(status: AnalysisComparisonColumnStatus): string {
  if (status === "added") {
    return "border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-200";
  }
  if (status === "removed") {
    return "border-rose-300 text-rose-800 dark:border-rose-700 dark:text-rose-200";
  }
  if (status === "changed") {
    return "border-amber-300 text-amber-900 dark:border-amber-700 dark:text-amber-100";
  }
  return "text-muted-foreground";
}

function formatType(column: AnalysisComparisonColumn["baseline"]): string {
  return column ? getAnalysisColumnTypeLabel(column.inferredType) : "-";
}

function ComparisonDelta({
  value,
  suffix = " pts",
}: {
  value: number | null;
  suffix?: string;
}) {
  if (value === null) return <span className="text-muted-foreground">-</span>;

  const className =
    value > 0
      ? "text-emerald-700 dark:text-emerald-300"
      : value < 0
        ? "text-rose-700 dark:text-rose-300"
        : "text-muted-foreground";

  return (
    <span className={className}>
      {formatAnalysisComparisonDelta(value, suffix)}
    </span>
  );
}

function ComparisonChart({ comparison }: { comparison: AnalysisComparison }) {
  return (
    <div
      role="img"
      aria-label={`Comparison chart for ${comparison.baseline.name} and ${comparison.current.name}`}
      className="space-y-4 md:pr-14"
    >
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--chart-1))]" />
          Baseline
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--chart-3))]" />
          Compare
        </span>
      </div>

      <div className="space-y-4">
        {comparison.metrics.map((metric) => (
          <div
            key={metric.key}
            className="grid gap-2 md:grid-cols-[minmax(180px,0.8fr)_minmax(260px,2fr)] md:items-center"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{metric.label}</p>
              <span className="shrink-0 text-xs">
                <ComparisonDelta value={metric.delta} />
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full bg-[hsl(var(--chart-1))]"
                    style={{ width: `${Math.max(0, Math.min(100, metric.baseline))}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {metric.baseline}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full bg-[hsl(var(--chart-3))]"
                    style={{ width: `${Math.max(0, Math.min(100, metric.current))}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs tabular-nums text-foreground">
                  {metric.current}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="sr-only">
        {comparison.metrics.map((metric) => (
          <p key={metric.key}>
            {metric.label}: baseline {metric.baseline} percent, compare{" "}
            {metric.current} percent, difference{" "}
            {formatAnalysisComparisonDelta(metric.delta)}.
          </p>
        ))}
      </div>
    </div>
  );
}

function ComparisonTable({ comparison }: { comparison: AnalysisComparison }) {
  const [query, setQuery] = useState("");
  const [changesOnly, setChangesOnly] = useState(true);
  const [page, setPage] = useState(0);
  const filteredColumns = useMemo(
    () =>
      filterAnalysisComparisonColumns(
        comparison.columns,
        query,
        changesOnly,
      ),
    [changesOnly, comparison.columns, query],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredColumns.length / ANALYSIS_COMPARISON_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * ANALYSIS_COMPARISON_PAGE_SIZE;
  const end = Math.min(
    start + ANALYSIS_COMPARISON_PAGE_SIZE,
    filteredColumns.length,
  );
  const visibleColumns = filteredColumns.slice(start, end);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search column or type"
            aria-label="Search compared columns"
            className="pl-9"
          />
        </div>
        <Select
          value={changesOnly ? "changes" : "all"}
          onValueChange={(value) => {
            setChangesOnly(value === "changes");
            setPage(0);
          }}
        >
          <SelectTrigger
            className="w-full sm:w-44"
            aria-label="Filter compared columns"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="changes">Changes only</SelectItem>
            <SelectItem value="all">All columns</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visibleColumns.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No matching changes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjust the search or show all columns.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {visibleColumns.map((column) => (
              <article
                key={column.name}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-medium text-foreground">
                    {column.name}
                  </p>
                  <Badge
                    variant="outline"
                    className={getStatusClassName(column.status)}
                  >
                    {statusLabels[column.status]}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="mt-0.5 text-foreground">
                      {formatType(column.baseline)} to {formatType(column.current)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Completeness</dt>
                    <dd className="mt-0.5">
                      <ComparisonDelta value={column.completenessDelta} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Consistency</dt>
                    <dd className="mt-0.5">
                      <ComparisonDelta value={column.consistencyDelta} />
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <HorizontalScrollHint
            className="hidden rounded-md border border-border md:block"
            hint="Scroll comparison table"
          >
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">
                Column differences between {comparison.baseline.name} and{" "}
                {comparison.current.name}
              </caption>
              <thead className="bg-muted/70">
                <tr>
                  <th scope="col" className="p-3 text-left font-medium text-muted-foreground">
                    Column
                  </th>
                  <th scope="col" className="p-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="p-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th scope="col" className="p-3 text-right font-medium text-muted-foreground">
                    Completeness
                  </th>
                  <th scope="col" className="p-3 text-right font-medium text-muted-foreground">
                    Consistency
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleColumns.map((column) => (
                  <tr key={column.name} className="border-t border-border">
                    <th scope="row" className="p-3 text-left font-medium text-foreground">
                      {column.name}
                    </th>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={getStatusClassName(column.status)}
                      >
                        {statusLabels[column.status]}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatType(column.baseline)} to {formatType(column.current)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      <ComparisonDelta value={column.completenessDelta} />
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      <ComparisonDelta value={column.consistencyDelta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HorizontalScrollHint>
        </>
      )}

      {filteredColumns.length > ANALYSIS_COMPARISON_PAGE_SIZE ? (
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {start + 1}-{end} of {filteredColumns.length} columns
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(Math.max(0, safePage - 1))}
            >
              Prev
            </Button>
            <span>
              Page {safePage + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AnalysisComparisonSection({
  allResult,
}: AnalysisComparisonSectionProps) {
  const {
    imports,
    baselineId,
    currentId,
    comparison,
    loading,
    error,
    setBaselineId,
    setCurrentId,
    runComparison,
  } = useAnalysisComparisonState({ allResult });
  const [chartOpen, setChartOpen] = useState(true);
  const [tableOpen, setTableOpen] = useState(false);

  if (imports.length < 2) return null;

  const rowTone =
    comparison && comparison.rowDelta < 0
      ? "danger"
      : comparison && comparison.rowDelta > 0
        ? "success"
        : "default";
  const qualityDelta = comparison?.metrics.find(
    (metric) => metric.key === "quality",
  )?.delta;

  return (
    <OperationalSectionCard
      title="Compare Saved Files"
      description="Compare two bounded data profiles without loading raw records into this screen."
      badge={
        comparison ? (
          <Badge variant="outline">
            {comparison.changedColumns +
              comparison.addedColumns +
              comparison.removedColumns}{" "}
            schema changes
          </Badge>
        ) : null
      }
      contentClassName="space-y-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-1.5">
          <label
            htmlFor="analysis-comparison-baseline"
            className="text-xs font-medium text-muted-foreground"
          >
            Baseline file
          </label>
          <Select value={baselineId} onValueChange={setBaselineId}>
            <SelectTrigger id="analysis-comparison-baseline">
              <SelectValue placeholder="Select baseline" />
            </SelectTrigger>
            <SelectContent>
              {imports.map((item) => (
                <SelectItem
                  key={item.id}
                  value={item.id}
                  disabled={item.id === currentId}
                >
                  {item.name} ({item.rowCount.toLocaleString()} rows)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="analysis-comparison-current"
            className="text-xs font-medium text-muted-foreground"
          >
            Compare file
          </label>
          <Select value={currentId} onValueChange={setCurrentId}>
            <SelectTrigger id="analysis-comparison-current">
              <SelectValue placeholder="Select file to compare" />
            </SelectTrigger>
            <SelectContent>
              {imports.map((item) => (
                <SelectItem
                  key={item.id}
                  value={item.id}
                  disabled={item.id === baselineId}
                >
                  {item.name} ({item.rowCount.toLocaleString()} rows)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          onClick={() => void runComparison()}
          disabled={loading || !baselineId || !currentId}
          className="w-full lg:w-auto"
          data-testid="button-run-analysis-comparison"
        >
          <GitCompareArrows className="h-4 w-4" />
          {loading ? "Comparing..." : "Compare"}
        </Button>
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {loading ? "Comparing selected saved files." : ""}
        {!loading && comparison
          ? `Comparison ready with ${
              comparison.changedColumns +
              comparison.addedColumns +
              comparison.removedColumns
            } schema changes.`
          : ""}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!comparison && !loading && !error ? (
        <div className="flex min-h-28 items-center gap-3 rounded-md border border-dashed border-border px-4 py-5">
          <GitCompareArrows className="h-6 w-6 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Choose a baseline and a newer file
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The comparison highlights row, quality, type, and schema changes.
            </p>
          </div>
        </div>
      ) : null}

      {comparison ? (
        <>
          <OperationalSummaryStrip className="!grid grid-cols-2 gap-3 md:grid-cols-4">
            <OperationalMetric
              label="Row Difference"
              value={
                <span className="inline-flex items-center gap-1">
                  {comparison.rowDelta > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : comparison.rowDelta < 0 ? (
                    <ArrowDownRight className="h-4 w-4" />
                  ) : null}
                  {formatAnalysisComparisonDelta(comparison.rowDelta, "")}
                </span>
              }
              supporting={
                comparison.rowDeltaPercent === null
                  ? "No baseline rows"
                  : `${formatAnalysisComparisonDelta(
                      comparison.rowDeltaPercent,
                      "%",
                    )} from baseline`
              }
              tone={rowTone}
            />
            <OperationalMetric
              label="Quality Difference"
              value={formatAnalysisComparisonDelta(qualityDelta ?? 0)}
              supporting={`${comparison.baseline.name} to ${comparison.current.name}`}
              tone={
                (qualityDelta ?? 0) > 0
                  ? "success"
                  : (qualityDelta ?? 0) < 0
                    ? "danger"
                    : "default"
              }
            />
            <OperationalMetric
              label="Changed Columns"
              value={comparison.changedColumns}
              supporting="Type or quality changed"
              tone={comparison.changedColumns > 0 ? "warning" : "success"}
            />
            <OperationalMetric
              label="Schema Drift"
              value={comparison.addedColumns + comparison.removedColumns}
              supporting={`${comparison.addedColumns} added / ${comparison.removedColumns} removed`}
              tone={
                comparison.addedColumns + comparison.removedColumns > 0
                  ? "warning"
                  : "success"
              }
            />
          </OperationalSummaryStrip>

          <Collapsible
            open={chartOpen}
            onOpenChange={setChartOpen}
            data-floating-ai-avoid="true"
          >
            <div className="border-t border-border pt-3">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-between px-0 py-2"
                  aria-label={`${chartOpen ? "Minimize" : "Show"} comparison chart`}
                >
                  <span className="inline-flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Comparison Chart
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform ${
                      chartOpen ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <ComparisonChart comparison={comparison} />
              </CollapsibleContent>
            </div>
          </Collapsible>

          <Collapsible
            open={tableOpen}
            onOpenChange={setTableOpen}
            data-floating-ai-avoid="true"
          >
            <div className="border-t border-border pt-3">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-between px-0 py-2"
                  aria-label={`${tableOpen ? "Minimize" : "Show"} column difference table`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Columns3 className="h-4 w-4 text-primary" />
                    Column Difference Table
                    <Badge variant="secondary">
                      {comparison.columns.length}
                    </Badge>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform ${
                      tableOpen ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <ComparisonTable comparison={comparison} />
              </CollapsibleContent>
            </div>
          </Collapsible>
        </>
      ) : null}
    </OperationalSectionCard>
  );
}
