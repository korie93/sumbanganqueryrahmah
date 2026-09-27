import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { highlightMatch } from "../utils";

test("search highlights retain exact case-insensitive matching with explicit semantic contrast", () => {
  const markup = renderToStaticMarkup(highlightMatch("Synthetic Card Customer CARD", "card"));
  assert.equal((markup.match(/<mark /g) || []).length, 2);
  assert.match(markup, /class="rounded bg-warning\/15 px-0.5 text-foreground">Card<\/mark>/);
  assert.match(markup, /class="rounded bg-warning\/15 px-0.5 text-foreground">CARD<\/mark>/);
  assert.match(markup, /Synthetic /);
  assert.match(markup, / Customer /);
  assert.doesNotMatch(markup, /yellow-\d|dark:bg-/);
});

test("search highlights preserve regex characters, escaping, leading zeroes and the empty query", () => {
  assert.equal(renderToStaticMarkup(highlightMatch("00001234", "")), "00001234");
  const markup = renderToStaticMarkup(highlightMatch("0000(A+B)<script>", "(A+B)"));
  assert.match(markup, /^0000<mark /);
  assert.match(markup, />\(A\+B\)<\/mark>&lt;script&gt;$/);
  assert.doesNotMatch(markup, /<script>/);
});
