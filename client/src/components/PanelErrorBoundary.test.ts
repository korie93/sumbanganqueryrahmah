import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";
import { assertNoAccessibilityViolations } from "@/test-utils/axe";

test("PanelErrorBoundary renders an isolated recovery fallback", () => {
  const boundary = new PanelErrorBoundary({
    boundaryKey: "collections:records",
    panelLabel: "Rekod Collection",
    children: createElement("div", null, "ok"),
  });

  boundary.state = {
    error: new Error("boom"),
    boundaryKey: "collections:records",
    failureCount: 3,
  };

  const markup = renderToStaticMarkup(boundary.render());
  assert.match(markup, /Rekod Collection tidak dapat dimuatkan/i);
  assert.match(markup, /Cuba semula panel/i);
  assert.match(markup, /sudah gagal beberapa kali/i);
});

test("PanelErrorBoundary fallback remains accessible", async () => {
  const boundary = new PanelErrorBoundary({
    boundaryKey: "collections:records",
    panelLabel: "Rekod Collection",
    children: createElement("div", null, "ok"),
  });

  boundary.state = {
    error: new Error("boom"),
    boundaryKey: "collections:records",
    failureCount: 1,
  };

  const markup = renderToStaticMarkup(
    createElement("main", { "aria-label": "Panel boundary preview" }, boundary.render()),
  );

  await assertNoAccessibilityViolations(`<!doctype html><html lang="ms"><body>${markup}</body></html>`);
});
