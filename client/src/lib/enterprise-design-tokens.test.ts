import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve("client/src", file), "utf8");
const semantic = read("styles/tokens/colors/_semantic.css");

function token(block: string, name: string): string {
  const value = block.match(new RegExp("--" + name + ":\\s*([^;]+);"))?.[1];
  assert.ok(value, "Missing semantic token " + name);
  return value;
}

function luminance(hsl: string): number {
  const [hue, saturation, lightness] = hsl.split(" ").map((value) => parseFloat(value));
  assert.ok(hue !== undefined && saturation !== undefined && lightness !== undefined);
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const base = l - chroma / 2;
  const rgb = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0]
    : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma]
      : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  const channels = rgb.map((value) => {
    const channel = value + base;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(block: string, foreground: string, background: string): number {
  const values = [luminance(token(block, foreground)), luminance(token(block, background))].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

for (const [name, block] of [["light", semantic.split(".dark {")[0]!], ["dark", semantic.split(".dark {")[1]!]]) {
  test(name + " text and semantic statuses meet normal-text contrast", () => {
    for (const foreground of ["foreground", "muted-foreground", "success", "warning", "info", "destructive"]) {
      for (const background of ["background", "card", "muted"]) {
        assert.ok(contrast(block!, foreground, background) >= 4.5, name + " " + foreground + "/" + background);
      }
    }
    assert.ok(contrast(block!, "primary-foreground", "primary") >= 4.5);
    assert.ok(contrast(block!, "destructive-foreground", "destructive") >= 4.5);
  });
  test(name + " control borders and focus ring remain distinguishable", () => {
    for (const background of ["background", "card"]) {
      assert.ok(contrast(block!, "input", background) >= 3, name + " input/" + background);
      assert.ok(contrast(block!, "ring", background) >= 3, name + " ring/" + background);
    }
  });
}

test("shared surfaces use restrained semantic styling", () => {
  const operations = read("app/AuthenticatedAppShell.css");
  const glass = read("components/GlassWrapper.css");
  assert.doesNotMatch(operations + glass, /(?:linear|radial)-gradient/);
  assert.match(operations, /font-variant-numeric: tabular-nums/);
  assert.match(operations, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(glass, /border-radius: var\(--radius-surface\)/);
  assert.match(read("components/ui/button.tsx"), /motion-reduce:transition-none/);
  assert.match(read("components/ui/select.tsx"), /min-h-11/);
});
