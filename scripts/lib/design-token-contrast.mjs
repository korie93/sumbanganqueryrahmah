import { readFileSync } from "node:fs";

const HSL_TOKEN_PATTERN = /--([a-z0-9-]+):\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%;/gi;
const DEFAULT_TOKEN_PAIRS = [
  ["background", "foreground"],
  ["background", "muted-foreground"],
  ["card", "card-foreground"],
  ["card", "muted-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["sidebar", "sidebar-foreground"],
  ["sidebar-primary", "sidebar-primary-foreground"],
  ["sidebar-accent", "sidebar-accent-foreground"],
];

export function extractCssRuleBlock(css, selector) {
  const selectorIndex = css.indexOf(selector);
  if (selectorIndex < 0) {
    return "";
  }

  const openIndex = css.indexOf("{", selectorIndex);
  if (openIndex < 0) {
    return "";
  }

  let depth = 0;
  for (let index = openIndex; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openIndex + 1, index);
      }
    }
  }

  return "";
}

export function parseHslTokens(cssBlock) {
  const tokens = new Map();

  for (const match of cssBlock.matchAll(HSL_TOKEN_PATTERN)) {
    tokens.set(match[1], {
      h: Number.parseFloat(match[2]),
      s: Number.parseFloat(match[3]),
      l: Number.parseFloat(match[4]),
    });
  }

  return tokens;
}

export function hslToRgb({ h, s, l }) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = (((h % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime < 1) {
    [red, green, blue] = [chroma, secondary, 0];
  } else if (huePrime < 2) {
    [red, green, blue] = [secondary, chroma, 0];
  } else if (huePrime < 3) {
    [red, green, blue] = [0, chroma, secondary];
  } else if (huePrime < 4) {
    [red, green, blue] = [0, secondary, chroma];
  } else if (huePrime < 5) {
    [red, green, blue] = [secondary, 0, chroma];
  } else {
    [red, green, blue] = [chroma, 0, secondary];
  }

  return [red, green, blue].map((channel) => Math.round((channel + match) * 255));
}

export function getRelativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getContrastRatio(first, second) {
  const firstLuminance = getRelativeLuminance(hslToRgb(first));
  const secondLuminance = getRelativeLuminance(hslToRgb(second));
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

export function validateThemeContrast(tokens, { minRatio = 4.5, tokenPairs = DEFAULT_TOKEN_PAIRS } = {}) {
  const failures = [];

  for (const [backgroundToken, foregroundToken] of tokenPairs) {
    const background = tokens.get(backgroundToken);
    const foreground = tokens.get(foregroundToken);

    if (!background || !foreground) {
      failures.push(`${backgroundToken}/${foregroundToken}: missing token`);
      continue;
    }

    const ratio = getContrastRatio(background, foreground);
    if (ratio < minRatio) {
      failures.push(`${backgroundToken}/${foregroundToken}: ${ratio.toFixed(2)} < ${minRatio}`);
    }
  }

  return failures;
}

export function readThemeTokenContrastReport(themeTokensPath) {
  const css = readFileSync(themeTokensPath, "utf8");
  const lightTokens = parseHslTokens(extractCssRuleBlock(css, ":root"));
  const darkTokens = parseHslTokens(extractCssRuleBlock(css, ".dark"));

  return {
    darkFailures: validateThemeContrast(darkTokens),
    lightFailures: validateThemeContrast(lightTokens),
  };
}
