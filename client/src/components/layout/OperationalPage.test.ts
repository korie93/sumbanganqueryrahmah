import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { OperationalMetric, OperationalPageHeader, OperationalSectionCard } from "./OperationalPage";

test("operational page heading keeps context and actions without a nested card", () => {
  const markup = renderToStaticMarkup(createElement(OperationalPageHeader, {
    title: "Collection records",
    description: "Review saved records.",
    eyebrow: "Collection",
    badge: createElement("span", null, "Live"),
    actions: createElement("button", { type: "button" }, "Export"),
  }));
  assert.match(markup, /^<header/);
  assert.match(markup, /<h1 class="ops-page-title">Collection records<\/h1>/);
  assert.match(markup, /Review saved records\./);
  assert.match(markup, /<button type="button">Export<\/button>/);
  assert.match(markup, />Live<\/span>/);
  assert.match(markup, /class="min-w-0 max-w-full"><span>Live/);
  assert.doesNotMatch(markup, /shadcn-card/);
});

test("operational section retains content, heading and action semantics", () => {
  const markup = renderToStaticMarkup(createElement(OperationalSectionCard, {
    title: "Results",
    actions: createElement("button", { type: "button" }, "Refresh"),
    children: createElement("p", null, "00012345678901234567"),
  }));
  assert.match(markup, /role="heading" aria-level="2"/);
  assert.match(markup, /text-lg/);
  assert.match(markup, />Refresh<\/button>/);
  assert.match(markup, /00012345678901234567/);
});

test("metric status has a visible label and semantic color without transforming values", () => {
  for (const [tone, token] of [["success", "success"], ["warning", "warning"], ["danger", "destructive"]] as const) {
    const markup = renderToStaticMarkup(createElement(OperationalMetric, {
      tone,
      label: "Reviewed records",
      value: "00123",
      supporting: "Checked today",
    }));
    assert.ok(markup.includes("text-" + token));
    assert.match(markup, />Reviewed records<\/p>/);
    assert.match(markup, />00123<\/p>/);
    assert.match(markup, />Checked today<\/p>/);
  }
});
