import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  CollectionNicknameSummaryChartLimit,
  CollectionNicknameSummaryChartMetric,
  CollectionNicknameSummaryChartSort,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";

type CollectionNicknameSummaryChartControlsProps = {
  limit: CollectionNicknameSummaryChartLimit;
  metric: CollectionNicknameSummaryChartMetric;
  query: string;
  sortBy: CollectionNicknameSummaryChartSort;
  totalCount: number;
  visibleCount: number;
  onLimitChange: (limit: CollectionNicknameSummaryChartLimit) => void;
  onMetricChange: (metric: CollectionNicknameSummaryChartMetric) => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
  onSortChange: (sortBy: CollectionNicknameSummaryChartSort) => void;
  targetModesDisabled: boolean;
};

const LIMIT_OPTIONS: CollectionNicknameSummaryChartLimit[] = ["5", "10", "all"];

export function CollectionNicknameSummaryChartControls({
  limit,
  metric,
  query,
  sortBy,
  totalCount,
  visibleCount,
  onLimitChange,
  onMetricChange,
  onQueryChange,
  onReset,
  onSortChange,
  targetModesDisabled,
}: CollectionNicknameSummaryChartControlsProps) {
  const filtersActive =
    limit !== "10"
    || metric !== "amount"
    || query.trim().length > 0
    || sortBy !== "amount";

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

      <div className="mt-3 grid gap-1.5">
        <span className="text-xs font-medium text-foreground">Mod carta</span>
        <ToggleGroup
          type="single"
          value={metric}
          variant="outline"
          size="sm"
          className="grid max-w-xl grid-cols-3"
          aria-label="Pilih metrik carta nickname summary"
          onValueChange={(value) => {
            if (value) {
              onMetricChange(value as CollectionNicknameSummaryChartMetric);
            }
          }}
        >
          <ToggleGroupItem value="amount" className="text-xs" aria-label="Paparkan jumlah kutipan">
            Kutipan
          </ToggleGroupItem>
          <ToggleGroupItem
            value="progress"
            className="text-xs"
            disabled={targetModesDisabled}
            aria-label="Paparkan progress target dalam peratus"
          >
            Progress %
          </ToggleGroupItem>
          <ToggleGroupItem
            value="gap"
            className="text-xs"
            disabled={targetModesDisabled}
            aria-label="Paparkan jurang target"
          >
            Jurang Target
          </ToggleGroupItem>
        </ToggleGroup>
        {targetModesDisabled ? (
          <span className="text-2xs text-muted-foreground">
            Progress dan jurang tersedia selepas sekurang-kurangnya satu target lengkap dimuatkan.
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3 lg:items-end">
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
            <option value="gap" disabled={targetModesDisabled}>Jurang target terbesar</option>
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
