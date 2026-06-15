import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionNicknameBatchSections } from "@/pages/collection-nickname-summary/CollectionNicknameBatchSections";

test("CollectionNicknameBatchSections renders totals before the optional chart control", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameBatchSections, {
      loading: false,
      hasApplied: true,
      selectedNicknames: ["Collector Alpha", "Collector Beta"],
      fromDate: "2026-06-01",
      toDate: "2026-06-15",
      chartResetKey: "scope-a",
      totalAmount: 1_000,
      totalRecords: 4,
      nicknameTotals: [
        { nickname: "Collector Alpha", totalAmount: 750, totalRecords: 3 },
        { nickname: "Collector Beta", totalAmount: 250, totalRecords: 1 },
      ],
    }),
  );

  const totalsIndex = markup.indexOf("TOTAL COLLECTION");
  const chartButtonIndex = markup.indexOf("Lihat Graf Nickname Summary");

  assert.ok(totalsIndex >= 0);
  assert.ok(chartButtonIndex > totalsIndex);
  assert.doesNotMatch(markup, /Nickname Summary Chart/);
});
