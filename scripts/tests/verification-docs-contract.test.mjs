import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readText(path) {
  return readFileSync(path, "utf8");
}

test("Codex verification guide distinguishes local regression, database integration, and release gates", () => {
  const guide = readText("docs/CODEX.md");

  for (const marker of [
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke:ui",
    "npm run test:db-integration",
    "npm run release:verify:local",
    "PostgreSQL migrations",
    "dependency, security, deployment, or release promotion",
  ]) {
    assert.match(guide, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("QA final checklist keeps database and release verification explicit", () => {
  const checklist = readText("docs/QA_FINAL_CHECKLIST.md");

  for (const marker of [
    "npm run typecheck",
    "npm test",
    "npm run test:db-integration",
    "npm run build",
    "npm run smoke:ui",
    "npm run release:verify:local",
    "production promotion",
  ]) {
    assert.match(checklist, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
