import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CollectionMonthlyComparisonSetupCard } from "./CollectionMonthlyComparisonSetupCard";

type Props = ComponentProps<typeof CollectionMonthlyComparisonSetupCard>;
const noop = () => undefined;
const defaults: Props = {
  availableNicknames: ["Synthetic Alpha"], canFilterByNickname: false,
  selectedNickname: "Synthetic Alpha", startMonth: "2026-08", endMonth: "2026-09",
  data: {
    ok: true, nickname: "Synthetic Alpha", startMonth: "2026-08", endMonth: "2026-09",
    months: [], comparison: {
      baseMonth: "2026-08", targetMonth: "2026-09", baseLabel: "Aug 2026", targetLabel: "Sep 2026",
      baseTotal: 0, targetTotal: 0, difference: 0, percentageChange: null,
      direction: "no_previous_data", summary: "No collection records.",
    },
  },
  hasAvailableNickname: true, loading: false, rangePresets: [], targetSummary: null,
  onApply: noop, onEndMonthChange: noop, onExportCsv: noop, onPrintReport: noop,
  onRangePresetApply: noop, onReset: noop, onSelectedNicknameChange: noop, onStartMonthChange: noop,
};

function render(overrides: Partial<Props> = {}) {
  return renderToStaticMarkup(createElement(TooltipProvider, {
    children: createElement(CollectionMonthlyComparisonSetupCard, { ...defaults, ...overrides }),
  }));
}

function exportButtons(markup: string) {
  return [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(([button]) => button).filter((button) => /Print report|Export CSV/.test(button));
}

test("monthly exports describe loaded data, not edited nickname or dates", () => {
  const markup = render({ selectedNickname: "Synthetic Beta", startMonth: "2026-01", endMonth: "2026-03" });
  assert.match(markup, /Export \/ print scope: 2026-08 to 2026-09 · Synthetic Alpha\./);
  assert.match(markup, /Uses the last loaded report\. Apply changed filters to update the export\./);
  assert.doesNotMatch(markup, /Export \/ print scope: 2026-01/);
  const buttons = exportButtons(markup);
  assert.equal(buttons.length, 2);
  const contextId = markup.match(/id="([^"]+)" data-testid="monthly-comparison-export-context"/)?.[1];
  assert.ok(contextId);
  for (const button of buttons) {
    assert.ok(button.includes(`aria-describedby="${contextId}"`));
    assert.doesNotMatch(button, /disabled=/);
  }
});

test("matching applied filters do not add unnecessary warnings, including empty reports", () => {
  const markup = render({ selectedNickname: " synthetic alpha " });
  assert.match(markup, /Export \/ print scope:/);
  assert.doesNotMatch(markup, /Apply changed filters|before exporting/);
  for (const button of exportButtons(markup)) assert.doesNotMatch(button, /disabled=/);
});

test("monthly disabled actions explain existing comparison, target and data gates visibly", () => {
  const cases: Array<[Partial<Props>, RegExp]> = [
    [{ loading: true, monthlyTargetLoading: true }, /Wait for the monthly comparison/],
    [{ monthlyTargetLoading: true }, /Wait for the monthly targets/],
    [{ data: null }, /Load a comparison with Apply/],
    [{ data: null, hasAvailableNickname: false }, /A staff nickname visible to your account is required/],
  ];
  for (const [props, message] of cases) {
    const markup = render(props);
    assert.match(markup, message);
    assert.match(markup, /<p role="status">/);
    const buttons = exportButtons(markup);
    assert.equal(buttons.length, 2);
    for (const button of buttons) assert.match(button, /disabled=""/);
    if (props.data === null) assert.doesNotMatch(markup, /Export \/ print scope:/);
  }
});

test("monthly scope escapes server-provided text and disappears when export actions are absent", () => {
  assert.ok(defaults.data);
  const markup = render({ data: { ...defaults.data, nickname: "<script>unsafe</script>" } });
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  const hidden = render({ onExportCsv: undefined, onPrintReport: undefined });
  assert.doesNotMatch(hidden, /monthly-comparison-export-context/);
});
