import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractCssRuleBlock, getContrastRatio, getRelativeLuminance, hslToRgb, parseHslTokens } from "../lib/design-token-contrast.mjs";

const semantic = readFileSync(new URL("../../client/src/styles/tokens/colors/_semantic.css", import.meta.url), "utf8");

for (const [theme, selector] of [["light", ":root"], ["dark", ".dark"]]) {
  const tokens = parseHslTokens(extractCssRuleBlock(semantic, selector));
  test(`${theme} current-page badge uses readable solid primary pairing`, () => {
    assert.ok(getContrastRatio(tokens.get("primary"), tokens.get("primary-foreground")) >= 4.5);
  });
  test(`${theme} monthly status text meets contrast on its actual tinted background`, () => {
    const surface = hslToRgb(tokens.get("background"));
    for (const status of ["success", "warning", "destructive"]) {
      const foreground = hslToRgb(tokens.get(status));
      const tintedBackground = foreground.map((channel, index) => Math.round(channel * 0.1 + surface[index] * 0.9));
      const values = [getRelativeLuminance(foreground), getRelativeLuminance(tintedBackground)].sort((a, b) => b - a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      assert.ok(ratio >= 4.5, `${status} contrast ${ratio.toFixed(2)} must meet 4.5 on a 10% status tint`);
    }
  });
  test(`${theme} search highlights keep normal text contrast on every supported row surface`, () => {
    const foreground = hslToRgb(tokens.get("foreground"));
    const tint = hslToRgb(tokens.get("warning"));
    for (const surfaceName of ["background", "card", "muted"]) {
      const surface = hslToRgb(tokens.get(surfaceName));
      const tintedBackground = tint.map((channel, index) => Math.round(channel * 0.15 + surface[index] * 0.85));
      const values = [getRelativeLuminance(foreground), getRelativeLuminance(tintedBackground)].sort((a, b) => b - a);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${surfaceName} highlighted result remains readable`);
    }
  });
}
