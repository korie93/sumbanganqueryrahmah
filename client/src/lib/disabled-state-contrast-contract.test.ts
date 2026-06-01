import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientSrcDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(clientSrcDir, "..", "..");

type Hsl = {
  hue: number;
  saturation: number;
  lightness: number;
};

function readRepoFile(relativePath: string): string {
  return readFileSync(path.resolve(rootDir, relativePath), "utf8");
}

function getTokenOccurrences(source: string, tokenName: string): Hsl[] {
  const pattern = new RegExp(`${tokenName}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`, "g");
  return [...source.matchAll(pattern)].map((match) => ({
    hue: Number(match[1]),
    saturation: Number(match[2]),
    lightness: Number(match[3]),
  }));
}

function hslToRgb({ hue, saturation, lightness }: Hsl): [number, number, number] {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [redPrime, greenPrime, bluePrime] = segment < 1
    ? [chroma, x, 0]
    : segment < 2
      ? [x, chroma, 0]
      : segment < 3
        ? [0, chroma, x]
        : segment < 4
          ? [0, x, chroma]
          : segment < 5
            ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = normalizedLightness - chroma / 2;

  return [redPrime + match, greenPrime + match, bluePrime + match];
}

function luminance(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: Hsl, background: Hsl): number {
  const foregroundLuminance = hslToRgb(foreground).map(luminance);
  const backgroundLuminance = hslToRgb(background).map(luminance);
  const foregroundRelative = 0.2126 * foregroundLuminance[0] + 0.7152 * foregroundLuminance[1] + 0.0722 * foregroundLuminance[2];
  const backgroundRelative = 0.2126 * backgroundLuminance[0] + 0.7152 * backgroundLuminance[1] + 0.0722 * backgroundLuminance[2];
  const lighter = Math.max(foregroundRelative, backgroundRelative);
  const darker = Math.min(foregroundRelative, backgroundRelative);

  return (lighter + 0.05) / (darker + 0.05);
}

test("disabled state design tokens keep AA contrast in light and dark themes", () => {
  const source = readRepoFile("client/src/theme-tokens.css");
  const disabledForeground = getTokenOccurrences(source, "--disabled-foreground");
  const disabledBackground = getTokenOccurrences(source, "--disabled");

  assert.ok(disabledForeground.length >= 2);
  assert.ok(disabledBackground.length >= 2);
  assert.ok(contrastRatio(disabledForeground[0], disabledBackground[0]) >= 4.5);
  assert.ok(contrastRatio(disabledForeground[1], disabledBackground[1]) >= 4.5);
});

test("global disabled control styles override opacity-based disabled utilities", () => {
  const indexCss = readRepoFile("client/src/index.css");
  const tailwindConfig = readRepoFile("tailwind.config.ts");

  assert.match(indexCss, /:where\(button, input, select, textarea\):disabled/);
  assert.match(indexCss, /opacity: 1 !important/);
  assert.match(indexCss, /color: hsl\(var\(--disabled-foreground\) \/ 1\) !important/);
  assert.match(indexCss, /background-color: hsl\(var\(--disabled\) \/ 1\)/);
  assert.match(tailwindConfig, /disabled:\s*\{/);
  assert.match(tailwindConfig, /foreground: "hsl\(var\(--disabled-foreground\) \/ <alpha-value>\)"/);
});
