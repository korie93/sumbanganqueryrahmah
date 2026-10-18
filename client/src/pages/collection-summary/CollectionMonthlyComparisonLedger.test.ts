import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { CollectionMonthlyComparisonLedger } from "./CollectionMonthlyComparisonLedger";

type LedgerProps = ComponentProps<typeof CollectionMonthlyComparisonLedger>;

function payload(totals: number[]): CollectionMonthlyComparisonResponse {
  const months = totals.map((totalCollection, index) => {
    const date = new Date(2025, index, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const recordCount = totalCollection > 0 ? index + 1 : 0;
    return {
      month,
      label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      totalCollection,
      recordCount,
      averagePerRecord: recordCount > 0 ? totalCollection / recordCount : 0,
    };
  });
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const difference = months.length > 1 ? last.totalCollection - first.totalCollection : null;
  return {
    ok: true,
    nickname: "Synthetic Ledger Collector",
    startMonth: first.month,
    endMonth: last.month,
    months,
    comparison: {
      baseMonth: months.length > 1 ? first.month : null,
      targetMonth: last.month,
      baseLabel: months.length > 1 ? first.label : null,
      targetLabel: last.label,
      baseTotal: months.length > 1 ? first.totalCollection : null,
      targetTotal: last.totalCollection,
      difference,
      percentageChange: difference === null || first.totalCollection === 0
        ? null : difference / first.totalCollection * 100,
      direction: difference === null ? "no_previous_data"
        : difference > 0 ? "increase" : difference < 0 ? "decrease" : "no_change",
      summary: "Synthetic first-to-last comparison.",
    },
  };
}

function render(data: CollectionMonthlyComparisonResponse, props: Partial<Omit<LedgerProps, "data">> = {}) {
  return renderToStaticMarkup(createElement(CollectionMonthlyComparisonLedger, { data, ...props }));
}

function rows(markup: string) {
  return [...markup.matchAll(/<tr\b[^>]*\bdata-month="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g)]
    .map(([html, month]) => ({ html, month }));
}

test("monthly visual ledger is one semantic chronological table with exact values and drill-down buttons", () => {
  const markup = render(payload([1000, 1500, 1200]), { onMonthSelect: () => undefined });
  assert.equal((markup.match(/<table\b/g) || []).length, 1);
  assert.match(markup, /<caption[^>]*>Monthly collection performance<\/caption>/);
  assert.match(markup, /<thead\b/);
  assert.match(markup, /scope="col"/);
  const renderedRows = rows(markup);
  assert.deepEqual(renderedRows.map((row) => row.month), ["2025-01", "2025-02", "2025-03"]);
  assert.match(renderedRows[0]!.html, /1,000\.00/);
  assert.match(renderedRows[1]!.html, /1,500\.00/);
  assert.match(renderedRows[2]!.html, /1,200\.00/);
  assert.match(renderedRows[1]!.html, /\+50(?:\.0+)?%/);
  assert.match(renderedRows[2]!.html, /[−-]20(?:\.0+)?%/);
  for (const month of ["Jan 2025", "Feb 2025", "Mar 2025"]) {
    assert.ok(markup.includes(`aria-label="View collection records for ${month}"`));
  }
  const progress = [...markup.matchAll(/<progress\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(progress.filter((tag) => /\bmonthly-comparison-ledger-bar\b/.test(tag)).length, 3);
  assert.equal(progress.filter((tag) => /\bmonthly-comparison-ledger-mobile-bar\b/.test(tag)).length, 3);
  for (const tag of progress) assert.match(tag, /aria-hidden="true"/);
  assert.doesNotMatch(markup, /<tfoot[^>]*>[\s\S]*?<progress\b/);
});

test("monthly ledger preserves empty months and does not invent percentage growth from zero", () => {
  const markup = render(payload([0, 1000, 0, 0]));
  const renderedRows = rows(markup);
  assert.equal(renderedRows.length, 4);
  assert.match(renderedRows[0]!.html, /0\.00/);
  assert.match(renderedRows[1]!.html, /1,000\.00/);
  assert.doesNotMatch(renderedRows[1]!.html, /\+100(?:\.0+)?%|Infinity|NaN/);
  assert.match(renderedRows[2]!.html, /[−-]100(?:\.0+)?%/);
  assert.doesNotMatch(markup, /Infinity|NaN|undefined/);
});

test("monthly ledger handles a single month and the full supported 24-month range without hiding rows", () => {
  const single = render(payload([0]));
  assert.equal(rows(single).length, 1);
  assert.doesNotMatch(single, /Infinity|NaN/);
  const full = render(payload(Array.from({ length: 24 }, (_, index) => (index + 1) * 1000)));
  const renderedRows = rows(full);
  assert.equal(renderedRows.length, 24);
  assert.equal(renderedRows[0]!.month, "2025-01");
  assert.equal(renderedRows[23]!.month, "2026-12");
  assert.doesNotMatch(full, /Infinity|NaN/);
});

test("monthly ledger tolerates missing and loading targets and escapes supplied labels", () => {
  const data = payload([1000, 1500]);
  data.months[0]!.label = '<script>alert("not executed")</script>';
  for (const props of [
    { monthlyTargetAmount: null, monthlyTargetsByMonth: {} },
    { monthlyTargetLoading: true, monthlyTargetSourceLabel: "Synthetic target month" },
    { monthlyTargetsByMonth: { "2025-01": 2000, "2025-02": null } },
  ]) {
    const markup = render(data, props);
    assert.equal(rows(markup).length, 2);
    assert.doesNotMatch(markup, /<script>|Infinity|NaN|undefined/);
    assert.match(markup, /&lt;script&gt;/);
  }
});

test("monthly ledger keeps large collection amounts exact on the shared desktop and mobile scale", () => {
  const markup = render(payload([1234567890.12, 2469135780.24]), { monthlyTargetAmount: 3000000000 });
  assert.match(markup, /1,234,567,890\.12/);
  assert.match(markup, /2,469,135,780\.24/);
  assert.match(markup, /3,703,703,670\.36/);
  const progress = [...markup.matchAll(/<progress\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(progress.length, 4);
  for (const tag of progress) {
    assert.match(tag, /max="3000000000"/);
    assert.match(tag, /aria-hidden="true"/);
  }
  assert.doesNotMatch(markup, /Infinity|NaN|undefined/);
});
