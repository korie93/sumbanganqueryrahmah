import assert from "node:assert/strict";
import * as fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as esmGlob from "glob";

const require = createRequire(import.meta.url);
const TestExclude = require("test-exclude");
const globApis = [
  ["ESM", esmGlob],
  ["CommonJS", require("glob")],
];

async function createFixture(t) {
  const cwd = await mkdtemp(path.join(tmpdir(), "sqr-glob-regression-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  await mkdir(path.join(cwd, "src", "nested"), { recursive: true });
  await mkdir(path.join(cwd, "node_modules"));
  for (const filename of [
    "src/alpha.ts",
    "src/alpha.test.ts",
    "src/.hidden.ts",
    "src/nested/beta.ts",
    "node_modules/vendor.ts",
    "README.md",
  ]) {
    await writeFile(path.join(cwd, filename), "fixture\n");
  }

  return cwd;
}

test("glob upgrades preserve coverage discovery and stop canceled traversal", async (t) => {
  // Only three child directories and six tiny files are created under tmpdir(),
  // so even a broken cancellation check cannot traverse an unbounded tree.
  const cwd = await createFixture(t);
  const expected = ["src/.hidden.ts", "src/alpha.ts", "src/nested/beta.ts"];

  await t.test("ESM and CommonJS glob discovery retain async and sync behavior", async () => {
    const options = {
      cwd,
      nodir: true,
      dot: true,
      posix: true,
      ignore: ["**/*.test.ts", "**/node_modules/**"],
    };

    for (const [moduleFormat, api] of globApis) {
      assert.deepEqual((await api.glob("**/*.{ts,tsx}", options)).sort(), expected, moduleFormat);
      assert.deepEqual(api.globSync("**/*.{ts,tsx}", options).sort(), expected, moduleFormat);
      assert.equal(api.glob.sync, api.globSync, `${moduleFormat}: legacy sync alias`);
    }
  });

  await t.test("test-exclude retains the file selection used by c8", async () => {
    const exclude = new TestExclude({
      cwd,
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      extension: [".ts"],
      excludeNodeModules: true,
    });

    assert.deepEqual(exclude.globSync().sort(), expected);
    assert.deepEqual((await exclude.glob()).sort(), expected);
  });

  await t.test("aborting the first directory read prevents later sync-stream reads", () => {
    // GHSA-3g3m-2fjr-6pw4: a canceled walker must return before processing
    // child directories. The synchronous stream settles its reads without
    // sleeps or timing assertions; this fixture has at most four directories.
    // https://github.com/isaacs/node-glob/blob/v14.0.2/test/signal.ts
    for (const [moduleFormat, api] of globApis) {
      const controller = new AbortController();
      const reason = new Error("fixture traversal canceled");
      let directoryReads = 0;
      const countedFs = {
        ...fs,
        readdirSync(...args) {
          directoryReads += 1;
          if (directoryReads === 1) controller.abort(reason);
          return fs.readdirSync(...args);
        },
      };
      const stream = api.globStreamSync("**", {
        cwd,
        signal: controller.signal,
        fs: countedFs,
      });
      const errors = [];
      stream.on("error", (error) => errors.push(error));
      stream.resume();

      assert.deepEqual(errors, [reason], `${moduleFormat}: original abort error`);
      assert.equal(directoryReads, 1, `${moduleFormat}: no reads after cancellation`);
    }
  });
});
