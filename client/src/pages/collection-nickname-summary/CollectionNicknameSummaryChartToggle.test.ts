import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionNicknameSummaryChartToggle } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartToggle";

test("CollectionNicknameSummaryChartToggle keeps the chart hidden until requested", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartToggle, {
      fromDate: "2026-06-01",
      toDate: "2026-06-15",
      nicknameTotals: [
        { nickname: "Collector Alpha", totalAmount: 750, totalRecords: 3 },
        { nickname: "Collector Beta", totalAmount: 250, totalRecords: 1 },
      ],
      totalAmount: 1_000,
      totalRecords: 4,
    }),
  );

  assert.match(markup, /Lihat Graf Nickname Summary/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /Nickname Summary Chart/);
  assert.doesNotMatch(markup, /recharts/);
});

test("CollectionNicknameSummaryChartToggle is omitted when there are no nickname totals", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartToggle, {
      fromDate: "2026-06-01",
      toDate: "2026-06-15",
      nicknameTotals: [],
      totalAmount: 0,
      totalRecords: 0,
    }),
  );

  assert.equal(markup, "");
});
