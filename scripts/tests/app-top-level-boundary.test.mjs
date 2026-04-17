import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const appPath = path.join(rootDir, "client", "src", "App.tsx");

test("App keeps a top-level route error boundary around AppContent", async () => {
  const source = await fs.readFile(appPath, "utf8");

  assert.match(source, /<AppRouteErrorBoundary[\s\S]*routeKey="app-root"/);
  assert.match(source, /<AppContent \/>/);
});
