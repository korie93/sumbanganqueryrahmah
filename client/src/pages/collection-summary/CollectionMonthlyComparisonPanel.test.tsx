import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { CollectionMonthlyComparisonPanel } from "@/pages/collection-summary/CollectionMonthlyComparisonPanel";
import { buildCollectionSameDayPaceComparison } from "@/pages/collection-summary/collection-monthly-comparison-utils";

type PanelProps = ComponentProps<typeof CollectionMonthlyComparisonPanel>;

function renderPanel(props: PanelProps) {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      {
        delayDuration: 0,
        children: createElement(CollectionMonthlyComparisonPanel, props),
      },
    ),
  );
}

const comparisonPayload: CollectionMonthlyComparisonResponse = {
  ok: true,
  nickname: "Collector Alpha",
  startMonth: "2026-04",
  endMonth: "2026-05",
  months: [
    {
      month: "2026-04",
      label: "Apr 2026",
      totalCollection: 70450,
      recordCount: 123,
      averagePerRecord: 572.76,
    },
    {
      month: "2026-05",
      label: "May 2026",
      totalCollection: 82900,
      recordCount: 146,
      averagePerRecord: 567.81,
    },
  ],
  comparison: {
    baseMonth: "2026-04",
    targetMonth: "2026-05",
    baseLabel: "Apr 2026",
    targetLabel: "May 2026",
    baseTotal: 70450,
    targetTotal: 82900,
    difference: 12450,
    percentageChange: 17.67,
    direction: "increase",
    summary: "Collection increased by RM12,450.00 (+17.67%) compared to Apr 2026.",
  },
};

const anomalyPayload: CollectionMonthlyComparisonResponse = {
  ...comparisonPayload,
  months: [
    comparisonPayload.months[0]!,
    {
      ...comparisonPayload.months[1]!,
      totalCollection: 95000,
      averagePerRecord: 650.68,
    },
  ],
  comparison: {
    ...comparisonPayload.comparison,
    targetTotal: 95000,
    difference: 24550,
    percentageChange: 34.85,
    summary: "Collection increased by RM24,550.00 (+34.85%) compared to Apr 2026.",
  },
};

const sameDayPace = buildCollectionSameDayPaceComparison({
  currentMonthKey: "2026-05",
  currentDaily: [1000, 2000, 1500, 1300, 1200, 1400, 1600, 1000, 2000]
    .map((amount, index) => ({ day: index + 1, amount })),
  previousDaily: [2000, 2200, 2100, 2000, 2300, 2200, 2100, 2000, 2100]
    .map((amount, index) => ({ day: index + 1, amount })),
  monthlyTargetAmount: 50000,
  referenceDate: new Date(2026, 4, 9, 12),
});

test("CollectionMonthlyComparisonPanel renders accessible controls and action buttons", () => {
  const markup = renderPanel({
      canFilterByNickname: true,
      availableNicknames: ["Collector Alpha", "Collector Beta"],
      selectedNickname: "Collector Alpha",
      startMonth: "2026-04",
      endMonth: "2026-05",
      loading: false,
      errorMessage: null,
      data: null,
      hasAvailableNickname: true,
      onSelectedNicknameChange: () => undefined,
      onStartMonthChange: () => undefined,
      onEndMonthChange: () => undefined,
      onApply: () => undefined,
      onRangePresetApply: () => undefined,
      onReset: () => undefined,
    });

  assert.match(markup, /Monthly Collection Comparison/);
  assert.match(markup, /id="collection-monthly-comparison-nickname"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /Choose a staff nickname|Collector Alpha/);
  assert.doesNotMatch(markup, /bg-background\/75/);
  assert.match(markup, /collection-monthly-comparison-filter-card/);
  assert.doesNotMatch(markup, /type="month"/);
  assert.match(markup, /type="text"/);
  assert.match(markup, /placeholder="YYYY-MM"/);
  assert.match(markup, /Use YYYY-MM format/);
  assert.match(markup, /Comparison setup/);
  assert.match(markup, /Same-day pacing ready/);
  assert.match(markup, />Apply</);
  assert.match(markup, />Reset</);
  assert.match(markup, /Last 3 months/);
  assert.match(markup, /Year to date/);
  assert.match(markup, /Monthly target/);
  assert.match(markup, /No target configured/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /Single nickname only/);
});

test("CollectionMonthlyComparisonPanel announces loading, errors, and empty nickname availability clearly", () => {
  const loadingMarkup = renderPanel({
      canFilterByNickname: false,
      availableNicknames: [],
      selectedNickname: "Collector Alpha",
      startMonth: "2026-04",
      endMonth: "2026-05",
      loading: true,
      errorMessage: null,
      data: null,
      hasAvailableNickname: true,
      onSelectedNicknameChange: () => undefined,
      onStartMonthChange: () => undefined,
      onEndMonthChange: () => undefined,
      onApply: () => undefined,
      onRangePresetApply: () => undefined,
      onReset: () => undefined,
    });
  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /Loading monthly comparison/);

  const errorMarkup = renderPanel({
      canFilterByNickname: true,
      availableNicknames: [],
      selectedNickname: "",
      startMonth: "2026-04",
      endMonth: "2026-05",
      loading: false,
      errorMessage: "Please choose a valid staff nickname first.",
      data: null,
      hasAvailableNickname: false,
      onSelectedNicknameChange: () => undefined,
      onStartMonthChange: () => undefined,
      onEndMonthChange: () => undefined,
      onApply: () => undefined,
      onRangePresetApply: () => undefined,
      onReset: () => undefined,
    });
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /Please choose a valid staff nickname first\./);
  assert.match(errorMarkup, /No visible staff nickname is available/);
});

test("CollectionMonthlyComparisonPanel renders monthly totals and comparison summary when data is present", () => {
  const markup = renderPanel({
      canFilterByNickname: false,
      availableNicknames: [],
      selectedNickname: "Collector Alpha",
      startMonth: "2026-04",
      endMonth: "2026-05",
      loading: false,
      errorMessage: null,
      data: comparisonPayload,
      hasAvailableNickname: true,
      onSelectedNicknameChange: () => undefined,
      onStartMonthChange: () => undefined,
      onEndMonthChange: () => undefined,
      onApply: () => undefined,
      onRangePresetApply: () => undefined,
      onReset: () => undefined,
      monthlyTargetAmount: 80000,
      monthlyTargetSourceLabel: "May 2026",
      sameDayPace,
      sameDayPaceDayRange: { startDay: 1, endDay: 30 },
      sameDayPaceMaxDay: 30,
      onSameDayPaceDayRangeChange: () => undefined,
      onSameDayPaceComparisonModeChange: () => undefined,
      onExportCsv: () => undefined,
      onPrintReport: () => undefined,
      onMonthSelect: () => undefined,
      chartSlot: createElement("div", null, "chart slot"),
    });

  assert.match(markup, /Collection increased by RM12,450\.00 \(\+17\.67%\) compared to Apr 2026\./);
  assert.match(markup, /Apr 2026 Total/);
  assert.match(markup, /May 2026 Total/);
  assert.match(markup, /\+RM(?:&nbsp;|\u00a0| )12,450\.00/);
  assert.match(markup, /\+17\.67%/);
  assert.match(markup, /Range total/);
  assert.match(markup, /Best month/);
  assert.match(markup, /Weakest active/);
  assert.match(markup, /Biggest jump/);
  assert.match(markup, /Biggest drop/);
  assert.match(markup, /Audit watch/);
  assert.match(markup, /No anomaly/);
  assert.match(markup, /Trend explanation/);
  assert.match(markup, /average per record dipped slightly/);
  assert.match(markup, /Same-day collection pace/);
  assert.match(markup, /31\.6% slower than previous month/);
  assert.match(markup, /May 1 to May 30, 2026 vs April 1 to April 30, 2026/);
  assert.match(markup, /Pilih compare day/);
  assert.match(markup, /Banding dengan/);
  assert.match(markup, /Hari sama bulan lepas/);
  assert.match(markup, /Hari sama tahun lepas/);
  assert.match(markup, /Today/);
  assert.match(markup, /Yesterday/);
  assert.match(markup, /Current day-of-month/);
  assert.match(markup, /End-of-month simulation/);
  assert.match(markup, /Hari terakhir ada kutipan/);
  assert.match(markup, /Hari terbaik bulan ini/);
  assert.match(markup, /Jumlah sampai hari dipilih/);
  assert.match(markup, /Smart insights/);
  assert.match(markup, /Target pace/);
  assert.match(markup, /Benchmark lens/);
  assert.match(markup, /Previous/);
  assert.match(markup, /Last year/);
  assert.match(markup, /3-mo avg/);
  assert.match(markup, /Range avg/);
  assert.match(markup, /Target gap/);
  assert.match(markup, /Configured for May 2026/);
  assert.match(markup, /Superuser target active/);
  assert.match(markup, /1 month\(s\) at target/);
  assert.match(markup, /Data quality/);
  assert.match(markup, /Print report/);
  assert.match(markup, /Export CSV/);
  assert.match(markup, /month\(s\) up/);
  assert.match(markup, /Monthly breakdown/);
  assert.match(markup, /Expand/);
  assert.match(markup, /2\/2 active/);
  assert.match(markup, /Latest/);
  assert.match(markup, /chart slot/);
});

test("CollectionMonthlyComparisonPanel highlights anomaly months for audit review", () => {
  const markup = renderPanel({
      canFilterByNickname: false,
      availableNicknames: [],
      selectedNickname: "Collector Alpha",
      startMonth: "2026-04",
      endMonth: "2026-05",
      loading: false,
      errorMessage: null,
      data: anomalyPayload,
      hasAvailableNickname: true,
      onSelectedNicknameChange: () => undefined,
      onStartMonthChange: () => undefined,
      onEndMonthChange: () => undefined,
      onApply: () => undefined,
      onRangePresetApply: () => undefined,
      onReset: () => undefined,
      onMonthSelect: () => undefined,
    });

  assert.match(markup, /1 anomaly month\(s\)/);
  assert.match(markup, /Unusual jump \+34\.85% vs previous month/);
  assert.match(markup, /1 flagged/);
});
