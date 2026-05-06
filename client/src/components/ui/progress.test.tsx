import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Progress } from "./progress";

test("Progress renders without a style attribute so CSP can block inline style attrs", () => {
  const markup = renderToStaticMarkup(createElement(Progress, { value: 42 }));

  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /transform:var\(--sqr-progress-indicator-transform,translateX\(-100%\)\)/);
  assert.doesNotMatch(markup, /\sstyle="/);
});
