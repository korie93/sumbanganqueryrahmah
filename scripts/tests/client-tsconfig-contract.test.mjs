import assert from "node:assert/strict";
import test from "node:test";
import {
  collectClientTsconfigContractMatches,
  formatClientTsconfigContractReport,
} from "../lib/client-tsconfig-contract.mjs";

test("client tsconfig contract reports success when the flag and extension imports are absent", () => {
  const report = formatClientTsconfigContractReport({
    matches: [],
    summary: {
      fileCount: 12,
      tsconfigPath: "client/tsconfig.json",
    },
  });

  assert.match(report, /inspected 12 source files/i);
  assert.match(report, /no longer depends on allowImportingTsExtensions/i);
  assert.match(report, /avoids \.ts\/\.tsx import specifiers/i);
});

test("client tsconfig contract report lists both tsconfig and source violations", () => {
  const report = formatClientTsconfigContractReport({
    matches: [
      {
        filePath: "client/tsconfig.json",
        label: "client tsconfig must not enable allowImportingTsExtensions",
        snippet: '"allowImportingTsExtensions": true',
      },
      {
        filePath: "client/src/App.tsx",
        label: "client source must not import .ts/.tsx specifiers",
        snippet: "./utils.ts",
      },
    ],
    summary: {
      fileCount: 1,
      tsconfigPath: "client/tsconfig.json",
    },
  });

  assert.match(report, /Client tsconfig contract failures/i);
  assert.match(report, /allowImportingTsExtensions/);
  assert.match(report, /\.\/utils\.ts/);
});

test("client tsconfig contract collector finds the non-standard flag and extension imports", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const repoRoot = mkdtempSync(path.join(tmpdir(), "client-tsconfig-contract-"));
  const sourceDir = path.join(repoRoot, "client", "src");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    path.join(repoRoot, "client", "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          allowImportingTsExtensions: true,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    path.join(sourceDir, "App.tsx"),
    "import { utils } from './utils.ts';\nexport const app = utils;\n",
    "utf8",
  );

  const result = collectClientTsconfigContractMatches({ repoRoot });

  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((match) => match.filePath).sort(),
    ["client/src/App.tsx", "client/tsconfig.json"],
  );
});
