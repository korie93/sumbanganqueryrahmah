import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(isMobileViewportWidth(767), true);
  assert.equal(isMobileViewportWidth(768), false);
  assert.equal(isTabletOrSmallerViewportWidth(1023), true);
  assert.equal(isTabletOrSmallerViewportWidth(1024), false);
});
