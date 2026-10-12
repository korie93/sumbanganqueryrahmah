import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "@/components/BrandLogo";
import { SQR_BRAND_ASSETS, SQR_BRAND_DIMENSIONS } from "@shared/brand-assets";

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

for (const variant of ["full", "icon"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`BrandLogo ${variant}/${theme} uses approved artwork and intrinsic ratio`, () => {
      const markup = renderToStaticMarkup(createElement(BrandLogo, { variant, theme, priority: true }));
      assert.ok(markup.includes(`src="${SQR_BRAND_ASSETS[variant][theme]}"`));
      assert.ok(markup.includes(`width="${SQR_BRAND_DIMENSIONS[variant].width}"`));
      assert.ok(markup.includes(`height="${SQR_BRAND_DIMENSIONS[variant].height}"`));
      assert.equal((markup.match(/<img\b/g) ?? []).length, 1);
      assert.match(markup, /loading="eager"/);
      assert.doesNotMatch(markup, /webp|sqr-logo-minimal/);
    });
  }
}

test("automatic branding contains both themes without mounting a theme controller", () => {
  const markup = renderToStaticMarkup(createElement(BrandLogo, { variant: "full", alt: " " }));
  assert.match(markup, /data-brand-theme="auto"/);
  for (const theme of ["light", "dark"] as const) assert.ok(markup.includes(SQR_BRAND_ASSETS.full[theme]));
  assert.match(markup, /alt="Sumbangan Query Rahmah \(SQR\)"/);
  assert.match(markup, /loading="lazy"/);
});

test("the default compact Q includes the supplied light and dark images for surface-aware selection", () => {
  const markup = renderToStaticMarkup(createElement(BrandLogo));
  assert.match(markup, /data-brand-theme="auto"/);
  assert.ok(markup.includes(`src="${SQR_BRAND_ASSETS.icon.dark}"`));
  assert.ok(markup.includes(`src="${SQR_BRAND_ASSETS.icon.light}"`));
  assert.equal((markup.match(/<img\b/g) ?? []).length, 2);
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
