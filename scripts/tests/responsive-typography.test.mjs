import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

test("landing and home hero headings use clamp-based responsive typography", () => {
  const landingHero = readRepoFile("client/src/pages/LandingHeroShell.tsx");
  const homePage = readRepoFile("client/src/pages/Home.tsx");

  assert.match(landingHero, /text-\[clamp\(2\.5rem,4vw,3\.5rem\)\]/);
  assert.match(homePage, /text-\[clamp\(2rem,6vw,2\.5rem\)\]/);
  assert.match(homePage, /text-\[clamp\(2\.5rem,4vw,3\.5rem\)\]/);
});
