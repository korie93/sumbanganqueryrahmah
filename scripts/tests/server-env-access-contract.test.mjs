import test from "node:test";
import assert from "node:assert/strict";
import { findDisallowedServerEnvAccess } from "../lib/server-env-access-contract.mjs";

test("server env access contract allows direct env access in the central runtime helpers", () => {
  const findings = findDisallowedServerEnvAccess({
    filePath: "server/config/runtime-config-read-utils.ts",
    text: `
const value = process.env[name];
return resolveRuntimeEnvironment(process.env.NODE_ENV);
`,
  });

  assert.deepEqual(findings, []);
});

test("server env access contract flags direct env access in feature modules", () => {
  const findings = findDisallowedServerEnvAccess({
    filePath: "server/routes/example.ts",
    text: `
const debugEnabled = process.env.DEBUG_LOGS === "1";
`,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].filePath, "server/routes/example.ts");
  assert.equal(findings[0].lineNumber, 2);
  assert.match(findings[0].snippet, /process\.env\.DEBUG_LOGS/);
});
