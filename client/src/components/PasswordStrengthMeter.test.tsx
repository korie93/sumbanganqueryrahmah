import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

type RgbColor = readonly [number, number, number];

const PASSWORD_STRENGTH_LIGHT_BACKGROUND: RgbColor = [255, 255, 255];
const PASSWORD_STRENGTH_DARK_BACKGROUND: RgbColor = [15, 23, 42];
const PASSWORD_STRENGTH_MIN_UI_CONTRAST_RATIO = 3;

const PASSWORD_STRENGTH_SEGMENT_COLORS = [
  {
    dark: [248, 113, 113],
    light: [185, 28, 28],
  },
  {
    dark: [251, 146, 60],
    light: [194, 65, 12],
  },
  {
    dark: [250, 204, 21],
    light: [161, 98, 7],
  },
  {
    dark: [163, 230, 53],
    light: [77, 124, 15],
  },
  {
    dark: [74, 222, 128],
    light: [21, 128, 61],
  },
] satisfies Array<{
  dark: RgbColor;
  light: RgbColor;
}>;

function getRelativeLuminance([red, green, blue]: RgbColor) {
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

function getContrastRatio(first: RgbColor, second: RgbColor) {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

test("PasswordStrengthMeter exposes an accessible live strength summary", () => {
  const markup = renderToStaticMarkup(
    createElement(PasswordStrengthMeter, {
      id: "test-password-strength",
      password: "Tr0ub4dor&3",
    }),
  );

  assert.match(markup, /id="test-password-strength"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /aria-label="Password strength: Strong"/);
  assert.match(markup, /Kekuatan kata laluan/);
  assert.match(markup, /Kuat/);
  assert.match(markup, /Use 12\+ chars/);
  assert.match(markup, /motion-reduce:transition-none/);
});

test("PasswordStrengthMeter segment colors meet WCAG non-text contrast in light and dark themes", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "client", "src", "components", "PasswordStrengthMeter.tsx"),
    "utf8",
  );

  assert.match(source, /bg-red-700 dark:bg-red-400/);
  assert.match(source, /bg-orange-700 dark:bg-orange-400/);
  assert.match(source, /bg-yellow-700 dark:bg-yellow-400/);
  assert.match(source, /bg-lime-700 dark:bg-lime-400/);
  assert.match(source, /bg-green-700 dark:bg-green-400/);

  for (const color of PASSWORD_STRENGTH_SEGMENT_COLORS) {
    assert.ok(
      getContrastRatio(color.light, PASSWORD_STRENGTH_LIGHT_BACKGROUND) >= PASSWORD_STRENGTH_MIN_UI_CONTRAST_RATIO,
      "light password strength segment must satisfy WCAG non-text contrast",
    );
    assert.ok(
      getContrastRatio(color.dark, PASSWORD_STRENGTH_DARK_BACKGROUND) >= PASSWORD_STRENGTH_MIN_UI_CONTRAST_RATIO,
      "dark password strength segment must satisfy WCAG non-text contrast",
    );
  }
});
