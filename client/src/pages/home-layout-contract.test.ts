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
  const homeSource = readPageSource("Home.tsx");
  const homeStyles = readPageSource("Home.css");

  assert.match(homeSource, /Primary Workflow/);
  assert.match(homeSource, /Operational modules/);
  assert.match(homeSource, /Visibility and follow-up/);
  assert.match(homeSource, /Modules Ready/);
  assert.match(homeSource, /home-desktop-primary-card/);
  assert.match(homeSource, /home-section-shell/);
  assert.match(homeStyles, /\.home-desktop-primary-card/);
  assert.match(homeStyles, /\.home-section-shell/);
  assert.match(homeStyles, /\.home-desktop-stat-chip/);
});
