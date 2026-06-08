import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const sharedRoot = path.join(repoRoot, "shared");
const clientRoot = path.join(repoRoot, "client", "src");

const SERVER_ONLY_SHARED_MODULES = new Set([
  "schema-postgres",
  "schema-postgres-ai",
  "schema-postgres-collection",
  "schema-postgres-core",
  "schema-postgres-settings",
]);

const COMMON_SHARED_MODULES = new Set([
  "ai-limits",
  "api-contracts",
  "audit-log-classification",
  "auth-session-expiry",
  "collection-amount-types",
  "collection-daily-status",
  "error-codes",
  "json-schema",
  "pagination-contracts",
  "password-policy",
  "trusted-types",
  "user-roles",
  "web-vitals",
]);

function walkFiles(rootPath, predicate, results = []) {
  const stat = statSync(rootPath);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(rootPath)) {
      walkFiles(path.join(rootPath, entry), predicate, results);
    }
    return results;
  }

  if (predicate(rootPath)) {
    results.push(rootPath);
  }
  return results;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function stripSharedSpecifier(specifier) {
  const normalized = specifier.replace(/\\/g, "/").replace(/\.(ts|tsx|js|jsx)$/, "");
  if (normalized.startsWith("@shared/")) {
    return normalized.slice("@shared/".length);
  }

  const sharedIndex = normalized.indexOf("/shared/");
  if (sharedIndex >= 0) {
    return normalized.slice(sharedIndex + "/shared/".length);
  }

  return null;
}

test("shared root files are classified as common or server-only", () => {
  const sharedFiles = readdirSync(sharedRoot)
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .map((entry) => entry.replace(/\.ts$/, ""))
    .sort();

  const knownModules = new Set([
    ...COMMON_SHARED_MODULES,
    ...SERVER_ONLY_SHARED_MODULES,
  ]);

  assert.deepEqual(
    sharedFiles.filter((entry) => !knownModules.has(entry)),
    [],
  );
});

test("client code does not import server-only shared schema modules", () => {
  const clientFiles = walkFiles(
    clientRoot,
    (filePath) => /\.(ts|tsx)$/.test(filePath) && !filePath.endsWith(".test.ts") && !filePath.endsWith(".test.tsx"),
  );
  const violations = [];
  const importPattern = /\bimport(?:\s+type)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;

  for (const filePath of clientFiles) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const sharedSpecifier = stripSharedSpecifier(match[1]);
      if (!sharedSpecifier) continue;

      const moduleName = sharedSpecifier.split("/")[0];
      if (SERVER_ONLY_SHARED_MODULES.has(moduleName)) {
        violations.push(`${normalizePath(path.relative(repoRoot, filePath))}: ${match[1]}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("shared boundary documentation describes target common/server/client directories", () => {
  const sharedReadme = readFileSync(path.join(sharedRoot, "README.md"), "utf8");
  const commonReadme = readFileSync(path.join(sharedRoot, "common", "README.md"), "utf8");
  const serverReadme = readFileSync(path.join(sharedRoot, "server", "README.md"), "utf8");
  const clientReadme = readFileSync(path.join(sharedRoot, "client", "README.md"), "utf8");

  assert.match(sharedReadme, /client code cannot import server-only schema modules/i);
  assert.match(commonReadme, /browser-safe shared contracts/i);
  assert.match(serverReadme, /Drizzle\/PostgreSQL table/);
  assert.match(clientReadme, /browser-only shared helpers/i);
});
