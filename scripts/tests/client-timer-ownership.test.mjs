import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const clientSrcRoot = path.join(repoRoot, "client", "src");
const SOURCE_FILE_EXTENSIONS = new Set([".ts", ".tsx"]);

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function collectSourceFiles(directoryPath) {
  const files = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (!entry.isFile() || !SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(absolutePath);
  }
  return files;
}

function effectHasTimerCleanup(bodyText, source, timerKind) {
  const directCleanupPattern = new RegExp(`\\b(?:window\\.)?clear${timerKind}\\s*\\(`);
  if (directCleanupPattern.test(bodyText)) {
    return true;
  }

  const helperCalls = [...bodyText.matchAll(/\b(clear[A-Z][A-Za-z0-9_]*)\s*\(/g)]
    .map((match) => match[1]);
  return helperCalls.some((helperName) => {
    const helperPattern = new RegExp(
      `const\\s+${helperName}\\s*=\\s*useCallback\\([\\s\\S]*?\\b(?:window\\.)?clear${timerKind}\\s*\\(`,
    );
    return helperPattern.test(source);
  });
}

function extractUseEffectTimerFailures(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const failures = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "useEffect"
    ) {
      const callback = node.arguments[0];
      if (
        callback
        && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        && ts.isBlock(callback.body)
      ) {
        const bodyText = callback.body.getText(sourceFile);
        const usesTimeout = /\b(?:window\.)?setTimeout\s*\(/.test(bodyText);
        const usesInterval = /\b(?:window\.)?setInterval\s*\(/.test(bodyText);
        const clearsTimeout = effectHasTimerCleanup(bodyText, source, "Timeout");
        const clearsInterval = effectHasTimerCleanup(bodyText, source, "Interval");

        if (usesTimeout && !clearsTimeout) {
          failures.push("setTimeout without clearTimeout cleanup");
        }
        if (usesInterval && !clearsInterval) {
          failures.push("setInterval without clearInterval cleanup");
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return failures.map((failure) => {
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    return `${relativePath}: ${failure}`;
  });
}

test("AutoLogout centralizes browser timers through useTimers", () => {
  const autoLogoutSource = readSource("client/src/components/AutoLogout.tsx");
  const activityRuntimeSource = readSource("client/src/components/auto-logout-activity-runtime.ts");
  const socketRuntimeSource = readSource("client/src/components/auto-logout-socket-runtime.ts");
  const timersHookSource = readSource("client/src/hooks/useTimers.ts");

  assert.match(autoLogoutSource, /import \{ useTimers \} from "@\/hooks\/useTimers"/);
  assert.match(autoLogoutSource, /const \{[\s\S]*setManagedInterval[\s\S]*setManagedTimeout[\s\S]*\} = useTimers\(\)/);
  assert.doesNotMatch(autoLogoutSource, /window\.set(?:Timeout|Interval)|window\.clear(?:Timeout|Interval)/);

  assert.match(activityRuntimeSource, /setHeartbeatInterval: \(callback: \(\) => void, delayMs: number\) => number/);
  assert.doesNotMatch(activityRuntimeSource, /window\.setInterval/);

  assert.match(socketRuntimeSource, /setReconnectTimeout: \(callback: \(\) => void, delayMs: number\) => number/);
  assert.doesNotMatch(socketRuntimeSource, /window\.setTimeout/);

  assert.match(timersHookSource, /useEffect\(\(\) => clearAllTimers, \[clearAllTimers\]\)/);
  assert.match(timersHookSource, /timeoutIdsRef\.current\.clear\(\)/);
  assert.match(timersHookSource, /intervalIdsRef\.current\.clear\(\)/);
});

test("useEffect browser timers have deterministic cleanup", () => {
  const failures = collectSourceFiles(clientSrcRoot)
    .flatMap(extractUseEffectTimerFailures);

  assert.deepEqual(failures, []);
});
