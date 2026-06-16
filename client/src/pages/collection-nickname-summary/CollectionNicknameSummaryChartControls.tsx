import { RotateCcw, Search, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  CollectionNicknameSummaryChartLimit,
  CollectionNicknameSummaryChartSort,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";

type CollectionNicknameSummaryChartControlsProps = {
  benchmarkAmountInput: string;
  limit: CollectionNicknameSummaryChartLimit;
  query: string;
  sortBy: CollectionNicknameSummaryChartSort;
  totalCount: number;
  visibleCount: number;
  onBenchmarkAmountChange: (value: string) => void;
  onLimitChange: (limit: CollectionNicknameSummaryChartLimit) => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
  onSortChange: (sortBy: CollectionNicknameSummaryChartSort) => void;
};

const LIMIT_OPTIONS: CollectionNicknameSummaryChartLimit[] = ["5", "10", "all"];

export function CollectionNicknameSummaryChartControls({
  benchmarkAmountInput,
  limit,
  query,
  sortBy,
  totalCount,
  visibleCount,
  onBenchmarkAmountChange,
  onLimitChange,
  onQueryChange,
  onReset,
  onSortChange,
}: CollectionNicknameSummaryChartControlsProps) {
  const filtersActive =
    limit !== "10"
    || query.trim().length > 0
    || sortBy !== "amount"
    || benchmarkAmountInput.trim().length > 0;

  return (
    <section
      className="rounded-lg border border-border/60 bg-muted/10 p-3"
      aria-labelledby="nickname-summary-filter-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="nickname-summary-filter-title" className="text-sm font-semibold text-foreground">
            Penapis paparan
          </h3>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Memaparkan {visibleCount} daripada {totalCount} nickname.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          disabled={!filtersActive}
          onClick={onReset}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset
        </Button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4 lg:items-end">
        <label className="grid gap-1.5 text-xs font-medium text-foreground">
          Cari nickname
          <span className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              className="pl-9"
              placeholder="Contoh: AFIQAH"
              maxLength={100}
              autoComplete="off"
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </span>
        </label>

        <label className="grid gap-1.5 text-xs font-medium text-foreground">
          Target per nickname (RM)
          <span className="relative">
            <Target
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="100"
              value={benchmarkAmountInput}
              className="pl-9"
              placeholder="Contoh: 50000"
              autoComplete="off"
              onChange={(event) => onBenchmarkAmountChange(event.target.value)}
            />
          </span>
        </label>

        <label className="grid gap-1.5 text-xs font-medium text-foreground">
          Susun mengikut
          <select
            aria-label="Susun nickname summary"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            name="nicknameSummarySort"
            value={sortBy}
            onChange={(event) =>
              onSortChange(event.target.value as CollectionNicknameSummaryChartSort)
            }
          >
            <option value="amount">Jumlah kutipan</option>
            <option value="records">Jumlah rekod</option>
            <option value="average">Purata setiap rekod</option>
          </select>
        </label>

        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-foreground">Bilangan paparan</span>
          <ToggleGroup
            type="single"
            value={limit}
            variant="outline"
            size="sm"
            className="grid grid-cols-3"
            aria-label="Pilih bilangan nickname untuk dipaparkan"
            onValueChange={(value) => {
              if (value) {
                onLimitChange(value as CollectionNicknameSummaryChartLimit);
              }
            }}
          >
            {LIMIT_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option}
                value={option}
                className="text-xs"
                aria-label={option === "all" ? "Paparkan semua nickname" : `Paparkan Top ${option}`}
              >
                {option === "all" ? "Semua" : `Top ${option}`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
    </section>
  );
}
