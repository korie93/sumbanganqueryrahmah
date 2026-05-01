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
  assert.match(markup, /Focus on one nickname at a time/);
  assert.match(markup, /Choose a range/);
  assert.match(markup, /Review the change/);
  assert.match(markup, /Read the trend/);
});
