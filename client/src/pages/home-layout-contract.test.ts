import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPageSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("Home keeps primary workflows and grouped desktop sections in the landing layout", () => {
  const homeSource = [
    readPageSource("Home.tsx"),
    readPageSource("HomeSections.tsx"),
    readPageSource("HomeNavigationCards.tsx"),
  ].join("\n");
  const homeStyles = readPageSource("Home.css");

  assert.match(homeSource, /Primary Workflow/);
  assert.match(homeSource, /Operational modules/);
  assert.match(homeSource, /Visibility and follow-up/);
  assert.match(homeSource, /Modules Ready/);
  assert.match(homeSource, /home-desktop-primary-card/);
  assert.match(homeSource, /home-desktop-primary-kicker/);
  assert.match(homeSource, /home-mobile-count-chip/);
  assert.match(homeSource, /home-section-shell/);
  assert.match(homeStyles, /\.home-desktop-primary-card/);
  assert.match(homeStyles, /\.home-desktop-primary-kicker/);
  assert.match(homeStyles, /\.home-mobile-count-chip/);
  assert.match(homeStyles, /\.home-section-shell/);
  assert.match(homeStyles, /\.home-desktop-stat-chip/);
  assert.match(homeStyles, /\.home-card-text p\s*\{[\s\S]*color:\s*hsl\(var\(--muted-foreground\)\);/);
  assert.doesNotMatch(homeStyles, /\.home-card-text p\s*\{[\s\S]*opacity:/);
  assert.doesNotMatch(homeSource, /text-primary\/75/);
  assert.doesNotMatch(homeSource, /rounded-full bg-primary\/10 px-3 py-1 text-xs font-semibold text-primary/);
});
