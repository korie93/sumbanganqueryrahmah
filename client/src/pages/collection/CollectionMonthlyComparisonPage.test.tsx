import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CollectionMonthlyComparisonPage from "@/pages/collection/CollectionMonthlyComparisonPage";

test("CollectionMonthlyComparisonPage renders a dedicated monthly comparison workspace", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionMonthlyComparisonPage, {
      role: "admin",
      staffNickname: "Collector Alpha",
    }),
  );

  assert.match(markup, /Monthly Collection Comparison/);
  assert.match(markup, /Compare the trend and exact amounts in one view/);
  assert.match(markup, /Loading visible nickname options/);
  assert.equal((markup.match(/id="collection-monthly-comparison-title"/g) || []).length, 1);
  assert.doesNotMatch(markup, /shadow-sm|rounded-2xl/);
});
