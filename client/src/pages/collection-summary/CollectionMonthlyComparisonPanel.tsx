import type { ReactNode } from "react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import type {
  CollectionMonthlyComparisonResponse,
} from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionMonthlyComparisonAccessibleSummary,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonPercentage,
  resolveCollectionMonthlyComparisonTone,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonPanelProps = {
  canFilterByNickname: boolean;
  availableNicknames: string[];
  selectedNickname: string;
  startMonth: string;
  endMonth: string;
  loading: boolean;
  errorMessage: string | null;
  data: CollectionMonthlyComparisonResponse | null;
  hasAvailableNickname: boolean;
  onSelectedNicknameChange: (value: string) => void;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
  chartSlot?: ReactNode | undefined;
};

export function CollectionMonthlyComparisonPanel({
  canFilterByNickname,
  availableNicknames,
  selectedNickname,
  startMonth,
  endMonth,
  loading,
  errorMessage,
  data,
  hasAvailableNickname,
  onSelectedNicknameChange,
  onStartMonthChange,
  onEndMonthChange,
  onApply,
  onReset,
  chartSlot,
}: CollectionMonthlyComparisonPanelProps) {
  const comparison = data?.comparison || null;
  const comparisonTone = comparison
    ? resolveCollectionMonthlyComparisonTone(comparison.direction)
    : "default";
  const comparisonSummary = data
    ? buildCollectionMonthlyComparisonAccessibleSummary(data)
    : null;
  const baseMonthRecordCount = comparison?.baseMonth
    ? data?.months.find((entry) => entry.month === comparison.baseMonth)?.recordCount || 0
    : 0;
  const targetMonthRecordCount = comparison
    ? data?.months.find((entry) => entry.month === comparison.targetMonth)?.recordCount || 0
    : 0;

  return (
    <section
      aria-labelledby="collection-monthly-comparison-title"
      className="space-y-4 border-t border-border/60 pt-4"
      data-floating-ai-avoid="true"
    >
      <div className="space-y-1">
        <h2 id="collection-monthly-comparison-title" className="text-lg font-semibold text-foreground">
          Monthly Collection Comparison
        </h2>
        <p className="text-sm text-muted-foreground">
          Compare month-by-month collection totals for a single staff nickname across a bounded reporting range.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_160px_160px_auto_auto] lg:items-end">
        <div className="space-y-1">
          <label
            htmlFor="collection-monthly-comparison-nickname"
            className="text-sm font-medium text-foreground"
          >
            Staff nickname
          </label>
          {canFilterByNickname ? (
            <>
              <input
                id="collection-monthly-comparison-nickname"
                list="collection-monthly-comparison-nicknames"
                value={selectedNickname}
                onChange={(event) => onSelectedNicknameChange(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Search or select a nickname"
                aria-describedby="collection-monthly-comparison-nickname-help"
              />
              <datalist id="collection-monthly-comparison-nicknames">
                {availableNicknames.map((nickname) => (
                  <option key={nickname} value={nickname} />
                ))}
              </datalist>
              <p
                id="collection-monthly-comparison-nickname-help"
                className="text-xs text-muted-foreground"
              >
                Choose one visible nickname to compare monthly totals.
              </p>
            </>
          ) : (
            <input
              id="collection-monthly-comparison-nickname"
              value={selectedNickname}
              readOnly
              className="h-10 w-full rounded-md border border-input bg-muted/30 px-3 text-sm text-foreground"
              aria-readonly="true"
            />
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="collection-monthly-comparison-start-month"
            className="text-sm font-medium text-foreground"
          >
            Start month
          </label>
          <input
            id="collection-monthly-comparison-start-month"
            type="month"
            value={startMonth}
            onChange={(event) => onStartMonthChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="collection-monthly-comparison-end-month"
            className="text-sm font-medium text-foreground"
          >
            End month
          </label>
          <input
            id="collection-monthly-comparison-end-month"
            type="month"
            value={endMonth}
            onChange={(event) => onEndMonthChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          onClick={onApply}
        >
          Apply
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      {!hasAvailableNickname ? (
        <p className="rounded-md border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
          No visible staff nickname is available for this monthly comparison yet.
        </p>
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-border/60 px-4 py-6 text-sm text-muted-foreground"
        >
          Loading monthly comparison...
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}

      {!loading && !errorMessage && data ? (
        <div className="space-y-4">
          <OperationalSummaryStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <OperationalMetric
              label={comparison?.baseLabel ? `${comparison.baseLabel} Total` : "Base month total"}
              value={
                !comparison || comparison.baseTotal === null
                  ? "No previous month"
                  : formatAmountRM(comparison.baseTotal)
              }
              supporting={
                comparison?.baseLabel
                  ? `${baseMonthRecordCount} record(s)`
                  : "Select at least two months to compare"
              }
            />
            <OperationalMetric
              label={`${comparison?.targetLabel || "Target month"} Total`}
              value={formatAmountRM(comparison?.targetTotal || 0)}
              supporting={`${targetMonthRecordCount} record(s)`}
            />
            <OperationalMetric
              label="Difference"
              value={formatCollectionMonthlyComparisonDifference(comparison?.difference ?? null)}
              tone={comparisonTone}
              supporting={comparison?.direction === "no_previous_data" ? "No previous month to compare" : undefined}
            />
            <OperationalMetric
              label="Percentage Change"
              value={formatCollectionMonthlyComparisonPercentage(comparison?.percentageChange ?? null)}
              tone={comparisonTone}
            />
          </OperationalSummaryStrip>

          <p className="text-sm text-foreground">{comparison?.summary}</p>
          {comparisonSummary ? <p className="sr-only">{comparisonSummary}</p> : null}

          <div className="space-y-3">
            <div className="grid gap-2">
              {data.months.map((month) => (
                <div
                  key={month.month}
                  className="grid gap-2 rounded-md border border-border/50 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{month.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {month.recordCount} record(s)
                    </p>
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {formatAmountRM(month.totalCollection)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Avg {formatAmountRM(month.averagePerRecord)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {month.recordCount === 0 ? "No collection recorded" : "Active month"}
                  </div>
                </div>
              ))}
            </div>

            {chartSlot}
          </div>
        </div>
      ) : null}
    </section>
  );
}
