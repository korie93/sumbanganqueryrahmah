import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { CollectionNicknameSingleSelect } from "@/pages/collection-report/CollectionNicknameSingleSelect";
import { formatAmountRM } from "@/pages/collection/utils";
import { CollectionComparisonTargetCards } from "./CollectionComparisonTargetCards";
import { CollectionMonthField } from "./CollectionMonthField";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import {
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonPresetRange,
  type CollectionMonthlyComparisonTargetLookup,
  type CollectionMonthlyComparisonTargetSummary,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonSetupCardProps = {
  availableNicknames: string[];
  canFilterByNickname: boolean;
  data: CollectionMonthlyComparisonResponse | null;
  endMonth: string;
  hasAvailableNickname: boolean;
  loading: boolean;
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetErrorMessage?: string | null | undefined;
  monthlyTargetLoading?: boolean | undefined;
  monthlyTargetSourceLabel?: string | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  onApply: () => void;
  onEndMonthChange: (value: string) => void;
  onExportCsv?: (() => void) | undefined;
  onPrintReport?: (() => void) | undefined;
  onRangePresetApply: (preset: CollectionMonthlyComparisonPresetRange) => void;
  onReset: () => void;
  onSelectedNicknameChange: (value: string) => void;
  onStartMonthChange: (value: string) => void;
  rangePresets: CollectionMonthlyComparisonPresetRange[];
  selectedNickname: string;
  startMonth: string;
  targetSummary: CollectionMonthlyComparisonTargetSummary | null;
};

export function CollectionMonthlyComparisonSetupCard({
  availableNicknames,
  canFilterByNickname,
  data,
  endMonth,
  hasAvailableNickname,
  loading,
  monthlyTargetAmount = null,
  monthlyTargetErrorMessage = null,
  monthlyTargetLoading = false,
  monthlyTargetSourceLabel = null,
  monthlyTargetsByMonth,
  onApply,
  onEndMonthChange,
  onExportCsv,
  onPrintReport,
  onRangePresetApply,
  onReset,
  onSelectedNicknameChange,
  onStartMonthChange,
  rangePresets,
  selectedNickname,
  startMonth,
  targetSummary,
}: CollectionMonthlyComparisonSetupCardProps) {
  const [nicknameSelectOpen, setNicknameSelectOpen] = useState(false);
  const selectedNicknameLabel = useMemo(() => {
    const normalizedValue = String(selectedNickname || "").trim();
    if (!normalizedValue) {
      return loading ? "Loading visible nicknames..." : "Choose a staff nickname";
    }
    return normalizedValue;
  }, [loading, selectedNickname]);
  const targetDisplayLabel = monthlyTargetLoading
    ? "Loading target..."
    : monthlyTargetAmount && monthlyTargetAmount > 0
      ? formatAmountRM(monthlyTargetAmount)
      : "No target configured";
  const targetConfidenceLabel = monthlyTargetLoading
    ? "Checking target"
    : monthlyTargetAmount && monthlyTargetAmount > 0
      ? "Superuser target active"
      : "Target missing";
  const targetSupportingLabel = monthlyTargetSourceLabel
    ? `Configured for ${monthlyTargetSourceLabel}`
    : targetSummary
      ? `${targetSummary.configuredMonthCount}/${data?.months.length || 0} selected month target(s) configured`
      : "Uses the configured target for the target month";
  const targetMonthSpecificNote = data?.comparison.targetMonth
    ? resolveCollectionMonthlyComparisonTargetForMonth(
      data.comparison.targetMonth,
      monthlyTargetsByMonth ?? monthlyTargetAmount,
    )
    : null;

  return (
    <div className="collection-monthly-comparison-filter-card rounded-xl border border-border p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            Comparison setup
          </p>
          <p className="mt-1 text-sm text-foreground">
            {startMonth} to {endMonth}
            {selectedNickname ? ` - ${selectedNickname}` : ""}
          </p>
        </div>
        <span className="collection-monthly-comparison-chip rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {data ? `${data.months.length} month(s) loaded` : "Ready to apply"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(0,1fr)_10rem_10rem_auto_auto] xl:items-end">
        <div className="col-span-2 space-y-1 xl:col-span-1">
          {canFilterByNickname ? (
            <CollectionNicknameSingleSelect
              label="Staff nickname"
              triggerId="collection-monthly-comparison-nickname"
              open={nicknameSelectOpen}
              loading={loading && !selectedNickname}
              selectedLabel={selectedNicknameLabel}
              options={availableNicknames}
              value={selectedNickname}
              onOpenChange={setNicknameSelectOpen}
              onSelect={onSelectedNicknameChange}
              triggerClassName="collection-monthly-comparison-control h-11 rounded-md bg-background md:h-9"
              popoverClassName="w-[min(360px,calc(100vw-2rem))] rounded-xl border-border bg-popover p-2"
            />
          ) : (
            <div className="space-y-1">
              <label
                htmlFor="collection-monthly-comparison-nickname"
                className="text-sm font-medium text-foreground"
              >
                Staff nickname
              </label>
              <input
                id="collection-monthly-comparison-nickname"
                value={selectedNickname}
                readOnly
                className="collection-monthly-comparison-control h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground md:h-9"
                aria-readonly="true"
              />
            </div>
          )}
        </div>

        <CollectionMonthField
          id="collection-monthly-comparison-start-month"
          label="Start month"
          value={startMonth}
          onChange={onStartMonthChange}
        />

        <CollectionMonthField
          id="collection-monthly-comparison-end-month"
          label="End month"
          value={endMonth}
          onChange={onEndMonthChange}
        />

        <Button
          type="button"
          className="collection-monthly-comparison-primary-action h-11 md:h-9"
          onClick={onApply}
          disabled={loading || !hasAvailableNickname}
        >
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          className="collection-monthly-comparison-secondary-action h-11 md:h-9"
          onClick={onReset}
          disabled={loading}
        >
          Reset
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Single nickname only
        </span>
        <span>
          First month = base
        </span>
        <span>
          Last month = target
        </span>
      </div>
      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Quick monthly comparison ranges"
      >
        <span className="text-xs font-medium text-muted-foreground">Quick range</span>
        {rangePresets.map((preset) => {
          const active = preset.startMonth === startMonth && preset.endMonth === endMonth;
          const pressedProps = active
            ? { "aria-pressed": "true" as const }
            : { "aria-pressed": "false" as const };
          return (
            <Button
              key={preset.id}
              type="button"
              aria-label={`Apply quick range ${preset.label}`}
              {...pressedProps}
              variant="outline"
              className={
                active
                  ? "h-11 border-primary bg-primary/10 px-3 text-xs text-primary md:h-9"
                  : "h-11 px-3 text-xs md:h-9"
              }
              onClick={() => onRangePresetApply(preset)}
              disabled={loading || !hasAvailableNickname}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 lg:flex-row lg:items-start lg:justify-between">
        <details className="min-w-0 flex-1">
          <summary className="min-h-11 cursor-pointer rounded-md py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Monthly target: {targetDisplayLabel}
          </summary>
          <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Target details
            <MonthlyComparisonHint label="Monthly target explanation"
              text="This value is read from the superuser-configured daily target for the currently applied target month and staff nickname. No manual fallback is used." />
          </p>
          <span
            className={
              monthlyTargetAmount && monthlyTargetAmount > 0
                ? "inline-flex rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                : "inline-flex rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
            }
          >
            {targetConfidenceLabel}
          </span>
          <p className="text-xs text-muted-foreground">
            {targetSupportingLabel}
          </p>
          {targetSummary ? (
            <p className="text-xs text-muted-foreground">
              {targetSummary.configuredMonthCount}/{data?.months.length || 0} selected month target(s) loaded
              {targetSummary.missingMonthCount > 0 ? `, ${targetSummary.missingMonthCount} missing` : ""}
              {targetMonthSpecificNote ? "" : ", target month missing"}
            </p>
          ) : null}
          <CollectionComparisonTargetCards
            comparison={data?.comparison}
            monthlyTargetAmount={monthlyTargetAmount}
            monthlyTargetsByMonth={monthlyTargetsByMonth}
          />
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
          {onPrintReport ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 gap-2 md:h-9 md:flex-none"
              onClick={onPrintReport}
              disabled={loading || monthlyTargetLoading || !data}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print report
            </Button>
          ) : null}
          {onExportCsv ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 gap-2 md:h-9 md:flex-none"
              onClick={onExportCsv}
              disabled={loading || monthlyTargetLoading || !data}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </Button>
          ) : null}
        </div>
      </div>
      {monthlyTargetErrorMessage ? (
        <p role="status" className="mt-2 text-xs text-destructive">Target unavailable: {monthlyTargetErrorMessage}</p>
      ) : null}
    </div>
  );
}
