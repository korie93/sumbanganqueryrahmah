import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "@/components/BrandLogo";

test("BrandLogo renders decorative marks without duplicate announcements", () => {
  const markup = renderToStaticMarkup(
    createElement(BrandLogo, {
      decorative: true,
      priority: true,
    }),
  );

  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /alt=""/);
  assert.match(markup, /role="presentation"/);
  assert.doesNotMatch(markup, /SQR System logo/);
});

test("BrandLogo keeps a semantic accessible name when not decorative", () => {
  const markup = renderToStaticMarkup(
    createElement(BrandLogo, {
      alt: "SQR operasi",
    }),
  );

  assert.match(markup, /alt="SQR operasi"/);
  assert.doesNotMatch(markup, /aria-hidden="true"/);
  assert.doesNotMatch(markup, /role="presentation"/);
});
