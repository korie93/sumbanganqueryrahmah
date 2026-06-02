import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyCalendarLegend } from "@/pages/collection/CollectionDailyCalendarLegend";

test("CollectionDailyCalendarLegend explains result colors and leave codes", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarLegend, {
      isMobile: false,
    }),
  );

  assert.match(markup, /No collection recorded/);
  assert.match(markup, /Daily status codes/);
  assert.match(markup, /WORK/);
  assert.match(markup, /Working/);
  assert.match(markup, /AL/);
  assert.match(markup, /Annual Leave/);
  assert.match(markup, /OFF/);
  assert.match(markup, /Company Closed/);
  assert.match(markup, /text-emerald-800/);
  assert.doesNotMatch(markup, /bg-primary/);
  assert.doesNotMatch(markup, /primary-foreground/);
});

test("CollectionDailyCalendarLegend keeps mobile legend badges readable in light mode", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarLegend, {
      isMobile: true,
    }),
  );

  assert.match(markup, /text-rose-700/);
  assert.match(markup, /text-emerald-800/);
  assert.doesNotMatch(markup, /bg-primary/);
  assert.doesNotMatch(markup, /primary-foreground/);
});
