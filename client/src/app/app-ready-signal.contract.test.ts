import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("App removes the boot shell only after public app state is initialized", () => {
  const source = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");

  assert.match(source, /function AppReadySignal\(\{ ready \}: \{ ready: boolean \}\)/);
  assert.match(source, /if \(!ready \|\| typeof window === "undefined"\)/);
  assert.match(source, /const readySignal = <AppReadySignal ready=\{isInitialized\} \/>/);
  assert.doesNotMatch(source, /<AppReadySignal \/>/);
});
