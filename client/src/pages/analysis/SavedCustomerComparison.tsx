import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  GitCompareArrows,
  Search,
} from "lucide-react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ImportComparisonCategory,
} from "@shared/common/import-comparison-contract";
import {
  customerComparisonCategoryLabels,
  getCustomerComparisonCategoryCount,
  SavedCustomerComparisonResults,
} from "@/pages/analysis/SavedCustomerComparisonResults";
import { useSavedCustomerComparison } from "@/pages/analysis/useSavedCustomerComparison";

type SavedCustomerComparisonProps = {
  baselineId: string;
  currentId: string;
};

export function SavedCustomerComparison({
  baselineId,
  currentId,
}: SavedCustomerComparisonProps) {
  const {
    category,
    data,
    error,
    loading,
    page,
    searchInput,
    retry,
    setCategory,
    setPage,
    setSearchInput,
  } = useSavedCustomerComparison(baselineId, currentId);

  const categoryOptions: ImportComparisonCategory[] = [
    "all",
    "matched",
    "account_changed",
    "baseline_only",
    "current_only",
    "conflict",
    "unidentified",
  ];
  const categoryOptionLabels: Record<ImportComparisonCategory, string> = {
    all: "All results",
    ...customerComparisonCategoryLabels,
  };
  const start = data && data.pagination.total > 0
    ? (data.pagination.page - 1) * data.pagination.pageSize + 1
    : 0;
  const end = data
    ? Math.min(data.pagination.total, start + data.items.length - 1)
    : 0;

  return (
    <section className="space-y-4 border-t border-border pt-4" aria-labelledby="customer-comparison-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="customer-comparison-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitCompareArrows className="h-4 w-4 text-primary" aria-hidden="true" />
            Customer &amp; Account Comparison
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Deterministic matching uses IC first, then phone and name, with account evidence for fallback and conflict checks.
            Records without enough identifiers are kept separate for review.
          </p>
        </div>
        {data ? (
          <Badge variant="outline" className="w-fit">
            {data.pagination.total.toLocaleString()} shown by filter
          </Badge>
        ) : null}
      </div>

      {data ? (
        <>
          <OperationalSummaryStrip className="!grid grid-cols-2 gap-3 lg:grid-cols-4">
            <OperationalMetric
              label="Matched"
              value={data.summary.matched.toLocaleString()}
              supporting="Same identity and accounts"
              tone="success"
            />
            <OperationalMetric
              label="Account Changed"
              value={data.summary.accountChanged.toLocaleString()}
              supporting="Same customer, different account"
              tone={data.summary.accountChanged > 0 ? "warning" : "default"}
            />
            <OperationalMetric
              label="Baseline Only"
              value={data.summary.baselineOnly.toLocaleString()}
              supporting={`Only in ${data.baseline.name}`}
              tone={data.summary.baselineOnly > 0 ? "warning" : "default"}
            />
            <OperationalMetric
              label="Compare Only"
              value={data.summary.currentOnly.toLocaleString()}
              supporting={`Only in ${data.current.name}`}
              tone={data.summary.currentOnly > 0 ? "success" : "default"}
            />
          </OperationalSummaryStrip>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
              {data.summary.conflicts.toLocaleString()} identity conflicts
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
              {data.summary.unidentified.toLocaleString()} need identifiers
            </span>
            <span>
              {data.summary.baselineDuplicateRows.toLocaleString()} / {data.summary.currentDuplicateRows.toLocaleString()} duplicate rows
            </span>
          </div>
        </>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.42fr)]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search customer, IC, phone, or account"
            aria-label="Search customer comparison"
            maxLength={120}
            className="pl-9"
          />
        </div>
        <Select
          value={category}
          onValueChange={(value) => setCategory(value as ImportComparisonCategory)}
        >
          <SelectTrigger aria-label="Filter customer comparison status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {categoryOptionLabels[option]}
                {data ? ` (${getCustomerComparisonCategoryCount(option, data.summary).toLocaleString()})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {loading ? "Loading customer comparison." : ""}
        {!loading && data
          ? `Customer comparison loaded with ${data.pagination.total} filtered results.`
          : ""}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {!error && data ? <SavedCustomerComparisonResults data={data} /> : null}

      {data && data.pagination.total > 0 ? (
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {start}-{end} of {data.pagination.total.toLocaleString()} results</span>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || !data.pagination.hasPreviousPage}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <span className="whitespace-nowrap tabular-nums">
              Page {data.pagination.page} / {data.pagination.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || !data.pagination.hasNextPage}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
