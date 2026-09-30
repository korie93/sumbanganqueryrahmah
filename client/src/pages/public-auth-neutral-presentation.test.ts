import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import postcss from "postcss";

function readSource(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), "client/src", relativePath), "utf8");
}

const v17 = readSource("components/auth/AuthV17Layout.css");
const layout = readSource("components/PublicAuthLayout.css");
const controls = readSource("components/PublicAuthControls.css");

function declaration(source: string, selector: string, property: string) {
  let value: string | undefined;
  postcss.parse(source).walkRules(selector, (rule) => {
    if (rule.parent?.type !== "root") return;
    rule.walkDecls(property, (entry) => { value = entry.value; });
  });
  return value;
}

test("V17 auth uses a scoped light split layout without a heavy form card", () => {
  assert.equal(declaration(v17, ".auth-v17", "display"), "grid");
  assert.match(declaration(v17, ".auth-v17", "grid-template-columns") ?? "", /minmax\(0, [^)]+\) minmax\(/);
  assert.equal(declaration(v17, ".auth-v17", "color-scheme"), "light");
  assert.equal(declaration(v17, ".auth-v17", "background"), "#fff");
  assert.equal(declaration(v17, ".auth-v17-view", "background"), "transparent");
  assert.equal(declaration(v17, ".auth-v17-view", "border"), "0");
  assert.equal(declaration(v17, ".auth-v17-view", "box-shadow"), "none");
  assert.doesNotMatch(v17, /backdrop-filter:\s*(?:blur|saturate)/);
  assert.doesNotMatch(v17, /(?:^|\})\s*(?:body|html|:root|\.dark)\s*\{/);
});

test("legacy shared auth surfaces remain semantic and independent of V17", () => {
  assert.equal(declaration(layout, ".public-auth-layout", "background"), "hsl(var(--background))");
  for (const [source, selector] of [[layout, ".public-auth-layout__card"]]) {
    assert.equal(declaration(source, selector, "background"), "hsl(var(--card))");
    assert.equal(declaration(source, selector, "border-radius"), "0.75rem");
    assert.equal(declaration(source, selector, "box-shadow"), "0 1px 2px hsl(0 0% 0% / 0.04)");
    assert.doesNotMatch(source, /backdrop-filter:\s*(?:blur|saturate)/);
  }
  assert.doesNotMatch(layout, /\.public-auth-layout__center-glow\s*\{\s*display:\s*block/);
});

test("auth controls keep large touch targets, readable input text and visible boundaries", () => {
  assert.equal(declaration(layout, ".public-auth-field-error", "color"), "hsl(var(--destructive))");
  for (const selector of [".public-auth-button", ".public-auth-input"]) {
    assert.equal(declaration(controls, selector, "min-height"), "3rem");
    assert.equal(declaration(controls, selector, "border-radius"), "0.5rem");
  }
  assert.equal(declaration(controls, ".public-auth-input", "font-size"), "var(--font-size-base)");
  assert.equal(declaration(controls, ".public-auth-input", "min-width"), "0");
  assert.equal(declaration(controls, ".public-auth-input", "border"), "1px solid hsl(var(--input))");
  assert.ok(Number.parseFloat(declaration(v17, ".auth-v17 .public-auth-input", "min-height") ?? "0") >= 44);
  assert.match(declaration(v17, ".auth-v17 .public-auth-input", "border") ?? "", /^1px solid /);
  assert.ok(declaration(v17, ".auth-v17 .public-auth-input::placeholder", "color"));
  assert.equal(declaration(controls, ".public-auth-input::placeholder", "color"), "hsl(var(--muted-foreground))");
  assert.equal(declaration(controls, ".public-auth-input.public-auth-password-input", "padding-inline-end"), "7rem");
});

test("auth focus treatment remains visible with keyboard and reduced motion", () => {
  assert.match(declaration(v17, ".auth-v17 :focus-visible", "outline") ?? "", /^[23]px solid /);
  assert.equal(declaration(v17, ".auth-v17 :focus-visible", "outline-offset"), "2px");
  assert.equal(declaration(controls, ".public-auth-button-primary:focus-visible", "outline"), "2px solid hsl(var(--ring))");
  assert.match(controls, /\.public-auth-password-toggle:focus-visible\s*\{\s*box-shadow: inset 0 0 0 2px hsl\(var\(--ring\)\);/);
  for (const source of [v17, layout, controls]) {
    assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  }
  assert.match(controls, /@supports not selector\(:focus-visible\)/);
});

test("password creation compact overrides and validation colors remain intact", () => {
  const selector = ".public-auth-layout.password-creation-layout .public-auth-layout__card";
  assert.equal(declaration(controls, selector, "padding"), "var(--spacing-5) var(--spacing-4)");
  assert.equal(declaration(controls, selector, "border-radius"), "1.5rem");
  assert.equal(declaration(controls, ".public-auth-layout.password-creation-layout .public-auth-layout__brand-copy", "display"), "none");
  assert.equal(declaration(controls, ".public-auth-layout.password-creation-layout .public-auth-layout__intro-icon", "display"), "none");
  assert.equal(declaration(controls, '.password-creation-form .public-auth-input[data-validation-state="error"]', "border-color"), "#b91c1c");
  assert.equal(declaration(controls, '.dark .password-creation-form .public-auth-input[data-validation-state="error"]', "--dm-input-border"), "#fecaca");
  assert.equal(declaration(controls, '.dark .password-creation-form .public-auth-input[data-validation-state="success"]', "--dm-input-border"), "#bbf7d0");
  assert.equal(declaration(controls, ".password-creation-form .public-auth-account-summary__row", "grid-template-columns"), "minmax(0, 2fr) minmax(0, 3fr)");
});

test("public auth keeps bounded widths and short-screen/single-tab recovery layouts", () => {
  assert.equal(declaration(v17, ".auth-v17-wrap", "width"), "min(100%, 480px)");
  assert.match(v17, /@media \(max-width: 699px\)[\s\S]*\.auth-v17\s*\{\s*display:\s*block;/);
  assert.match(v17, /@media[^\{]*max-height:[\s\S]*\.auth-v17-wrap\s*\{\s*transform:\s*none;/);
  assert.equal(declaration(layout, ".public-auth-layout__container", "max-width"), "40rem");
  assert.equal(declaration(layout, ".public-auth-layout--minimal .public-auth-layout__container", "max-width"), "34rem");
  for (const source of [layout]) {
    assert.match(source, /max-height: 560px/);
    assert.match(source, /max-height: 900px/);
    assert.match(source, /var\(--safe-area-inset-bottom\)/);
  }
  const recovery = readSource("pages/SingleTabBlocked.css");
  assert.equal(declaration(recovery, ".single-tab-blocked__notice", "grid-template-columns"), "auto minmax(0, 1fr)");
  assert.match(recovery, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

type Rgb = [number, number, number];

function hslRgb(value: string): Rgb {
  const match = value.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  assert.ok(match, `Expected opaque HSL token: ${value}`);
  const hue = Number(match[1]) / 60;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
  const channels = hue < 1 ? [chroma, secondary, 0]
    : hue < 2 ? [secondary, chroma, 0]
      : hue < 3 ? [0, chroma, secondary]
        : hue < 4 ? [0, secondary, chroma]
          : hue < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return channels.map((channel) => channel + lightness - chroma / 2) as Rgb;
}

function contrast(first: Rgb, second: Rgb) {
  const luminance = (rgb: Rgb) => rgb.map((channel) => channel <= 0.04045
    ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test("chosen semantic auth colors meet static contrast contracts in both palettes", () => {
  // Token-level evidence only: real dark auth activation still needs browser QA.
  const tokens = postcss.parse(readSource("styles/tokens/colors/_semantic.css"));
  for (const theme of [":root", ".dark"]) {
    const palette: Record<string, Rgb> = {};
    tokens.walkRules(theme, (rule) => rule.walkDecls((entry) => {
      if (/^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(entry.value)) {
        palette[entry.prop] = hslRgb(entry.value);
      }
    }));
    for (const [foreground, background, minimum] of [
      ["--foreground", "--card", 4.5],
      ["--muted-foreground", "--card", 4.5],
      ["--destructive", "--card", 4.5],
      ["--primary", "--card", 4.5],
      ["--primary-foreground", "--primary", 4.5],
      ["--input", "--card", 3],
      ["--ring", "--card", 3],
    ] as const) {
      assert.ok(palette[foreground] && palette[background], `${theme}: missing ${foreground}/${background}`);
      const ratio = contrast(palette[foreground], palette[background]);
      assert.ok(ratio >= minimum, `${theme} ${foreground}/${background}: ${ratio.toFixed(2)} < ${minimum}`);
    }
  }
});
