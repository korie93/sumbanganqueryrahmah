import { useCallback, useId, useMemo } from "react";

import {
  buildCollectionSameDayPaceDayOptions,
  buildCollectionSameDayPaceQuickOptions,
  resolveCollectionSameDayPaceCompareModeLabel,
  resolveCollectionSameDayPaceRangeForSelection,
  resolveCollectionSameDayPaceWindowMode,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPaceComparisonMode,
  type CollectionSameDayPaceDayRange,
  type CollectionSameDayPaceQuickOptionId,
  type CollectionSameDayPaceWindowMode,
} from "./collection-monthly-comparison-utils";

type SameDayCompareDayControlsProps = {
  pace: CollectionSameDayPaceComparison;
  dayRange: CollectionSameDayPaceDayRange;
  maxDay: number;
  comparisonMode: CollectionSameDayPaceComparisonMode;
  onDayRangeChange: (range: CollectionSameDayPaceDayRange) => void;
  onComparisonModeChange: (mode: CollectionSameDayPaceComparisonMode) => void;
};

export function SameDayCompareDayControls({
  pace,
  dayRange,
  maxDay,
  comparisonMode,
  onDayRangeChange,
  onComparisonModeChange,
}: SameDayCompareDayControlsProps) {
  const controlId = useId();
  const safeMaxDay = Math.max(1, Math.trunc(Number(maxDay || 1)));
  const dayOptions = useMemo(() => buildCollectionSameDayPaceDayOptions(safeMaxDay), [safeMaxDay]);
  const quickOptions = useMemo(() => buildCollectionSameDayPaceQuickOptions({
    points: pace.points,
    maxDay: safeMaxDay,
    currentMonthKey: pace.currentMonth,
  }), [pace.currentMonth, pace.points, safeMaxDay]);
  const windowMode = resolveCollectionSameDayPaceWindowMode(dayRange);
  const selectedDay = Math.max(1, Math.min(safeMaxDay, dayRange.endDay));
  const selectedStartDay = Math.max(1, Math.min(selectedDay, dayRange.startDay));

  const applyWindowSelection = useCallback((nextWindowMode: CollectionSameDayPaceWindowMode, nextDay = selectedDay) => {
    onDayRangeChange(resolveCollectionSameDayPaceRangeForSelection({
      day: nextDay,
      maxDay: safeMaxDay,
      windowMode: nextWindowMode,
      currentRange: dayRange,
    }));
  }, [dayRange, onDayRangeChange, safeMaxDay, selectedDay]);

  const applyQuickOption = useCallback((optionId: CollectionSameDayPaceQuickOptionId) => {
    const option = quickOptions.find((candidate) => candidate.id === optionId);
    if (!option || option.disabled) {
      return;
    }

    if (option.comparisonMode) {
      onComparisonModeChange(option.comparisonMode);
    }
    if (option.range) {
      onDayRangeChange(option.range);
      return;
    }
    if (option.windowMode) {
      applyWindowSelection(option.windowMode);
    }
  }, [applyWindowSelection, onComparisonModeChange, onDayRangeChange, quickOptions]);

  return (
    <div className="collection-monthly-comparison-day-picker rounded-2xl border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            Pilih compare day
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Pilih hari dengan cepat tanpa kira manual. Chart, insight dan CSV akan ikut pilihan ini.
          </p>
        </div>
        <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-2xs font-medium text-muted-foreground">
          {resolveCollectionSameDayPaceCompareModeLabel(comparisonMode)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <label className="collection-monthly-comparison-select-label" htmlFor={`${controlId}-baseline`}>
          <span>Banding dengan</span>
          <select
            id={`${controlId}-baseline`}
            className="collection-monthly-comparison-control collection-monthly-comparison-select"
            value={comparisonMode}
            onChange={(event) => onComparisonModeChange(event.target.value as CollectionSameDayPaceComparisonMode)}
          >
            <option value="selected-start-month">Bulan mula dipilih</option>
            <option value="previous-month">Hari sama bulan lepas</option>
            <option value="previous-year">Hari sama tahun lepas</option>
          </select>
        </label>

        <label className="collection-monthly-comparison-select-label" htmlFor={`${controlId}-window`}>
          <span>Jenis bacaan</span>
          <select
            id={`${controlId}-window`}
            className="collection-monthly-comparison-control collection-monthly-comparison-select"
            value={windowMode}
            onChange={(event) => applyWindowSelection(event.target.value as CollectionSameDayPaceWindowMode)}
          >
            <option value="cumulative">Jumlah sampai hari dipilih</option>
            <option value="single-day">Hari itu sahaja</option>
            <option value="custom-range">Julat custom</option>
          </select>
        </label>

        {windowMode === "custom-range" ? (
          <label className="collection-monthly-comparison-select-label" htmlFor={`${controlId}-start-day`}>
            <span>Mula hari</span>
            <select
              id={`${controlId}-start-day`}
              className="collection-monthly-comparison-control collection-monthly-comparison-select"
              value={selectedStartDay}
              onChange={(event) => {
                const nextStartDay = Math.max(1, Math.min(selectedDay, Number(event.target.value)));
                onDayRangeChange({
                  startDay: nextStartDay,
                  endDay: selectedDay,
                });
              }}
            >
              {dayOptions.filter((option) => option.value <= selectedDay).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="collection-monthly-comparison-select-label" htmlFor={`${controlId}-day`}>
          <span>{windowMode === "single-day" ? "Hari fokus" : "Sampai hari"}</span>
          <select
            id={`${controlId}-day`}
            className="collection-monthly-comparison-control collection-monthly-comparison-select"
            value={selectedDay}
            onChange={(event) => applyWindowSelection(windowMode, Number(event.target.value))}
            aria-describedby={`${controlId}-day-help`}
          >
            {dayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="collection-monthly-comparison-select-label" htmlFor={`${controlId}-quick`}>
          <span>Preset cepat</span>
          <select
            id={`${controlId}-quick`}
            className="collection-monthly-comparison-control collection-monthly-comparison-select"
            value=""
            onChange={(event) => applyQuickOption(event.target.value as CollectionSameDayPaceQuickOptionId)}
          >
            <option value="">Pilih preset cepat...</option>
            {quickOptions.map((option) => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p id={`${controlId}-day-help`} className="mt-2 text-2xs leading-5 text-muted-foreground">
        {windowMode === "single-day"
          ? `Sedang fokus hari ${selectedDay} sahaja.`
          : windowMode === "custom-range"
            ? `Sedang banding hari ${selectedStartDay} hingga ${selectedDay}.`
            : `Sedang banding jumlah terkumpul dari hari 1 hingga hari ${selectedDay}.`}
        {" "}Maksimum sah untuk dua bulan ini ialah hari {safeMaxDay}.
      </p>
    </div>
  );
}
