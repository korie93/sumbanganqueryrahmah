import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { CollectionMonthlyComparisonPanel } from "@/pages/collection-summary/CollectionMonthlyComparisonPanel";

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

test("CollectionMonthlyComparisonPanel renders accessible controls and action buttons", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionMonthlyComparisonPanel, {
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
      onReset: () => undefined,
    }),
  );

  assert.match(markup, /Monthly Collection Comparison/);
  assert.match(markup, /id="collection-monthly-comparison-nickname"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /Choose a staff nickname|Collector Alpha/);
  assert.doesNotMatch(markup, /bg-background\/75/);
  assert.match(markup, /rounded-2xl border border-border\/60 bg-background/);
  assert.match(markup, /type="month"/);
  assert.match(markup, />Apply</);
  assert.match(markup, />Reset</);
  assert.match(markup, /type="button"/);
  assert.match(markup, /Single nickname only/);
});

test("CollectionMonthlyComparisonPanel announces loading, errors, and empty nickname availability clearly", () => {
  const loadingMarkup = renderToStaticMarkup(
    createElement(CollectionMonthlyComparisonPanel, {
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
      onReset: () => undefined,
    }),
  );
  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /Loading monthly comparison/);

  const errorMarkup = renderToStaticMarkup(
    createElement(CollectionMonthlyComparisonPanel, {
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
      onReset: () => undefined,
    }),
  );
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /Please choose a valid staff nickname first\./);
  assert.match(errorMarkup, /No visible staff nickname is available/);
});

test("CollectionMonthlyComparisonPanel renders monthly totals and comparison summary when data is present", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionMonthlyComparisonPanel, {
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
      onReset: () => undefined,
      chartSlot: createElement("div", null, "chart slot"),
    }),
  );

  assert.match(markup, /Collection increased by RM12,450\.00 \(\+17\.67%\) compared to Apr 2026\./);
  assert.match(markup, /Apr 2026 Total/);
  assert.match(markup, /May 2026 Total/);
  assert.match(markup, /\+RM(?:&nbsp;|\u00a0| )12,450\.00/);
  assert.match(markup, /\+17\.67%/);
  assert.match(markup, /Avg RM(?:&nbsp;|\u00a0| )572\.76/);
  assert.match(markup, /chart slot/);
});
