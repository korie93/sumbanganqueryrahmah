import assert from "node:assert/strict";
import test from "node:test";
import {
  collectServerJsonParsingContractMatches,
  findDisallowedServerJsonParsing,
  formatServerJsonParsingContractReport,
} from "../lib/server-json-parsing-contract.mjs";

test("server JSON parsing contract reports success when raw parsers are absent", () => {
  const report = formatServerJsonParsingContractReport({
    matches: [],
    summary: {
      fileCount: 10,
    },
  });

  assert.match(report, /inspected 10 server source files/i);
  assert.match(report, /server\/lib\/safe-json\.ts/i);
});

test("server JSON parsing contract reports file and line for violations", () => {
  const findings = findDisallowedServerJsonParsing({
    filePath: "server/routes/example.ts",
    text: [
      "export function parse(raw: string) {",
      "  return JSON.parse(raw);",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(findings, [
    {
      filePath: "server/routes/example.ts",
      lineNumber: 2,
      snippet: "return JSON.parse(raw);",
    },
  ]);
});

test("server JSON parsing contract ignores tests but flags production source", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const repoRoot = mkdtempSync(path.join(tmpdir(), "server-json-parsing-contract-"));
  const sourceDir = path.join(repoRoot, "server", "routes");
  const testDir = path.join(repoRoot, "server", "routes", "tests");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "bad.ts"),
    "export function bad(raw: string) { return JSON.parse(raw); }\n",
    "utf8",
  );
  writeFileSync(
    path.join(testDir, "bad.test.ts"),
    "test('ok', () => JSON.parse('{}'));\n",
    "utf8",
  );

  const result = collectServerJsonParsingContractMatches({ repoRoot });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].filePath, "server/routes/bad.ts");
});

test("server JSON parsing contract allows JSON.parse only in server safe-json", () => {
  const findings = findDisallowedServerJsonParsing({
    filePath: "server/lib/safe-json.ts",
    text: "export function parse(raw: string) { return JSON.parse(raw); }\n",
  });

  assert.deepEqual(findings, []);
});
