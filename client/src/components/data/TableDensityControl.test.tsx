import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TableDensityControl } from "@/components/data/TableDensityControl";

test("table density control exposes an accessible exclusive choice", () => {
  const markup = renderToStaticMarkup(
    createElement(TableDensityControl, {
      ariaLabel: "Viewer row density",
      testIdPrefix: "viewer",
      value: "compact",
      onChange: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Viewer row density"/);
  assert.match(markup, /aria-label="Comfortable row spacing"/);
  assert.match(markup, /aria-label="Compact row spacing"/);
  assert.match(markup, /data-testid="viewer-density-control"/);
  assert.match(markup, /data-testid="viewer-density-compact"/);
});
