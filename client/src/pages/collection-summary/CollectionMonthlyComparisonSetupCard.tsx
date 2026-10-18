import { useId, useMemo, useState } from "react";
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
  exportContextId?: string;
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
  showExportActions?: boolean;
  startMonth: string;
  targetSummary: CollectionMonthlyComparisonTargetSummary | null;
};

export function CollectionMonthlyComparisonSetupCard({
  availableNicknames,
  canFilterByNickname,
  data,
  endMonth,
  exportContextId: providedExportContextId,
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
  showExportActions = true,
  startMonth,
  targetSummary,
}: CollectionMonthlyComparisonSetupCardProps) {
  const [nicknameSelectOpen, setNicknameSelectOpen] = useState(false);
  const generatedExportContextId = useId();
  const exportContextId = providedExportContextId || generatedExportContextId;
  const activeRangePreset = rangePresets.find(
    (preset) => preset.startMonth === startMonth && preset.endMonth === endMonth,
  );
  const exportDisabledReason = loading
    ? "Wait for the monthly comparison to finish loading before exporting or printing."
    : monthlyTargetLoading
      ? "Wait for the monthly targets to finish loading before exporting or printing."
      : !data
        ? hasAvailableNickname
          ? "Load a comparison with Apply before exporting or printing."
          : "A staff nickname visible to your account is required before loading a report."
        : null;
  const hasUnappliedFilters = data && (
    data.startMonth !== startMonth || data.endMonth !== endMonth
    || data.nickname.trim().toLowerCase() !== selectedNickname.trim().toLowerCase()
  );
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
    <div className="collection-monthly-comparison-filter-card monthly-comparison-toolbar rounded-xl border border-border p-3 sm:p-4">
      <div className="monthly-comparison-toolbar-grid grid grid-cols-2 items-end gap-3">
        <div className="monthly-comparison-toolbar-nickname min-w-0 space-y-1">
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

        <div className="monthly-comparison-toolbar-presets min-w-0 space-y-1">
          <label htmlFor="collection-monthly-comparison-quick-range" className="text-sm font-medium text-foreground">
            Quick range
          </label>
          <select
            id="collection-monthly-comparison-quick-range"
            className="collection-monthly-comparison-control h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground md:h-9"
            value={activeRangePreset?.id || ""}
            onChange={(event) => {
              const preset = rangePresets.find((range) => range.id === event.target.value);
              if (preset) onRangePresetApply(preset);
            }}
            disabled={loading || !hasAvailableNickname}
          >
            <option value="" disabled>Custom range</option>
            {rangePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
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
      <div className={`monthly-comparison-toolbar-footer mt-2 flex flex-col gap-2 border-t border-border pt-2 lg:flex-row lg:items-start lg:justify-between${!showExportActions ? " monthly-comparison-toolbar-footer--compact" : ""}`}>
        <details className="min-w-0 flex-1">
          <summary className="min-h-11 cursor-pointer rounded-md py-2 text-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
            aria-label={`Monthly target details: ${targetDisplayLabel}`}>
            Target details
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
        {showExportActions && (onPrintReport || onExportCsv) ? (
          <div className="min-w-0 space-y-2 lg:max-w-sm">
            <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
              {onPrintReport ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 gap-2 md:h-9 md:flex-none"
                  onClick={onPrintReport}
                  disabled={loading || monthlyTargetLoading || !data}
                  aria-describedby={exportContextId}
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
                  aria-describedby={exportContextId}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export CSV
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {onPrintReport || onExportCsv || providedExportContextId ? (
          <div
            id={exportContextId}
            data-testid="monthly-comparison-export-context"
            className="monthly-comparison-export-context min-w-0 space-y-1 break-words text-xs leading-5 text-muted-foreground"
          >
            {data ? (
              <p>Export / print scope: {data.startMonth} to {data.endMonth} · {data.nickname}.</p>
            ) : null}
            {hasUnappliedFilters ? (
              <p>Uses the last loaded report. Apply changed filters to update the export.</p>
            ) : null}
            {exportDisabledReason ? <p role="status">{exportDisabledReason}</p> : null}
          </div>
        ) : null}
      </div>
      {monthlyTargetErrorMessage ? (
        <p role="status" className="mt-2 text-xs text-destructive">Target unavailable: {monthlyTargetErrorMessage}</p>
      ) : null}
    </div>
  );
}
