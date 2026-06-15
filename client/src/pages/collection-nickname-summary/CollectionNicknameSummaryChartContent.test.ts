import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionNicknameSummaryChartContent } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartContent";

test("CollectionNicknameSummaryChartContent renders accessible chart context from table totals", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartContent, {
      nicknameTotals: [
        {
          nickname: "Collector Alpha With A Long Nickname",
          totalAmount: 750,
          totalRecords: 3,
        },
        { nickname: "Collector Beta", totalAmount: 250, totalRecords: 1 },
      ],
      totalAmount: 1_000,
      totalRecords: 4,
    }),
  );

  assert.match(markup, /role="region"/);
  assert.match(markup, /role="img"/);
  assert.match(markup, /Nickname summary bar chart for 2 nicknames/);
  assert.match(markup, /Chart total/);
  assert.match(markup, /Highest/);
  assert.match(markup, /Nickname summary chart data/);
  assert.match(markup, /Collector Alpha With A Long Nickname/);
  assert.match(markup, /75\.0% of total/);
  assert.match(markup, /tabindex="0"/);
});

test("CollectionNicknameSummaryChartContent renders explicit empty and zero states", () => {
  const emptyMarkup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartContent, {
      nicknameTotals: [],
      totalAmount: 0,
      totalRecords: 0,
    }),
  );
  assert.match(emptyMarkup, /role="status"/);
  assert.match(emptyMarkup, /No nickname collection data/);
  assert.doesNotMatch(emptyMarkup, /role="img"/);

  const zeroMarkup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryChartContent, {
      nicknameTotals: [
        { nickname: "Collector Alpha", totalAmount: 0, totalRecords: 2 },
      ],
      totalAmount: 0,
      totalRecords: 2,
    }),
  );
  assert.match(zeroMarkup, /No collection amount to chart/);
  assert.match(zeroMarkup, /2 record\(s\)/);
  assert.doesNotMatch(zeroMarkup, /role="img"/);
});
