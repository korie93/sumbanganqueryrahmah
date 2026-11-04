import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoHint } from "./InfoHint";
import { MonitorAlertsSection } from "./MonitorAlertsSection";
import { MonitorMetricsSection } from "./MonitorMetricsSection";

function render(child: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(TooltipProvider, null, child));
}

function assertNoNestedButtons(html: string) {
  let depth = 0;
  for (const [tag] of html.matchAll(/<\/?button\b[^>]*>/g)) {
    if (tag.startsWith("</")) depth -= 1;
    else { depth += 1; assert.equal(depth, 1, "help controls must be siblings of disclosure buttons"); }
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0);
}

test("Alerts disclosure and its help trigger render as separate named buttons in either expanded state", () => {
  const pagination = { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 };
  for (const open of [false, true]) {
    const html = render(createElement(MonitorAlertsSection, {
      alertsOpen: open, onAlertsOpenChange() {}, alertHistoryOpen: false, onAlertHistoryOpenChange() {},
      alerts: [], alertsPage: 1, alertsPagination: pagination, onAlertsPageChange() {},
      alertHistory: [], alertHistoryPage: 1, alertHistoryPagination: pagination, onAlertHistoryPageChange() {},
      canDeleteHistory: false, deleteHistoryBusy: false, onDeleteOldHistory() {},
    }));
    assertNoNestedButtons(html);
    assert.match(html, /data-testid="monitor-alerts-toggle"/);
    assert.match(html, new RegExp(`aria-expanded="${open}"`));
    assert.match(html, /aria-label="Maklumat bantuan Active Alerts"/);
  }
});

test("Metrics group help stays outside both open and closed disclosure buttons", () => {
  const html = render(createElement(MonitorMetricsSection, {
    embedded: true,
    metricGroups: [
      { title: "Infrastructure", description: "Synthetic infrastructure guidance", items: [] },
      { title: "Application", description: "Synthetic application guidance", items: [] },
    ],
  }));
  assertNoNestedButtons(html);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Maklumat bantuan Infrastructure"/);
  assert.match(html, /aria-label="Maklumat bantuan Application"/);
});

test("shared help retains keyboard button semantics, contextual naming and at least a 24px hit area", () => {
  const html = render(createElement(InfoHint, { text: "Synthetic help text", label: "Help for synthetic metric" }));
  assert.match(html, /<button\b[^>]*type="button"/);
  assert.match(html, /aria-label="Help for synthetic metric"/);
  assert.match(html, /h-8 w-8/);
  assert.match(html, /sm:h-6 sm:w-6/);
  assert.doesNotMatch(html, /tabindex="-1"|disabled=""/);
});
