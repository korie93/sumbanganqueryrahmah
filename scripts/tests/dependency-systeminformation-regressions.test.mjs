import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const semver = require("semver");
const systeminformationPackage = require("systeminformation/package.json");
const { sanitizeShellString } = require("systeminformation/lib/util");

test("systeminformation resolves a patched version compatible with host metrics", () => {
  const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
  const installed = systeminformationPackage.version;
  const locked = lock.packages["node_modules/systeminformation"];
  const hostMetrics = lock.packages["node_modules/@opentelemetry/instrumentation-host-metrics"];

  assert.equal(installed, locked.version);
  assert.ok(semver.gte(installed, "5.33.16"), "GHSA-3f7j-7jwc-fxfj requires systeminformation >=5.33.16");
  assert.ok(semver.satisfies(installed, hostMetrics.dependencies.systeminformation));
});

test("systeminformation shell sanitizer removes PowerShell Unicode quote and dash delimiters", () => {
  // Pure strings only: never invoke services(), PowerShell, or a shell command.
  const delimiters = [
    ...Array.from({ length: 7 }, (_, index) => String.fromCharCode(0x2018 + index)),
    ...Array.from({ length: 3 }, (_, index) => String.fromCharCode(0x2013 + index)),
  ];
  for (const delimiter of delimiters) {
    assert.equal(sanitizeShellString(`Safe${delimiter}Service`), "SafeService");
    assert.equal(sanitizeShellString(`Safe${delimiter}Service`, true), "SafeService");
  }
});

test("systeminformation sanitizer retains normal service identifiers and strict filtering", () => {
  const service = "SQR-Collector_01.service";
  assert.equal(sanitizeShellString(service), service);
  assert.equal(sanitizeShellString(service, true), service);
  assert.equal(sanitizeShellString("SQR Collector (Primary) @Group", true), "SQRCollectorPrimaryGroup");
});
