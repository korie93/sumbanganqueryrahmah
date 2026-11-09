import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AIQueryLimit, getAIQueryLimitAnnouncement } from "./AIQueryLimit";

test("live limit text changes only when crossing a meaningful band", () => {
  for (const remaining of [3000, 2999, 201]) assert.equal(getAIQueryLimitAnnouncement(remaining), "");
  for (const remaining of [200, 199, 123, 51]) assert.equal(getAIQueryLimitAnnouncement(remaining), "Baki soalan AI 200 aksara atau kurang.");
  for (const remaining of [50, 49, 1]) assert.equal(getAIQueryLimitAnnouncement(remaining), "Baki soalan AI 50 aksara atau kurang.");
  assert.equal(getAIQueryLimitAnnouncement(0), "Had soalan AI telah dicapai.");
});

test("the input description stays static while only the visual counter changes per key", () => {
  const render = (remaining: number) => renderToStaticMarkup(createElement(AIQueryLimit, {
    value: "a".repeat(3000 - remaining), descriptionId: "query-limit", className: "test-counter",
  }));
  for (const remaining of [3000, 199, 198, 50, 0]) {
    const markup = render(remaining);
    assert.match(markup, /<p id="query-limit" class="sr-only">Had soalan AI 3000 aksara\.<\/p>/);
    assert.match(markup, /aria-live="polite" aria-atomic="true" data-ai-limit-announcement="true"/);
    if (remaining <= 200) assert.ok(markup.includes(`aria-hidden="true" data-ai-limit-counter="true">Had soalan AI 3000 aksara. ${remaining} aksara berbaki.`));
    else assert.doesNotMatch(markup, /data-ai-limit-counter/);
  }
  const announcement = (remaining: number) => render(remaining).match(/data-ai-limit-announcement="true">([^<]*)<\/span>/)?.[1];
  assert.equal(announcement(199), announcement(198));
  assert.notEqual(announcement(51), announcement(50));
});
