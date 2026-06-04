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
import { readThemeTokenSource, THEME_TOKEN_ENTRY_FILE_PATH } from "../lib/design-token-source.mjs";
import { readFileSync } from "node:fs";

function extractCssVariableValue(cssBlock, variableName) {
  const escapedVariableName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cssBlock.match(new RegExp(`--${escapedVariableName}:\\s*([^;]+);`, "i"));
  return match?.[1]?.trim() || null;
}

function extractCssVariableMap(cssBlock) {
  return new Map(
    Array.from(
      cssBlock.matchAll(/--([a-z0-9_-]+):\s*([^;]+);/gi),
      (match) => [match[1], match[2].trim()],
    ),
  );
}

function resolveCssVariableReferences(value, variables, seen = new Set()) {
  return String(value || "").replace(/var\(--([a-z0-9_-]+)\)/gi, (_match, variableName) => {
    if (seen.has(variableName)) {
      return "";
    }

    const variableValue = variables.get(variableName);
    if (!variableValue) {
      return "";
    }

    return resolveCssVariableReferences(variableValue, variables, new Set([...seen, variableName]));
  });
}

function rgbToHslColorValue(red, green, blue, alpha = 1) {
  const [normalizedRed, normalizedGreen, normalizedBlue] = [red, green, blue].map((channel) => channel / 255);
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (delta !== 0) {
    if (max === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (max === normalizedGreen) {
      hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }

  return {
    alpha,
    h: (hue + 360) % 360,
    l: lightness * 100,
    s: saturation * 100,
  };
}

function parseHslColorValue(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(
    /^hsl\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%(?:\s*\/\s*([0-9.]+))?\s*\)$/i,
  );

  if (match) {
    return {
      alpha: match[4] ? Number.parseFloat(match[4]) : 1,
      h: Number.parseFloat(match[1]),
      l: Number.parseFloat(match[3]),
      s: Number.parseFloat(match[2]),
    };
  }

  const rgbMatch = normalized.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i,
  );

  if (!rgbMatch) {
    throw new Error(`Unsupported CSS color value: ${value}`);
  }

  return rgbToHslColorValue(
    Number.parseFloat(rgbMatch[1]),
    Number.parseFloat(rgbMatch[2]),
    Number.parseFloat(rgbMatch[3]),
    rgbMatch[4] ? Number.parseFloat(rgbMatch[4]) : 1,
  );
}

function extractHslColorValues(value) {
  return Array.from(String(value || "").matchAll(/(?:hsl|rgb)a?\([^)]*\)/gi), (match) =>
    parseHslColorValue(match[0]),
  );
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
    path.resolve(process.cwd(), THEME_TOKEN_ENTRY_FILE_PATH),
  );

  assert.deepEqual(report.lightFailures, []);
  assert.deepEqual(report.darkFailures, []);
});

test("theme token foreground pairs meet WCAG AAA normal text contrast", () => {
  const css = readThemeTokenSource();
  const lightTokens = parseHslTokens(extractCssRuleBlock(css, ":root"));
  const darkTokens = parseHslTokens(extractCssRuleBlock(css, ".dark"));

  assert.deepEqual(
    validateThemeContrast(lightTokens, { minRatio: 7 }),
    [],
  );
  assert.deepEqual(
    validateThemeContrast(darkTokens, { minRatio: 7 }),
    [],
  );
});

test("light theme accent surfaces stay visually distinct from their parent backgrounds", () => {
  const css = readThemeTokenSource();
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
  const css = readThemeTokenSource();

  for (const selector of [":root", ".dark"]) {
    const cssBlock = extractCssRuleBlock(css, selector);
    const variables = extractCssVariableMap(cssBlock);
    const layoutBase = extractHslColorValues(
      resolveCssVariableReferences(extractCssVariableValue(cssBlock, "public-auth-layout-bg"), variables),
    )[0];
    const surface = parseHslColorValue(
      resolveCssVariableReferences(extractCssVariableValue(cssBlock, "public-auth-shell-surface-strong"), variables),
    );
    const textSoft = parseHslColorValue(
      resolveCssVariableReferences(extractCssVariableValue(cssBlock, "public-auth-text-soft"), variables),
    );
    const textMuted = parseHslColorValue(
      resolveCssVariableReferences(extractCssVariableValue(cssBlock, "public-auth-text-muted"), variables),
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

test("public auth primary buttons and login submit gradients meet WCAG AAA contrast", () => {
  const css = readThemeTokenSource();

  for (const selector of [":root", ".dark"]) {
    const cssBlock = extractCssRuleBlock(css, selector);
    const tokens = parseHslTokens(cssBlock);
    const variables = extractCssVariableMap(cssBlock);
    const publicAuthPrimaryBackground = parseHslColorValue(
      resolveCssVariableReferences(extractCssVariableValue(cssBlock, "public-auth-primary-bg"), variables),
    );
    const publicAuthPrimaryBackgroundHover = parseHslColorValue(
      resolveCssVariableReferences(extractCssVariableValue(cssBlock, "public-auth-primary-bg-hover"), variables),
    );
    const publicAuthPrimaryText = tokens.get("primary-foreground");
    const loginSubmitText = parseHslColorValue(
      resolveCssVariableReferences(extractCssVariableValue(cssBlock, "login-submit-text"), variables),
    );
    const loginSubmitGradientStops = [
      ...extractHslColorValues(
        resolveCssVariableReferences(extractCssVariableValue(cssBlock, "login-submit-gradient"), variables),
      ),
      ...extractHslColorValues(
        resolveCssVariableReferences(extractCssVariableValue(cssBlock, "login-submit-gradient-hover"), variables),
      ),
    ];

    assert.ok(
      getContrastRatio(publicAuthPrimaryBackground, publicAuthPrimaryText) >= 7,
      `${selector} public auth primary background must satisfy WCAG AAA contrast`,
    );
    assert.ok(
      getContrastRatio(publicAuthPrimaryBackgroundHover, publicAuthPrimaryText) >= 7,
      `${selector} public auth primary hover background must satisfy WCAG AAA contrast`,
    );

    for (const [index, gradientStop] of loginSubmitGradientStops.entries()) {
      assert.ok(
        getContrastRatio(gradientStop, loginSubmitText) >= 7,
        `${selector} login submit gradient stop ${index + 1} must satisfy WCAG AAA contrast`,
      );
    }
  }
});

test("audit contrast pairs keep muted and destructive tokens readable on their parent backgrounds", () => {
  const css = readThemeTokenSource();
  const lightTokens = parseHslTokens(extractCssRuleBlock(css, ":root"));
  const darkTokens = parseHslTokens(extractCssRuleBlock(css, ".dark"));

  assert.deepEqual(
    validateThemeContrast(lightTokens, {
      tokenPairs: [["background", "muted-foreground"]],
    }),
    [],
  );
  assert.deepEqual(
    validateThemeContrast(darkTokens, {
      minRatio: 3,
      tokenPairs: [["background", "destructive"]],
    }),
    [],
  );
  assert.deepEqual(
    validateThemeContrast(darkTokens, {
      tokenPairs: [
        ["destructive", "destructive-foreground"],
      ],
    }),
    [],
  );
});

test("focus ring token meets WCAG UI contrast in light and dark themes", () => {
  const css = readThemeTokenSource();

  for (const selector of [":root", ".dark"]) {
    const tokens = parseHslTokens(extractCssRuleBlock(css, selector));
    assert.deepEqual(
      validateThemeContrast(tokens, {
        minRatio: 3,
        tokenPairs: [
          ["background", "color-focus"],
          ["card", "color-focus"],
          ["popover", "color-focus"],
        ],
      }),
      [],
      `${selector} focus ring must satisfy WCAG non-text contrast`,
    );
  }
});

test("dark navbar active pill keeps WCAG AA text contrast", () => {
  const tokenCss = readThemeTokenSource();
  const navbarCss = readFileSync(
    path.resolve(process.cwd(), "client/src/components/Navbar.css"),
    "utf8",
  );
  const darkTokens = parseHslTokens(extractCssRuleBlock(tokenCss, ".dark"));
  const darkActivePillBlock = extractCssRuleBlock(navbarCss, ".dark .nav-pill.nav-pill-active");

  assert.match(darkActivePillBlock, /background:\s*hsl\(var\(--primary\)\);/);
  assert.match(darkActivePillBlock, /color:\s*hsl\(var\(--primary-foreground\)\);/);
  assert.ok(
    getContrastRatio(darkTokens.get("primary"), darkTokens.get("primary-foreground")) >= 4.5,
    "dark navbar active pill text must satisfy WCAG AA contrast",
  );
});
