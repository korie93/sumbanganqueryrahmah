import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPageSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("Home V7.9 keeps restrained shared navigation and neutral responsive surfaces", () => {
  const homeSource = [
    readPageSource("Home.tsx"),
    readPageSource("HomeSections.tsx"),
    readPageSource("HomeNavigationCards.tsx"),
  ].join("\n");
  const homeStyles = readPageSource("Home.css");

  assert.match(homeSource, /Quick access/);
  assert.match(homeSource, /Operational modules/);
  assert.match(homeSource, /Recent activity/);
  assert.match(homeSource, /getVisibleHomeItems/);
  assert.match(homeSource, /canViewCollection \? <HomeCollectionOverview/);
  assert.match(homeSource, /canViewRecentActivity \? <HomeRecentActivity/);
  assert.match(homeStyles, /overflow-wrap:\s*anywhere/);
  assert.match(homeStyles, /prefers-reduced-motion/);
  assert.doesNotMatch(homeSource, /Billing OSP|demo=1/);
  assert.doesNotMatch(homeSource, /text-primary\/75/);
  assert.doesNotMatch(homeSource, /rounded-full bg-primary\/10 px-3 py-1 text-xs font-semibold text-primary/);
});
