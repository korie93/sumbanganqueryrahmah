import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  getContrastRatio,
  extractCssRuleBlock,
  hslToRgb,
  parseHslTokens,
  readThemeTokenContrastReport,
  validateThemeContrast,
} from "../lib/design-token-contrast.mjs";
import { readFileSync } from "node:fs";

function extractCssVariableValue(cssBlock, variableName) {
  const escapedVariableName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cssBlock.match(new RegExp(`--${escapedVariableName}:\\s*([^;]+);`, "i"));
  return match?.[1]?.trim() || null;
}

function parseHslColorValue(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(
    /^hsl\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%(?:\s*\/\s*([0-9.]+))?\s*\)$/i,
  );

  if (!match) {
    throw new Error(`Unsupported HSL color value: ${value}`);
  }

  return {
    alpha: match[4] ? Number.parseFloat(match[4]) : 1,
    h: Number.parseFloat(match[1]),
    l: Number.parseFloat(match[3]),
    s: Number.parseFloat(match[2]),
  };
}

function compositeColor(foreground, background) {
  const alpha = foreground.alpha ?? 1;
  const foregroundRgb = hslToRgb(foreground);
  const backgroundRgb = hslToRgb(background);
  const compositedRgb = foregroundRgb.map((channel, index) =>
    Math.round(channel * alpha + backgroundRgb[index] * (1 - alpha)),
  );
  const [red, green, blue] = compositedRgb.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;
  if (delta !== 0) {
    switch (max) {
      case red:
        hue = 60 * (((green - blue) / delta) % 6);
        break;
      case green:
        hue = 60 * ((blue - red) / delta + 2);
        break;
      default:
        hue = 60 * ((red - green) / delta + 4);
        break;
    }
  }

  return {
    h: (hue + 360) % 360,
    l: lightness * 100,
    s: saturation * 100,
  };
}

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

test("light theme accent surfaces stay visually distinct from their parent backgrounds", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "client/src/theme-tokens.css"),
    "utf8",
  );
  const lightTokens = parseHslTokens(extractCssRuleBlock(css, ":root"));

  assert.deepEqual(
    validateThemeContrast(lightTokens, {
      minRatio: 1.5,
      tokenPairs: [
        ["background", "accent"],
        ["sidebar", "sidebar-accent"],
      ],
    }),
    [],
  );
});

test("public auth text tokens keep WCAG AA contrast against the auth shell surface", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "client/src/theme-tokens.css"),
    "utf8",
  );

  for (const selector of [":root", ".dark"]) {
    const cssBlock = extractCssRuleBlock(css, selector);
    const layoutBase = parseHslColorValue(
      extractCssVariableValue(cssBlock, "public-auth-layout-bg")
        ?.match(/hsl\([^)]*\)/i)?.[0] || "",
    );
    const surface = parseHslColorValue(
      extractCssVariableValue(cssBlock, "public-auth-shell-surface-strong"),
    );
    const textSoft = parseHslColorValue(
      extractCssVariableValue(cssBlock, "public-auth-text-soft"),
    );
    const textMuted = parseHslColorValue(
      extractCssVariableValue(cssBlock, "public-auth-text-muted"),
    );
    const effectiveSurface = compositeColor(surface, layoutBase);
    const effectiveTextSoft = compositeColor(textSoft, effectiveSurface);
    const effectiveTextMuted = compositeColor(textMuted, effectiveSurface);

    assert.ok(
      getContrastRatio(effectiveSurface, effectiveTextSoft) >= 4.5,
      `${selector} public auth soft text must satisfy WCAG AA contrast`,
    );
    assert.ok(
      getContrastRatio(effectiveSurface, effectiveTextMuted) >= 4.5,
      `${selector} public auth muted text must satisfy WCAG AA contrast`,
    );
  }
});
