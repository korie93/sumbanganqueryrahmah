import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  LARGE_UP_MEDIA_QUERY,
  MEDIUM_UP_MEDIA_QUERY,
  MOBILE_MEDIA_QUERY,
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_MAX_WIDTHS,
  SMALL_HANDSET_MEDIA_QUERY,
  SMALL_UP_MEDIA_QUERY,
  TABLET_MEDIA_QUERY,
  isMobileViewportWidth,
  isTabletOrSmallerViewportWidth,
} from "./responsive";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// AUDIT-FIX [M9]: 319px is the approved ultra-small fallback tier below the 320px handset baseline.
const APPROVED_CSS_BREAKPOINT_WIDTHS = new Set([319, 640, 767, 768, 1023, 1024]);
const RESPONSIVE_CSS_CONTRACT_FILES = [
  "../pages/Login.css",
  "../components/PublicAuthLayout.css",
  "../components/Navbar.css",
  "../index.css",
  "../theme-tokens.css",
];

test("responsive contract exposes the shared breakpoint tiers and derived queries", () => {
  assert.deepEqual(RESPONSIVE_BREAKPOINTS, {
    sm: 640,
    md: 768,
    lg: 1024,
  });
  assert.deepEqual(RESPONSIVE_MAX_WIDTHS, {
    mobile: 767,
    tablet: 1023,
  });
  assert.equal(SMALL_HANDSET_MEDIA_QUERY, "(max-width: 640px)");
  assert.equal(MOBILE_MEDIA_QUERY, "(max-width: 767px)");
  assert.equal(TABLET_MEDIA_QUERY, "(max-width: 1023px)");
  assert.equal(SMALL_UP_MEDIA_QUERY, "(min-width: 640px)");
  assert.equal(MEDIUM_UP_MEDIA_QUERY, "(min-width: 768px)");
  assert.equal(LARGE_UP_MEDIA_QUERY, "(min-width: 1024px)");
});

test("responsive helpers treat the md breakpoint as the mobile cutoff", () => {
  assert.equal(isMobileViewportWidth(undefined), false);
  assert.equal(isMobileViewportWidth(320), true);
  assert.equal(isMobileViewportWidth(360), true);
  assert.equal(isMobileViewportWidth(375), true);
  assert.equal(isMobileViewportWidth(767), true);
  assert.equal(isMobileViewportWidth(768), false);
  assert.equal(isTabletOrSmallerViewportWidth(1023), true);
  assert.equal(isTabletOrSmallerViewportWidth(1024), false);
});

test("small-handset overlays keep viewport-constrained widths", () => {
  const guardedSources = [
    "../pages/collection-summary/CollectionSummaryFilters.tsx",
    "../pages/collection-summary/CollectionMonthlyComparisonSetupCard.tsx",
    "../pages/collection-records/CollectionRecordsFilters.tsx",
    "../pages/collection/CollectionNicknameSummaryMobileFilters.tsx",
    "../pages/collection/CollectionDailyUserFilterControl.tsx",
  ];

  for (const relativePath of guardedSources) {
    const source = readFileSync(path.resolve(__dirname, relativePath), "utf8");

    assert.match(source, /w-\[min\(360px,calc\(100vw-[^)]+\)\)\]/, `${relativePath} must fit <=375px handsets`);
  }
});

test("custom CSS media queries use approved responsive breakpoints", () => {
  for (const relativePath of RESPONSIVE_CSS_CONTRACT_FILES) {
    const source = readFileSync(path.resolve(__dirname, relativePath), "utf8");
    const widthMatches = source.matchAll(/@media[^{]*(?:min|max)-width:\s*(\d+)px/g);
    for (const match of widthMatches) {
      const width = Number(match[1]);
      assert.equal(
        APPROVED_CSS_BREAKPOINT_WIDTHS.has(width),
        true,
        `${relativePath} uses unapproved breakpoint width ${width}px`,
      );
    }
  }
});
