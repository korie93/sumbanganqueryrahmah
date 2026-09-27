import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CollectionMonthlyComparisonDataQualityCard } from "./CollectionMonthlyComparisonDataQualityCard";
import type { CollectionMonthlyComparisonDataQualitySummary } from "./collection-monthly-comparison-utils";

const render = (dataQualitySummary: CollectionMonthlyComparisonDataQualitySummary | null) => renderToStaticMarkup(
  createElement(TooltipProvider, null, createElement(CollectionMonthlyComparisonDataQualityCard, { dataQualitySummary })),
);

test("monthly quality status preserves text and review count with semantic contrast colors", () => {
  for (const [tone, color] of [["success", "success"], ["warning", "warning"], ["danger", "destructive"], ["info", "warning"]] as const) {
    const summary: CollectionMonthlyComparisonDataQualitySummary = {
      statusLabel: "Needs review",
      statusTone: tone,
      warningCount: 2,
      signals: [],
    };
    const markup = render(summary);
    assert.match(markup, /Needs review/);
    assert.match(markup, />2 review<\/span>/);
    const badge = markup.match(/<span class="([^"]+)">2 review<\/span>/)?.[1];
    assert.ok(badge);
    assert.ok(badge.includes(`bg-${color}/10`));
    assert.ok(badge.includes(`text-${color}`));
    assert.doesNotMatch(badge, /(?:amber|emerald)-\d|dark:text-/);
  }
});

test("monthly quality diagnostics keep four original signals and escape supplied text", () => {
  const markup = render({
    statusLabel: "Synthetic check",
    statusTone: "warning",
    warningCount: 5,
    signals: Array.from({ length: 5 }, (_, index) => ({
      id: String(index), label: `Signal ${index}`, description: `<script>signal-${index}</script>`, tone: "warning",
    })),
  });
  assert.match(markup, /Signal 3/);
  assert.doesNotMatch(markup, /Signal 4|<script>/);
  assert.match(markup, /&lt;script&gt;signal-3&lt;\/script&gt;/);
  assert.match(markup, />5 review<\/span>/);
  assert.equal(render(null), "");
});
