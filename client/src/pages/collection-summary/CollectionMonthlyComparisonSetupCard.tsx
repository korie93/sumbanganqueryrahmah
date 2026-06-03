import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";

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
    <div className="collection-monthly-comparison-filter-card rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
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
      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(11rem,11rem)_minmax(11rem,11rem)_auto_auto] xl:items-end">
        <div className="space-y-1">
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
              triggerClassName="collection-monthly-comparison-control h-11 rounded-2xl bg-background"
              popoverClassName="w-[min(360px,calc(100vw-2rem))] rounded-2xl border-border/70 bg-popover p-2 shadow-xl"
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
                className="collection-monthly-comparison-control h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground"
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

        <button
          type="button"
          className="collection-monthly-comparison-primary-action inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onApply}
          disabled={loading || !hasAvailableNickname}
        >
          Apply
        </button>
        <button
          type="button"
          className="collection-monthly-comparison-secondary-action inline-flex h-11 items-center justify-center rounded-2xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onReset}
          disabled={loading}
        >
          Reset
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-foreground/68 dark:text-foreground/74">
        <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
          Single nickname only
        </span>
        <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
          First month = base
        </span>
        <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
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
          return (
            <button
              key={preset.id}
              type="button"
              aria-label={`Apply quick range ${preset.label}`}
              aria-pressed={active}
              className={
                active
                  ? "inline-flex h-8 items-center justify-center rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                  : "inline-flex h-8 items-center justify-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
              }
              onClick={() => onRangePresetApply(preset)}
              disabled={loading || !hasAvailableNickname}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(14rem,18rem)_auto] md:items-end md:justify-between">
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Monthly target
            </p>
            <MonthlyComparisonHint
              label="Monthly target explanation"
              text="This value is read from the superuser-configured daily target for the currently applied target month and staff nickname. No manual fallback is used."
            />
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {targetDisplayLabel}
          </p>
          <span
            className={
              monthlyTargetAmount && monthlyTargetAmount > 0
                ? "mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300"
                : "mt-1 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300"
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
          {monthlyTargetErrorMessage ? (
            <p role="status" className="mt-1 text-xs text-destructive">
              Target unavailable: {monthlyTargetErrorMessage}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
          {onPrintReport ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onPrintReport}
              disabled={loading || monthlyTargetLoading || !data}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print report
            </button>
          ) : null}
          {onExportCsv ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onExportCsv}
              disabled={loading || monthlyTargetLoading || !data}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
