import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeSecurityCriticalDependencyPins, DEPENDENCY_AUDIT_MAX_BUFFER } from "../lib/dependency-audit.mjs";

const auditScript = fileURLToPath(new URL("../audit-dependencies.mjs", import.meta.url));

function createReport(severity) {
  return {
    auditReportVersion: 2,
    vulnerabilities: severity ? {
      example: {
        name: "example",
        severity,
        isDirect: true,
        via: [{
          source: 123,
          name: "example",
          dependency: "example",
          title: "Example vulnerability",
          url: "https://github.com/advisories/GHSA-example",
          severity,
          range: "*",
        }],
        effects: [],
        range: "*",
        nodes: ["node_modules/example"],
        fixAvailable: false,
      },
    } : {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...(severity ? { [severity]: 1 } : {}), total: severity ? 1 : 0 },
      dependencies: { prod: 2, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 1 },
    },
  };
}

test("audit CLI fails closed using offline npm stubs", async (t) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "sqr-audit-cli-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  const npmStub = path.join(fixtureRoot, "npm-stub.mjs");
  writeFileSync(npmStub, `
    import assert from "node:assert/strict";
    assert.deepEqual(process.argv.slice(2), ["audit", "--json"]);
    const result = JSON.parse(process.env.AUDIT_STUB_RESULT);
    process.stdout.write(result.repeat ? "x".repeat(result.repeat) : result.stdout);
    process.stderr.write(result.stderr || "");
    process.exitCode = result.status;
  `);
  const { packages } = analyzeSecurityCriticalDependencyPins({});
  writeFileSync(path.join(fixtureRoot, "package.json"), JSON.stringify({
    dependencies: Object.fromEntries(packages.map((name) => [name, "1.2.3"])),
  }));
  writeFileSync(path.join(fixtureRoot, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));

  const run = (result, npmExecPath = npmStub) => spawnSync(process.execPath, [auditScript], {
    cwd: fixtureRoot,
    env: { ...process.env, npm_execpath: npmExecPath, AUDIT_STUB_RESULT: JSON.stringify(result) },
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  const clean = JSON.stringify(createReport());
  const invalidEntry = createReport("low");
  invalidEntry.vulnerabilities.example.nodes = [];
  const inconsistentCounts = createReport("high");
  inconsistentCounts.metadata.vulnerabilities.high = 0;
  const danglingReference = createReport("low");
  danglingReference.vulnerabilities.example.via = ["missing-child"];
  const cycleOnly = createReport("low");
  cycleOnly.vulnerabilities.example.via = ["example"];
  const higherSeverityReference = createReport("low");
  higherSeverityReference.vulnerabilities.example.via = ["child"];
  const child = createReport("high").vulnerabilities.example;
  higherSeverityReference.vulnerabilities.child = {
    ...child,
    name: "child",
    nodes: ["node_modules/example/node_modules/child", "node_modules/child"],
    via: [
      { ...child.via[0], name: "child", dependency: "child", source: 123, severity: "low", range: "<2.0.0" },
      { ...child.via[0], name: "child", dependency: "child", source: 456, severity: "high", range: ">=3.0.0 <3.0.1" },
    ],
  };
  higherSeverityReference.metadata.vulnerabilities.high = 1;
  higherSeverityReference.metadata.vulnerabilities.total = 2;
  higherSeverityReference.metadata.dependencies.prod = 3;
  higherSeverityReference.metadata.dependencies.total = 2;
  const sensitive = `https://user:secret@example.test/\n\u001b[31m::error::${"private".repeat(1000)}`;

  for (const [label, stdout, status] of [
    ["complete clean report", clean, 0],
    ["low findings with exit 1", JSON.stringify(createReport("low")), 1],
  ]) {
    await t.test(`accepts ${label}`, () => {
      const result = run({ stdout, status, stderr: sensitive });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Dependency audit passed with no moderate\+ vulnerabilities/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret|private|::error::|\u001b/u);
    });
  }

  for (const severity of ["moderate", "high", "critical"]) {
    await t.test(`reports ${severity} findings from exit 1`, () => {
      const result = run({ stdout: JSON.stringify(createReport(severity)), status: 1 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`example \\[${severity}\\]`));
      assert.doesNotMatch(result.stdout + result.stderr, /Dependency audit passed/);
    });
  }

  await t.test("reports a high child even when its parent inherits only a low advisory", () => {
    const result = run({ stdout: JSON.stringify(higherSeverityReference), status: 1 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /child \[high\] \(node_modules\/example\/node_modules\/child, node_modules\/child\)/);
    assert.doesNotMatch(result.stdout + result.stderr, /invalid vulnerability|Dependency audit passed/);
  });

  for (const [label, stdout, status, expected] of [
    ["empty stdout", "", 0, /no JSON report/],
    ["whitespace stdout", " \n\t", 0, /no JSON report/],
    ["invalid JSON", sensitive, 0, /invalid or truncated JSON/],
    ["truncated JSON", '{"auditReportVersion":2,', 0, /invalid or truncated JSON/],
    ["empty JSON object", "{}", 0, /unsupported auditReportVersion/],
    ["null JSON", "null", 0, /must be a JSON object/],
    ["array JSON", "[]", 0, /must be a JSON object/],
    ["missing vulnerabilities", JSON.stringify({ ...createReport(), vulnerabilities: undefined }), 0, /vulnerability and metadata objects/],
    ["missing metadata", JSON.stringify({ ...createReport(), metadata: undefined }), 0, /vulnerability and metadata objects/],
    ["unsupported schema", JSON.stringify({ ...createReport(), auditReportVersion: 3 }), 0, /unsupported auditReportVersion/],
    ["invalid vulnerability", JSON.stringify(invalidEntry), 0, /invalid vulnerability entry/],
    ["inconsistent severity counts", JSON.stringify(inconsistentCounts), 0, /counts do not match/],
    ["dangling vulnerability reference", JSON.stringify(danglingReference), 1, /invalid vulnerability reference/],
    ["cycle without an advisory", JSON.stringify(cycleOnly), 1, /references with no advisory source/],
    ["error payload with exit 0", JSON.stringify({ ...createReport(), error: { message: sensitive } }), 0, /reported an error/],
    ["error payload with exit 1", JSON.stringify({ error: { message: sensitive } }), 1, /reported an error/],
    ["clean report with exit 2", clean, 2, /supported status/],
    ["clean report with exit 1", clean, 1, /status 1 but reported no vulnerabilities/],
  ]) {
    await t.test(`rejects ${label} without exposing npm diagnostics`, () => {
      const result = run({ stdout, status, stderr: sensitive });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, expected);
      assert.doesNotMatch(result.stdout + result.stderr, /Dependency audit passed|secret|private|::error::|\u001b/u);
      assert.ok(result.stderr.length < 500);
    });
  }

  await t.test("rejects missing npm entrypoint", () => {
    const result = run({ stdout: clean, status: 0 }, path.join(fixtureRoot, "missing-npm.mjs"));
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no JSON report/);
    assert.doesNotMatch(result.stdout + result.stderr, /Dependency audit passed|MODULE_NOT_FOUND/);
  });

  await t.test("rejects npm output exceeding the execution buffer", () => {
    const result = run({ stdout: "", repeat: DEPENDENCY_AUDIT_MAX_BUFFER + 1024, status: 0 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /output buffer limit/);
    assert.ok(result.stderr.length < 500);
  });
});
