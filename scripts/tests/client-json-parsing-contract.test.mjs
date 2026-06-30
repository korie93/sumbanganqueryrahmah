import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_JSON_PARSING_RULES,
  collectClientJsonParsingContractMatches,
  formatClientJsonParsingContractReport,
} from "../lib/client-json-parsing-contract.mjs";

test("client JSON parsing contract reports success when raw parsers are absent", () => {
  const report = formatClientJsonParsingContractReport({
    matches: [],
    summary: {
      fileCount: 10,
      ruleCount: CLIENT_JSON_PARSING_RULES.length,
    },
  });

  assert.match(report, /inspected 10 client files against 2 parsing rules/i);
  assert.match(report, /bounded safe-json helpers/i);
});

test("client JSON parsing contract report lists parser violations", () => {
  const report = formatClientJsonParsingContractReport({
    matches: [
      {
        filePath: "client/src/lib/queryClient.ts",
        label: "client source routes Response JSON through bounded API readers",
        snippet: ".json(",
      },
    ],
    summary: {
      fileCount: 1,
      ruleCount: CLIENT_JSON_PARSING_RULES.length,
    },
  });

  assert.match(report, /queryClient\.ts/);
  assert.match(report, /\.json\(/);
});

test("client JSON parsing contract ignores tests but flags source raw parsers", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const repoRoot = mkdtempSync(path.join(tmpdir(), "client-json-parsing-contract-"));
  const sourceDir = path.join(repoRoot, "client", "src", "lib");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "Bad.ts"),
    "export async function bad(response) { return response.json(); }\n",
    "utf8",
  );
  writeFileSync(
    path.join(sourceDir, "Bad.test.ts"),
    "test('ok', async () => response.json());\n",
    "utf8",
  );

  const result = collectClientJsonParsingContractMatches({ repoRoot });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].filePath, "client/src/lib/Bad.ts");
});

test("client JSON parsing contract allows JSON.parse only in safe-json utility", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const repoRoot = mkdtempSync(path.join(tmpdir(), "client-json-parse-allowlist-"));
  const sourceDir = path.join(repoRoot, "client", "src", "lib", "utils");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "safe-json.ts"),
    "export function parse(raw) { return JSON.parse(raw); }\n",
    "utf8",
  );

  const result = collectClientJsonParsingContractMatches({ repoRoot });

  assert.equal(result.matches.length, 0);
});
