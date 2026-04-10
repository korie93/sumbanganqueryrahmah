import assert from "node:assert/strict";
import test from "node:test";
import {
  collectClientEntryShellContractMatches,
  formatClientEntryShellContractReport,
} from "../lib/client-entry-shell-contract.mjs";

test("client entry shell contract reports success when shell assets stay externalized", () => {
  const report = formatClientEntryShellContractReport({
    matches: [],
    summary: {
      indexPath: "client/index.html",
    },
  });

  assert.match(report, /inspected client\/index\.html/i);
  assert.match(report, /free of inline style\/script blocks/i);
  assert.match(report, /assets externalized/i);
});

test("client entry shell contract report lists inline asset regressions", () => {
  const report = formatClientEntryShellContractReport({
    matches: [
      {
        filePath: "client/index.html",
        label: "client entry shell must not use inline <style> tags",
        snippet: "<style>",
      },
      {
        filePath: "client/index.html",
        label: "client entry shell must not use inline <script> blocks",
        snippet: "<script>window.__BOOT__ = true;</script>",
      },
    ],
    summary: {
      indexPath: "client/index.html",
    },
  });

  assert.match(report, /Client entry shell contract failures/i);
  assert.match(report, /inline <style>/i);
  assert.match(report, /window\.__BOOT__/i);
});

test("client entry shell contract collector finds inline blocks and missing external assets", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const repoRoot = mkdtempSync(path.join(tmpdir(), "client-entry-shell-contract-"));
  const clientDir = path.join(repoRoot, "client");
  mkdirSync(path.join(clientDir, "public"), { recursive: true });
  writeFileSync(
    path.join(clientDir, "index.html"),
    [
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <style>body { color: red; }</style>",
      "  </head>",
      "  <body>",
      "    <div id=\"boot-shell\" style=\"display:block\"></div>",
      "    <script>window.__BOOT__ = true;</script>",
      "  </body>",
      "</html>",
    ].join("\n"),
    "utf8",
  );

  const result = collectClientEntryShellContractMatches({ repoRoot });
  const labels = result.matches.map((match) => match.label);

  assert.equal(result.matches.length, 5);
  assert.match(labels.join("\n"), /inline <style> tags/i);
  assert.match(labels.join("\n"), /inline style attributes/i);
  assert.match(labels.join("\n"), /inline <script> blocks/i);
  assert.match(labels.join("\n"), /external boot shell stylesheet/i);
  assert.match(labels.join("\n"), /external boot shell script/i);
});
