import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";

test("PanelErrorBoundary renders an isolated recovery fallback", () => {
  const boundary = new PanelErrorBoundary({
    boundaryKey: "collections:records",
    panelLabel: "Rekod Collection",
    children: createElement("div", null, "ok"),
  });

  boundary.state = {
    error: new Error("boom"),
    boundaryKey: "collections:records",
  };

  const markup = renderToStaticMarkup(boundary.render());
  assert.match(markup, /Rekod Collection tidak dapat dimuatkan/i);
  assert.match(markup, /Cuba semula panel/i);
});
