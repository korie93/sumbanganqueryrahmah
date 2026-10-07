import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  analyzeDependencyAuditExecution,
  analyzeDependencyAuditReport,
  analyzePackageLockSources,
  analyzePackageOverrides,
  analyzeSecurityCriticalDependencyPins,
  DEPENDENCY_AUDIT_MAX_BUFFER,
} from "../lib/dependency-audit.mjs";

const repoRoot = process.cwd();

function auditReport(vulnerabilities = {}) {
  const entries = Object.fromEntries(Object.entries(vulnerabilities).map(([name, vulnerability]) => [name, {
    name,
    isDirect: false,
    range: "*",
    nodes: [`node_modules/${name}`],
    effects: [],
    via: [{
      source: 123,
      name,
      dependency: name,
      title: "Example vulnerability",
      url: "https://github.com/advisories/GHSA-example",
      severity: vulnerability.severity,
      range: "*",
    }],
    fixAvailable: false,
    ...vulnerability,
  }]));
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: Object.keys(entries).length };
  for (const entry of Object.values(entries)) {
    counts[entry.severity] += 1;
  }
  return {
    auditReportVersion: 2,
    vulnerabilities: entries,
    metadata: {
      vulnerabilities: counts,
      dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: counts.total },
    },
  };
}

function auditExecution(report, overrides = {}) {
  return { status: 0, signal: null, stdout: JSON.stringify(report), stderr: "", ...overrides };
}

test("dependency audit fails the old drizzle-kit dev-only moderate chain after esbuild override", () => {
  const result = analyzeDependencyAuditReport(auditReport({
    "drizzle-kit": {
      name: "drizzle-kit",
      severity: "moderate",
      nodes: ["node_modules/drizzle-kit"],
    },
    "esbuild": {
      name: "esbuild",
      severity: "moderate",
      nodes: ["node_modules/@esbuild-kit/core-utils/node_modules/esbuild"],
    },
  }));

  assert.deepEqual(result.failures, [
    "drizzle-kit [moderate] (node_modules/drizzle-kit)",
    "esbuild [moderate] (node_modules/@esbuild-kit/core-utils/node_modules/esbuild)",
  ]);
  assert.equal(result.allowed.length, 0);
});

test("dependency audit fails unrelated moderate vulnerabilities", () => {
  const result = analyzeDependencyAuditReport(auditReport({
    "example-package": {
      name: "example-package",
      severity: "moderate",
      nodes: ["node_modules/example-package"],
    },
  }));

  assert.deepEqual(result.failures, ["example-package [moderate] (node_modules/example-package)"]);
});

test("dependency audit fails high severity even if package name is allowlisted", () => {
  const result = analyzeDependencyAuditReport(auditReport({
    "drizzle-kit": {
      name: "drizzle-kit",
      severity: "high",
      nodes: ["node_modules/drizzle-kit"],
    },
  }));

  assert.deepEqual(result.failures, ["drizzle-kit [high] (node_modules/drizzle-kit)"]);
});

test("dependency audit accepts a complete clean v2 report", () => {
  assert.deepEqual(analyzeDependencyAuditReport(auditReport()), { allowed: [], failures: [] });
});

test("dependency audit retains the info/low policy, including npm exit status 1", () => {
  const report = auditReport({ informational: { severity: "info" }, minor: { severity: "low" } });
  for (const status of [0, 1]) {
    assert.deepEqual(analyzeDependencyAuditExecution(auditExecution(report, { status })), { allowed: [], failures: [] });
  }
});

test("npm status 1 still reports every moderate+ finding", () => {
  const report = auditReport({
    moderate: { severity: "moderate" },
    high: { severity: "high" },
    critical: { severity: "critical" },
  });
  for (const status of [0, 1]) {
    assert.deepEqual(analyzeDependencyAuditExecution(auditExecution(report, { status })).failures, [
      "moderate [moderate] (node_modules/moderate)",
      "high [high] (node_modules/high)",
      "critical [critical] (node_modules/critical)",
    ]);
  }
});

for (const [label, transform] of [
  ["missing report", () => undefined],
  ["null report", () => null],
  ["array report", () => []],
  ["scalar report", () => "complete"],
  ["empty object", () => ({})],
  ["missing report version", (report) => { delete report.auditReportVersion; return report; }],
  ["old report version", (report) => ({ ...report, auditReportVersion: 1 })],
  ["future report version", (report) => ({ ...report, auditReportVersion: 3 })],
  ["string report version", (report) => ({ ...report, auditReportVersion: "2" })],
  ["error payload alongside a clean report", (report) => ({ ...report, error: { code: "EAUDIT" } })],
  ["null error payload", (report) => ({ ...report, error: null })],
  ["missing vulnerabilities", (report) => { delete report.vulnerabilities; return report; }],
  ["array vulnerabilities", (report) => ({ ...report, vulnerabilities: [] })],
  ["null vulnerabilities", (report) => ({ ...report, vulnerabilities: null })],
  ["missing metadata", (report) => { delete report.metadata; return report; }],
  ["array metadata", (report) => ({ ...report, metadata: [] })],
  ["missing dependency counts", (report) => { delete report.metadata.dependencies; return report; }],
  ["missing vulnerability counts", (report) => { delete report.metadata.vulnerabilities; return report; }],
  ["missing severity count", (report) => { delete report.metadata.vulnerabilities.high; return report; }],
  ["negative count", (report) => { report.metadata.vulnerabilities.total = -1; return report; }],
  ["string count", (report) => { report.metadata.vulnerabilities.high = "0"; return report; }],
  ["fractional count", (report) => { report.metadata.dependencies.prod = 1.5; return report; }],
  ["unsafe integer count", (report) => { report.metadata.vulnerabilities.total = Number.MAX_SAFE_INTEGER + 1; return report; }],
  ["infinite count", (report) => { report.metadata.dependencies.total = Infinity; return report; }],
  ["nonzero metadata without entries", (report) => { report.metadata.vulnerabilities.high = 1; report.metadata.vulnerabilities.total = 1; return report; }],
  ["inconsistent total", (report) => { report.metadata.vulnerabilities.total = 1; return report; }],
]) {
  test(`dependency audit rejects ${label}`, () => {
    const result = analyzeDependencyAuditReport(transform(auditReport()));
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /npm audit/);
    assert.deepEqual(result.allowed, []);
  });
}

for (const [label, overrides] of [
  ["null entry", null],
  ["array entry", []],
  ["mismatched name", { name: "another-package" }],
  ["missing severity", { severity: undefined }],
  ["unknown severity", { severity: "unknown" }],
  ["non-string severity", { severity: 0 }],
  ["missing direct flag", { isDirect: undefined }],
  ["empty nodes", { nodes: [] }],
  ["non-array nodes", { nodes: "node_modules/example" }],
  ["non-string node", { nodes: [123] }],
  ["control characters in node", { nodes: ["node_modules/example\n::error::untrusted"] }],
  ["unicode line separator in node", { nodes: ["node_modules/example\u2028untrusted"] }],
  ["missing effects", { effects: undefined }],
  ["non-string effect", { effects: [null] }],
  ["missing range", { range: undefined }],
  ["missing via", { via: undefined }],
  ["empty via", { via: [] }],
  ["invalid via entry", { via: [{}] }],
  ["missing fix information", { fixAvailable: undefined }],
  ["invalid fix information", { fixAvailable: {} }],
]) {
  test(`dependency audit rejects vulnerability with ${label}`, () => {
    const report = auditReport({ example: { severity: "low" } });
    report.vulnerabilities.example = overrides === null || Array.isArray(overrides)
      ? overrides : { ...report.vulnerabilities.example, ...overrides };
    assert.match(analyzeDependencyAuditReport(report).failures[0], /invalid vulnerability entry/);
  });
}

test("dependency audit rejects severity counts that disguise a higher finding", () => {
  const report = auditReport({ example: { severity: "high" } });
  report.metadata.vulnerabilities.high = 0;
  report.metadata.vulnerabilities.low = 1;
  assert.match(analyzeDependencyAuditReport(report).failures[0], /counts do not match/);
  report.metadata.vulnerabilities.high = 1;
  report.metadata.vulnerabilities.low = 0;
  report.vulnerabilities.example.severity = "low";
  assert.match(analyzeDependencyAuditReport(report).failures[0], /invalid vulnerability entry/);
});

test("dependency audit accepts metavulnerability references and structured fixes", () => {
  const report = auditReport({
    parent: { severity: "high", via: ["child"], fixAvailable: { name: "parent", version: "2.0.0", isSemVerMajor: true } },
    child: { severity: "high", effects: ["parent"], fixAvailable: true },
  });
  assert.deepEqual(analyzeDependencyAuditReport(report).failures, [
    "parent [high] (node_modules/parent)",
    "child [high] (node_modules/child)",
  ]);
});

test("dependency audit rejects missing vulnerability references", () => {
  for (const report of [
    auditReport({ parent: { severity: "low", via: ["missing-child"] } }),
    auditReport({ parent: { severity: "low", via: ["constructor"] } }),
  ]) {
    for (const status of [0, 1]) {
      const result = analyzeDependencyAuditExecution(auditExecution(report, { status }));
      assert.match(result.failures[0], /invalid vulnerability reference/);
      assert.deepEqual(result.allowed, []);
    }
  }
});

test("dependency audit reports a high child independently when a parent inherits only its low advisory", () => {
  const report = auditReport({
    parent: { severity: "low", via: ["child"], range: "<2.0.0" },
    child: { severity: "high", nodes: ["node_modules/parent/node_modules/child", "node_modules/child"] },
  });
  const child = report.vulnerabilities.child;
  child.via = [
    { ...child.via[0], source: 123, severity: "low", range: "<2.0.0" },
    { ...child.via[0], source: 456, severity: "high", range: ">=3.0.0 <3.0.1" },
  ];
  for (const status of [0, 1]) {
    assert.deepEqual(analyzeDependencyAuditExecution(auditExecution(report, { status })), {
      allowed: [],
      failures: ["child [high] (node_modules/parent/node_modules/child, node_modules/child)"],
    });
  }
});

test("dependency audit rejects self references and closed cycles with no advisory source", () => {
  for (const report of [
    auditReport({ parent: { severity: "low", via: ["parent"] } }),
    auditReport({ parent: { severity: "low", via: ["child"] }, child: { severity: "low", via: ["parent"] } }),
    auditReport({
      parent: { severity: "low", via: ["child"] },
      child: { severity: "low", via: ["parent"] },
      unrelated: { severity: "low" },
    }),
  ]) {
    const result = analyzeDependencyAuditExecution(auditExecution(report, { status: 1 }));
    assert.match(result.failures[0], /references with no advisory source/);
  }
});

test("dependency audit accepts low-severity chains and cycles that reach a real advisory", () => {
  const report = auditReport({
    parent: { severity: "low", via: ["child"] },
    child: { severity: "low", via: ["parent", "source"] },
    source: { severity: "low" },
  });
  assert.deepEqual(analyzeDependencyAuditExecution(auditExecution(report, { status: 1 })), { allowed: [], failures: [] });
});

test("vulnerability diagnostics bound long node paths without dropping affected packages", () => {
  const report = auditReport({ example: { severity: "high", nodes: Array(20).fill(`node_modules/${"a".repeat(2000)}`) } });
  const { failures } = analyzeDependencyAuditReport(report);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /example \[high\]/);
  assert.match(failures[0], /\+15 more paths/);
  assert.ok(failures[0].length < 1500);
});

for (const [label, overrides, expected] of [
  ["empty output", { stdout: "" }, /no JSON report/],
  ["whitespace output", { stdout: " \n\t" }, /no JSON report/],
  ["missing output", { stdout: null }, /no JSON report/],
  ["malformed output", { stdout: "not JSON" }, /invalid or truncated JSON/],
  ["truncated output", { stdout: '{"auditReportVersion":2' }, /invalid or truncated JSON/],
  ["non-audit JSON", { stdout: "{}" }, /unsupported auditReportVersion/],
  ["registry error JSON", { stdout: '{"error":{"code":"E401"}}' }, /reported an error/],
  ["spawn failure", { error: { code: "ENOENT", message: "private registry credential" } }, /Unable to execute/],
  ["timeout", { error: { code: "ETIMEDOUT" } }, /execution timeout/],
  ["buffer overflow", { error: { code: "ENOBUFS" } }, /output buffer limit/],
  ["signal termination", { signal: "SIGTERM" }, /terminated by a signal/],
  ["missing exit status", { status: null }, /supported status/],
  ["undefined exit status", { status: undefined }, /supported status/],
  ["failure exit status", { status: 2 }, /supported status/],
  ["string exit status", { status: "0" }, /supported status/],
  ["negative exit status", { status: -1 }, /supported status/],
  ["clean report with exit 1", { status: 1 }, /status 1 but reported no vulnerabilities/],
]) {
  test(`audit execution fails closed for ${label}, even with otherwise clean output`, () => {
    const { failures } = analyzeDependencyAuditExecution(auditExecution(auditReport(), overrides));
    assert.equal(failures.length, 1);
    assert.match(failures[0], expected);
  });
}

test("audit error diagnostics never echo captured output or untrusted error details", () => {
  const untrusted = `https://user:secret@example.test/\n\u001b[31m::error::${"sensitive".repeat(10000)}`;
  for (const overrides of [
    { stdout: untrusted },
    { stdout: JSON.stringify({ error: { message: untrusted } }) },
    { error: { code: untrusted, message: untrusted } },
    { stdout: JSON.stringify(auditReport({ [untrusted]: { severity: "high" } })) },
  ]) {
    const { failures } = analyzeDependencyAuditExecution(auditExecution(auditReport(), { stderr: untrusted, ...overrides }));
    assert.equal(failures.length, 1);
    assert.ok(failures[0].length < 200);
    assert.doesNotMatch(failures[0], /secret|sensitive|::error::|\u001b/u);
  }
});

test("audit execution rejects missing results and independently enforces its output bound", () => {
  for (const result of [undefined, null, []]) {
    assert.match(analyzeDependencyAuditExecution(result).failures[0], /did not return a process result/);
  }
  const oversized = `${JSON.stringify(auditReport())}${" ".repeat(DEPENDENCY_AUDIT_MAX_BUFFER)}`;
  assert.match(analyzeDependencyAuditExecution(auditExecution(null, { stdout: oversized })).failures[0], /output buffer limit/);
});

test("package source audit fails the old SheetJS CDN tarball after vendoring", () => {
  const result = analyzePackageLockSources({
    packages: {
      "node_modules/xlsx": {
        resolved: "https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz",
      },
    },
  });

  assert.deepEqual(result.failures, [
    "xlsx resolved from external source https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz",
  ]);
  assert.equal(result.allowed.length, 0);
});

test("package source audit ignores vendored file dependencies", () => {
  const result = analyzePackageLockSources({
    packages: {
      "node_modules/xlsx": {
        resolved: "file:vendor/sheetjs/xlsx-0.20.2.tgz",
      },
    },
  });

  assert.equal(result.failures.length, 0);
  assert.equal(result.allowed.length, 0);
});

test("package source audit fails unexpected external tarballs", () => {
  const result = analyzePackageLockSources({
    packages: {
      "node_modules/example-package": {
        resolved: "https://example.com/example-package-1.0.0.tgz",
      },
    },
  });

  assert.deepEqual(result.failures, [
    "example-package resolved from external source https://example.com/example-package-1.0.0.tgz",
  ]);
});

test("package override audit requires every override to be documented", () => {
  const result = analyzePackageOverrides({
    overrides: {
      qs: "^6.15.0",
      "undocumented-package": "^1.0.0",
    },
  });

  assert.deepEqual(result.failures, [
    "undocumented-package override is missing a documented reason",
  ]);
  assert.match(result.documented.qs, /query-string/);
});

test("package override audit accepts documented override set", () => {
  const result = analyzePackageOverrides({
    overrides: {
      qs: "^6.15.0",
      lodash: "^4.17.23",
      rollup: "^4.59.0",
      dompurify: "3.4.1",
      esbuild: "^0.25.4",
      "ip-address": "^10.2.0",
    },
  });

  assert.deepEqual(result.failures, []);
});

test("package override runbook lists the current package overrides", () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const runbook = readFileSync(path.join(repoRoot, "docs", "DEPENDENCY_SUPPLY_CHAIN.md"), "utf8");
  const dependencyNotes = readFileSync(path.join(repoRoot, "docs", "DEPENDENCY-NOTES.md"), "utf8");

  for (const packageName of Object.keys(packageJson.overrides ?? {})) {
    assert.match(runbook, new RegExp(`\\| \`${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\` \\|`));
    assert.match(dependencyNotes, new RegExp(`\\| \`${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\` \\|`));
  }

  assert.doesNotMatch(runbook, /\| `dompurify` \|/);
  assert.doesNotMatch(dependencyNotes, /\| `dompurify` \|/);
});

test("dependency notes document CI audit automation and compression mitigation", () => {
  const dependencyNotes = readFileSync(path.join(repoRoot, "docs", "DEPENDENCY-NOTES.md"), "utf8");
  const supplyChainNotes = readFileSync(path.join(repoRoot, "docs", "DEPENDENCY_SUPPLY_CHAIN.md"), "utf8");
  const ciWorkflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  const releaseWorkflow = readFileSync(path.join(repoRoot, ".github", "workflows", "release-verification.yml"), "utf8");

  for (const marker of [
    "npm run audit:dependencies",
    "compression@1.8.2",
    "1024",
    "Gzip level is explicitly set to `6`",
    "Binary API responses are left uncompressed",
    "server/internal/local-http-compression.ts",
    "server/internal/local-http-body-parsers.ts",
    "Safe to remove when",
  ]) {
    assert.match(dependencyNotes, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(supplyChainNotes, /docs\/DEPENDENCY-NOTES\.md/);
  assert.match(ciWorkflow, /npm run audit:dependencies/);
  assert.match(releaseWorkflow, /npm run audit:dependencies/);
});

test("security-critical dependency audit requires exact direct pins except documented patch ranges", () => {
  const result = analyzeSecurityCriticalDependencyPins({
    dependencies: {
      bcrypt: "^6.0.0",
      busboy: "^1.6.0",
      compression: "1.8.1",
      dompurify: "3.4.1",
      dotenv: "16.6.1",
      "drizzle-orm": "0.45.2",
      "drizzle-zod": "0.7.1",
      express: "5.2.1",
      "express-rate-limit": "8.4.1",
      helmet: "8.1.0",
      jsonwebtoken: "9.0.3",
      nodemailer: "8.0.6",
      pg: "8.20.0",
      pino: "10.3.1",
      redis: "5.12.1",
      ws: "8.20.1",
      zod: "3.25.76",
    },
  });

  assert.match(result.failures.join("\n"), /busboy must be pinned to an exact version/);
  assert.match(result.failures.join("\n"), /zod-validation-error is missing from direct dependencies/);
  assert.doesNotMatch(result.failures.join("\n"), /bcrypt/);
  assert.match(result.documentedPatchRanges.bcrypt, /security patch/i);
});

test("security-critical dependency audit accepts exact direct pins and documented bcrypt patch range", () => {
  const result = analyzeSecurityCriticalDependencyPins({
    dependencies: {
      ...Object.fromEntries([
      "bcrypt",
      "busboy",
      "compression",
      "dompurify",
      "dotenv",
      "drizzle-orm",
      "drizzle-zod",
      "express",
      "express-rate-limit",
      "helmet",
      "jsonwebtoken",
      "nodemailer",
      "pg",
      "pino",
      "redis",
      "ws",
      "zod",
      "zod-validation-error",
      ].map((packageName) => [packageName, "1.2.3"])),
      bcrypt: "^6.0.0",
    },
  });

  assert.deepEqual(result.failures, []);
});
