import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDependencyAuditExecution,
  DEPENDENCY_AUDIT_FETCH_TIMEOUT_MS,
  DEPENDENCY_AUDIT_MAX_ATTEMPTS,
  DEPENDENCY_AUDIT_MAX_BUFFER,
  DEPENDENCY_AUDIT_RETRY_DELAY_MS,
  DEPENDENCY_AUDIT_TIMEOUT_MS,
  isRetryableDependencyAuditExecution,
  runDependencyAuditWithRetry,
} from "../lib/dependency-audit.mjs";

const clean = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 },
  },
};
const execution = (report = clean, overrides = {}) => ({ status: 0, signal: null, stdout: JSON.stringify(report), stderr: "", ...overrides });
const timedOut = execution(undefined, { status: null, stdout: "", signal: "SIGKILL", error: { code: "ETIMEDOUT" } });

async function runSequence(results) {
  let calls = 0;
  const waits = [];
  const retries = [];
  const result = await runDependencyAuditWithRetry(() => {
    const next = results[Math.min(calls, results.length - 1)];
    calls += 1;
    return next;
  }, {
    wait: async (milliseconds) => { waits.push(milliseconds); },
    onRetry: (...args) => { retries.push(args); },
  });
  return { result, calls, waits, retries };
}

test("audit HTTP and retry budgets stay bounded below the process cap", () => {
  assert.equal(DEPENDENCY_AUDIT_FETCH_TIMEOUT_MS, 30_000);
  assert.equal(DEPENDENCY_AUDIT_TIMEOUT_MS, 120_000);
  assert.equal(DEPENDENCY_AUDIT_MAX_ATTEMPTS, 2);
  assert.equal(DEPENDENCY_AUDIT_RETRY_DELAY_MS, 1_500);
});

test("a process timeout can recover only through a fresh complete clean report", async () => {
  const next = execution();
  const result = await runSequence([timedOut, next]);
  assert.equal(result.result, next);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.waits, [DEPENDENCY_AUDIT_RETRY_DELAY_MS]);
  assert.deepEqual(result.retries, [[2, 2]]);
  assert.deepEqual(analyzeDependencyAuditExecution(result.result), { allowed: [], failures: [] });
});

test("repeated timeouts exhaust exactly two attempts and still fail closed", async () => {
  const result = await runSequence([timedOut]);
  assert.equal(result.calls, 2);
  assert.equal(result.waits.length, 1);
  assert.equal(result.result, timedOut);
  assert.match(analyzeDependencyAuditExecution(result.result).failures[0], /execution timeout/);
});

test("audit recognizes npm's real uncoded endpoint timeout wrapper without using diagnostic fields", async () => {
  const wrapped = execution({
    message: "network timeout at: https://user:synthetic-password@registry.example.test/-/npm/v1/security/advisories/bulk",
    error: { summary: "", detail: "audit endpoint returned an error" },
    uri: "untrusted diagnostic URL", body: "untrusted response body",
  }, { status: 1 });
  const result = await runSequence([wrapped, execution()]);
  assert.equal(result.calls, 2);
  assert.deepEqual(analyzeDependencyAuditExecution(result.result).failures, []);
});

for (const code of ["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET", "EAI_AGAIN", "E429", "E500", "E502", "E503", "E504"]) {
  test(`audit retries an explicit transient ${code} error once`, async () => {
    const result = await runSequence([execution({ error: { code } }, { status: 1 }), execution()]);
    assert.equal(result.calls, 2);
    assert.deepEqual(analyzeDependencyAuditExecution(result.result).failures, []);
  });
}

for (const statusCode of [429, 500, 502, 503, 504]) {
  test(`audit retries npm endpoint wrapper HTTP ${statusCode} without an error code`, () => {
    assert.equal(isRetryableDependencyAuditExecution(execution({ statusCode, error: { summary: "audit endpoint returned an error" } }, { status: 1 })), true);
  });
}

for (const [name, result] of [
  ["clean report", execution()],
  ["empty output", execution(undefined, { stdout: "" })],
  ["truncated JSON", execution(undefined, { stdout: '{"auditReportVersion":2' })],
  ["schema-invalid report", execution({ auditReportVersion: 2, error: { code: "E503" } })],
  ["registry auth error", execution({ error: { code: "E401" } }, { status: 1 })],
  ["registry permission error", execution({ error: { code: "E403" } }, { status: 1 })],
  ["permanent error with conflicting HTTP status", execution({ statusCode: 503, error: { code: "ENOLOCK" } }, { status: 1 })],
  ["auth HTTP status with conflicting code", execution({ statusCode: 403, error: { code: "E503" } }, { status: 1 })],
  ["HTTP status without npm error object", execution({ statusCode: 503 }, { status: 1 })],
  ["timeout message with permanent HTTP status", execution({ statusCode: 404, message: "network timeout at: ignored", error: {} }, { status: 1 })],
  ["timeout message with malformed HTTP status", execution({ statusCode: "403", message: "network timeout at: ignored", error: {} }, { status: 1 })],
  ["timeout message with null HTTP status", execution({ statusCode: null, message: "network timeout at: ignored", error: {} }, { status: 1 })],
  ["timeout message with null error code", execution({ message: "network timeout at: ignored", error: { code: null } }, { status: 1 })],
  ["timeout message with auth error", execution({ message: "network timeout at: ignored", error: { code: "E401" } }, { status: 1 })],
  ["timeout-looking diagnostic body or URI", execution({ error: {}, body: "network timeout at: ignored", uri: "network timeout at: ignored" }, { status: 1 })],
  ["timeout message without npm error object", execution({ message: "network timeout at: ignored" }, { status: 1 })],
  ["unsupported exit status", execution({ error: { code: "E503" } }, { status: 2 })],
  ["buffer overflow", execution(undefined, { stdout: "", error: { code: "ENOBUFS" } })],
  ["missing executable", execution(undefined, { stdout: "", error: { code: "ENOENT" } })],
  ["signal termination", execution({ error: { code: "E503" } }, { status: null, signal: "SIGTERM" })],
  ["oversized error JSON", execution({ error: { code: "E503", message: "x".repeat(DEPENDENCY_AUDIT_MAX_BUFFER) } })],
  ["oversized stdout with timeout", { ...timedOut, stdout: "x".repeat(DEPENDENCY_AUDIT_MAX_BUFFER + 1) }],
  ["clean stdout from timed-out process", { ...timedOut, stdout: JSON.stringify(clean) }],
  ["invalid result", null],
]) {
  test(`audit never retries ${name}`, async () => {
    const observed = await runSequence([result, execution()]);
    assert.equal(observed.calls, 1);
    assert.equal(observed.result, result);
    assert.deepEqual(observed.waits, []);
    assert.deepEqual(observed.retries, []);
  });
}

for (const severity of ["low", "moderate", "high", "critical"]) {
  test(`audit preserves the first complete ${severity} report after a timeout`, async () => {
    const report = structuredClone(clean);
    report.vulnerabilities.example = {
      name: "example", severity, isDirect: false, range: "*",
      nodes: ["node_modules/example"], effects: [], fixAvailable: false,
      via: [{ name: "example", dependency: "example", title: "Example finding", url: "https://example.test/advisory", severity, range: "*" }],
    };
    report.metadata.vulnerabilities[severity] = 1;
    report.metadata.vulnerabilities.total = 1;
    report.metadata.dependencies.total = 1;
    const finding = execution(report, { status: 1 });
    const result = await runSequence([timedOut, finding, execution()]);
    assert.equal(result.calls, 2);
    assert.equal(result.result, finding);
    assert.equal(isRetryableDependencyAuditExecution(finding), false);
    assert.equal(isRetryableDependencyAuditExecution({ ...timedOut, stdout: finding.stdout }), false);
    assert.equal(analyzeDependencyAuditExecution(result.result).failures.length, severity === "low" ? 0 : 1);
  });
}
