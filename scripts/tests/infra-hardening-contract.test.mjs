import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = process.cwd();
const codeqlWorkflowPath = path.resolve(rootDir, ".github/workflows/codeql.yml");
const systemdExamplePath = path.resolve(rootDir, "deploy/systemd/sqr.service.example");
const dockerfilePath = path.resolve(rootDir, "Dockerfile");
const floatingAiCssPath = path.resolve(rootDir, "client/src/components/FloatingAI.module.css");

test("CodeQL workflow keeps least-privilege top-level permissions", () => {
  const workflow = readFileSync(codeqlWorkflowPath, "utf8");

  assert.doesNotMatch(workflow, /actions:\s*read/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /security-events:\s*write/);
});

test("systemd example keeps stronger sandboxing without removing required writable paths", () => {
  const serviceFile = readFileSync(systemdExamplePath, "utf8");

  assert.match(serviceFile, /ProtectSystem=strict/);
  assert.match(serviceFile, /ProtectClock=true/);
  assert.match(serviceFile, /ReadWritePaths=.*uploads/);
  assert.match(serviceFile, /SystemCallFilter=@system-service/);
});

test("Dockerfile keeps bounded health checks and OCI labels", () => {
  const dockerfile = readFileSync(dockerfilePath, "utf8");

  assert.match(dockerfile, /org\.opencontainers\.image\.title=/);
  assert.match(dockerfile, /AbortController/);
});

test("Floating AI viewport sizing uses the shared viewport token instead of duplicated vh fallbacks", () => {
  const css = readFileSync(floatingAiCssPath, "utf8");

  assert.match(css, /--floating-ai-viewport-height: var\(--viewport-min-height-value, 100vh\)/);
  assert.doesNotMatch(css, /@supports not \(height: 100dvh\)/);
});
