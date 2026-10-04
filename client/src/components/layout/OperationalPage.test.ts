import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { OperationalMetric, OperationalPage, OperationalPageHeader, OperationalSectionCard } from "./OperationalPage";

test("operational page provides bounded form and report widths without changing existing pages", () => {
  for (const [width, widthClass] of [
    ["form", "max-w-[1120px]"],
    ["report", "max-w-[1480px]"],
    ["content", "max-w-7xl"],
    ["wide", "max-w-[1680px]"],
  ] as const) {
    const markup = renderToStaticMarkup(createElement(OperationalPage, {
      width,
      className: "collection-report-frame",
      children: createElement("p", null, "Page content"),
    }));
    assert.ok(markup.includes(widthClass));
    assert.match(markup, /ops-page-frame/);
    assert.match(markup, /collection-report-frame/);
    assert.match(markup, /<p>Page content<\/p>/);
  }

  const defaultMarkup = renderToStaticMarkup(createElement(OperationalPage, {
    children: "Existing page",
  }));
  assert.ok(defaultMarkup.includes("max-w-[1680px]"));
});

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
