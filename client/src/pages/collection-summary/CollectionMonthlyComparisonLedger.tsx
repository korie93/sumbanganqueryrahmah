import { useId, useMemo } from "react";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionMonthlyComparisonInsights,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonMonthDelta,
  formatCollectionMonthlyComparisonPercentage,
  formatCompactAmountRM,
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonLedgerProps = {
  data: CollectionMonthlyComparisonResponse;
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  monthlyTargetLoading?: boolean | undefined;
  monthlyTargetSourceLabel?: string | null | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
};

export function CollectionMonthlyComparisonLedger({
  data,
  monthlyTargetAmount,
  monthlyTargetsByMonth,
  monthlyTargetLoading = false,
  onMonthSelect,
}: CollectionMonthlyComparisonLedgerProps) {
  const descriptionId = useId();
  const insights = useMemo(() => buildCollectionMonthlyComparisonInsights(data), [data]);
  const targetInput = monthlyTargetsByMonth ?? monthlyTargetAmount;
  const targets = data.months.map((month) => (
    resolveCollectionMonthlyComparisonTargetForMonth(month.month, targetInput)
  ));
  // Every bar uses the same amount scale. A month-specific target must never
  // turn the bars into incomparable achievement percentages.
  const scaleMaximum = Math.max(0, ...data.months.map((month) => month.totalCollection),
    ...(monthlyTargetLoading ? [] : targets.map((target) => target ?? 0)));
  const configuredTargets = targets.filter((target): target is number => target !== null);
  const commonTarget = configuredTargets.length === data.months.length
    && configuredTargets.length > 0 && new Set(configuredTargets).size === 1
    ? configuredTargets[0]
    : null;

  return (
    <section className="monthly-comparison-ledger" aria-label="Monthly performance">
      <header className="monthly-comparison-ledger-heading">
        <div>
          <h3>Monthly performance</h3>
          <p>{data.months.length} month(s) · Monthly totals</p>
        </div>
        <p className="monthly-comparison-ledger-target">
          {monthlyTargetLoading ? "Loading configured targets..." : commonTarget
            ? `Configured monthly target: ${formatAmountRM(commonTarget)}`
            : configuredTargets.length > 0
              ? "Month-specific targets · See target details"
              : "No monthly target configured"}
        </p>
      </header>
      <p id={descriptionId} className="monthly-comparison-ledger-description">
        <span className="sr-only">{scaleMaximum > 0 ? `Shared amount scale: RM0 to ${formatAmountRM(scaleMaximum)}. ` : "No collection recorded in this range. "}</span>
        Change vs previous month.<span className="sr-only"> The preceding month within the applied range is used.</span>
      </p>
      {/* Keyboard users can scroll the bounded table at high zoom / narrow widths. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="monthly-comparison-ledger-scroll" tabIndex={0} role="region" aria-label="Monthly collection performance table" aria-describedby={descriptionId}>
        <table>
          <caption className="sr-only">Monthly collection performance</caption>
          <thead>
            <tr>
              <th scope="col" className="monthly-comparison-ledger-month">Month</th>
              <th scope="col" className="monthly-comparison-ledger-bar-cell" aria-hidden="true">
                <span className="monthly-comparison-ledger-scale"><span>0</span><span>{formatCompactAmountRM(scaleMaximum)}</span></span>
              </th>
              <th scope="col" className="monthly-comparison-ledger-amount">Collection (RM)</th>
              <th scope="col" className="monthly-comparison-ledger-records">Records</th>
              <th scope="col" className="monthly-comparison-ledger-change">Monthly change</th>
            </tr>
          </thead>
          <tbody>
            {insights.monthInsights.map((month) => (
              <tr key={month.month} data-month={month.month} className={cn(
                "monthly-comparison-ledger-row",
                month.isTargetMonth && "monthly-comparison-ledger-row--last",
              )}>
                <th scope="row" className="monthly-comparison-ledger-month">
                  {onMonthSelect ? (
                    <button type="button" className="monthly-comparison-ledger-month-button"
                      onClick={() => onMonthSelect(month.month)}
                      aria-label={`View collection records for ${month.label}`}>
                      {month.label}
                    </button>
                  ) : month.label}
                </th>
                <td className="monthly-comparison-ledger-bar-cell" aria-hidden="true">
                  <progress aria-hidden="true" className="collection-monthly-comparison-progress monthly-comparison-ledger-bar"
                    max={scaleMaximum || 1} value={Math.max(0, month.totalCollection)} />
                </td>
                <td className="monthly-comparison-ledger-amount">
                  {formatAmountRM(month.totalCollection)}
                  <progress aria-hidden="true" className="collection-monthly-comparison-progress monthly-comparison-ledger-mobile-bar"
                    max={scaleMaximum || 1} value={Math.max(0, month.totalCollection)} />
                </td>
                <td className="monthly-comparison-ledger-records">{month.recordCount}</td>
                <td className="monthly-comparison-ledger-change">
                  <span className={cn(
                    month.deltaFromPrevious !== null && month.deltaFromPrevious > 0 && "monthly-comparison-positive",
                    month.deltaFromPrevious !== null && month.deltaFromPrevious < 0 && "monthly-comparison-negative",
                  )} title={formatCollectionMonthlyComparisonMonthDelta(month.deltaFromPrevious, month.percentageFromPrevious)}>
                    {month.deltaFromPrevious === null ? (
                      <><span aria-hidden="true">—</span><span className="sr-only">First month in range</span></>
                    ) : month.percentageFromPrevious === null ? (
                      <><span>N/A</span><span className="monthly-comparison-ledger-zero-base">From RM0</span><span className="sr-only">{formatCollectionMonthlyComparisonDifference(month.deltaFromPrevious)}</span></>
                    ) : formatCollectionMonthlyComparisonPercentage(month.percentageFromPrevious)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="monthly-comparison-ledger-month">Range total</th>
              <td className="monthly-comparison-ledger-bar-cell" aria-hidden="true" />
              <td className="monthly-comparison-ledger-amount">{formatAmountRM(insights.rangeTotal)}</td>
              <td className="monthly-comparison-ledger-records">{insights.totalRecords}<span className="sr-only"> records</span></td>
              <td className="monthly-comparison-ledger-change"><span aria-hidden="true">—</span><span className="sr-only">Not applicable</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {onMonthSelect ? <p className="monthly-comparison-ledger-hint">Select a month to view its collection records.</p> : null}
    </section>
  );
}
