import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  getContrastRatio,
  hslToRgb,
  parseHslTokens,
  readThemeTokenContrastReport,
  validateThemeContrast,
} from "../lib/design-token-contrast.mjs";

test("hslToRgb converts core color coordinates predictably", () => {
  assert.deepEqual(hslToRgb({ h: 0, s: 100, l: 50 }), [255, 0, 0]);
  assert.deepEqual(hslToRgb({ h: 120, s: 100, l: 50 }), [0, 255, 0]);
  assert.deepEqual(hslToRgb({ h: 240, s: 100, l: 50 }), [0, 0, 255]);
});

test("getContrastRatio returns WCAG-style ratios", () => {
  assert.equal(
    getContrastRatio(
      { h: 0, s: 0, l: 100 },
      { h: 0, s: 0, l: 0 },
    ).toFixed(2),
    "21.00",
  );
});

test("validateThemeContrast reports insufficient token contrast", () => {
  const tokens = parseHslTokens(`
    --background: 0 0% 100%;
    --foreground: 0 0% 95%;
  `);

  assert.deepEqual(
    validateThemeContrast(tokens, {
      tokenPairs: [["background", "foreground"]],
    }),
    ["background/foreground: 1.12 < 4.5"],
  );
});

test("theme token foreground pairs meet WCAG AA normal text contrast", () => {
  const report = readThemeTokenContrastReport(
    path.resolve(process.cwd(), "client/src/theme-tokens.css"),
  );

  assert.deepEqual(report.lightFailures, []);
  assert.deepEqual(report.darkFailures, []);
});
