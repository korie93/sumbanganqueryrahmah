import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { monitorStatusTextClass } from "./monitor-status-colors";
import { getGovernanceClass, getModeBadgeClass, getRollupFreshnessBadgeClass } from "./monitor-format-utils";

type Color = [number, number, number];
const semanticCss = readFileSync(new URL("../../styles/tokens/colors/_semantic.css", import.meta.url), "utf8");
const stateCss = readFileSync(new URL("../../styles/tokens/colors/_state-pages.css", import.meta.url), "utf8");
const themes = semanticCss.split(/\.dark\s*\{/);

function hsl(h: number, s: number, l: number): Color {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}
function token(css: string, name: string): Color {
  const match = css.match(new RegExp(`--${name}:\\s*(?:hsl\\()?([\\d.]+) ([\\d.]+)% ([\\d.]+)%`));
  assert.ok(match, `missing ${name}`);
  return hsl(Number(match[1]), Number(match[2]), Number(match[3]));
}
function hex(value: string): Color {
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16) / 255) as Color;
}
function contrast(first: Color, second: Color) {
  const luminance = (color: Color) => color.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("Monitor foreground tokens exceed 4.5 on the audited warning and critical composite backgrounds", () => {
  // Exact failing composite backgrounds from the original browser/axe audit.
  for (const background of ["faf1e2", "fae9cd"]) {
    assert.ok(contrast(token(themes[0], "monitor-status-warning-text"), hex(background)) >= 4.5);
  }
  assert.ok(contrast(token(themes[1], "monitor-status-critical-text"), hex("3b2121")) >= 4.5);
  for (const status of ["good", "warning", "critical"]) {
    for (const background of ["fafafa", "ffffff", "fae9cd", "fbdada", "d9f1e6"]) {
      assert.ok(contrast(token(themes[0], `monitor-status-${status}-text`), hex(background)) >= 4.5, `${status} light ${background}`);
    }
    for (const background of ["0e0e0e", "1b1b1b", "3b2121", "3d321a", "17392a"]) {
      assert.ok(contrast(token(themes[1], `monitor-status-${status}-text`), hex(background)) >= 4.5, `${status} dark ${background}`);
    }
  }
});

test("Monitor mode, rollup and governance classifications use their scoped foregrounds", () => {
  for (const [mode, status] of [["NORMAL", "good"], ["DEGRADED", "warning"], ["PROTECTION", "critical"]] as const) {
    assert.ok(getModeBadgeClass(mode).includes(monitorStatusTextClass[status]));
  }
  for (const [state, status] of [["READY", "good"], ["COOLDOWN", "warning"], ["LOCKDOWN", "critical"]] as const) {
    assert.ok(getGovernanceClass(state).includes(monitorStatusTextClass[status]));
  }
  for (const [freshness, status] of [["fresh", "good"], ["warming", "warning"], ["stale", "critical"]] as const) {
    const classes = getRollupFreshnessBadgeClass(freshness);
    assert.ok(classes.includes(monitorStatusTextClass[status]));
    assert.doesNotMatch(classes, /\btext-(?:success|warning|destructive)\b/);
  }
});

test("light Forbidden CTA normal and hover retain at least 4.5 contrast without changing dark tokens", () => {
  const light = stateCss.split(/\.dark\s*\{/)[0];
  const foreground = token(light, "forbidden-primary-button-text");
  for (const name of ["forbidden-primary-button-bg", "forbidden-primary-button-bg-hover"]) {
    assert.ok(contrast(foreground, token(light, name)) >= 4.5, name);
  }
  const dark = stateCss.split(/\.dark\s*\{/)[1];
  assert.match(dark, /--forbidden-primary-button-bg:\s*var\(--color-primary\)/);
  assert.match(dark, /--forbidden-primary-button-bg-hover:\s*var\(--color-primary-hover\)/);
  assert.match(dark, /--forbidden-primary-button-text:\s*hsl\(0 0% 0%\)/);
});
