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
  assert.match(markup, /One nickname, one compact monthly view/);
  assert.match(markup, /24 months max/);
  assert.match(markup, /First vs last/);
  assert.match(markup, /Empty months stay visible/);
});
