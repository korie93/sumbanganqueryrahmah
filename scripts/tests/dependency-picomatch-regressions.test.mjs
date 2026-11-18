import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const pm = require("picomatch");

test("glob unescaping preserves bracket, newline and trailing escape semantics", () => {
  const { removeBackslashes } = require("picomatch/lib/utils");
  const legacy = input => input.replace(pm.constants.REGEX_REMOVE_BACKSLASH, match => match === "\\" ? "" : match);
  const alphabet = ["a", "\\", "[", "]", "\n"];
  const compare = input => {
    assert.equal(removeBackslashes(input), legacy(input), JSON.stringify(input));
    if (input.length < 5) for (const ch of alphabet) compare(input + ch);
  };
  compare("");
  for (const newline of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
    for (const input of ["[a\\" + newline + "]\\b", "[a\\" + newline + "x]\\b", "\\" + newline]) {
      assert.equal(removeBackslashes(input), legacy(input));
    }
  }
  const result = pm.scan("dir/file\\*.js/[a\\-z]/*.t\\s", { unescape: true });
  assert.equal(result.base, "dir/file*.js");
  assert.equal(result.glob, "[a\\-z]/*.ts");
});

// Only short strings; establish unsafe compilation without running a DoS payload.
test("repeated extglobs cannot nest wildcard repetition, including single branches", () => {
  for (const pattern of ["+(*)", "+(*a)", "*(*a)", "+(a*)", "+(*?a)", "+(@(*a))", "+(*a|b)"]) {
    for (const options of [{}, { fastpaths: false }, { maxExtglobRecursion: false }, { capture: true }]) {
      assert.equal(pm(pattern, options)("aaa"), false, `${pattern} must be literalized`);
      assert.equal(pm(pattern, options)(pattern), true, `${pattern} retains safe literal matching`);
      assert.equal(pm.makeRe(pattern, options).test("aaa"), false);
      assert.equal(pm.isMatch("aaa", pattern, options), false);
    }
  }
});

test("tinyglobby traverses the expected synthetic files with the patched scanner", async t => {
  const { glob, globSync } = await import("tinyglobby");
  const cwd = mkdtempSync(path.join(tmpdir(), "sqr-glob-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const name of ["client/home.tsx", "client/home.test.tsx", "client/.hidden.ts", "server/api.ts", "server/api.js", "shared/schema.ts"]) {
    const file = path.join(cwd, name);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, "");
  }
  const options = { cwd, dot: true, ignore: ["**/*.test.*"] };
  const expected = ["client/.hidden.ts", "client/home.tsx", "server/api.ts"];
  assert.deepEqual((await glob(["{client,server}/**/*.{ts,tsx}"], options)).sort(), expected);
  assert.deepEqual(globSync(["{client,server}/**/*.{ts,tsx}"], options).sort(), expected);
});

test("tooling glob semantics and scanner API remain compatible", () => {
  for (const [file, pattern, options, expected] of [
    ["client/src/home.tsx", "client/**/*.{ts,tsx}", {}, true],
    ["client/src/home.js", "client/**/*.{ts,tsx}", {}, false],
    ["server/.hidden.ts", "**/*.ts", { dot: true }, true],
    ["server/.hidden.ts", "**/*.ts", {}, false],
    ["src/home.ts", "*.ts", { matchBase: true }, true],
    ["foo.ts", "!*.test.ts", {}, true],
    ["foo.test.ts", "!*.test.ts", {}, false],
    ["file.tsx", "file.@(ts|tsx)", {}, true],
    ["abab", "+(ab)", {}, true],
    ["***", "+(\\*)", {}, true],
    ["***", "+([*])", {}, true],
    ["a.ts", ["*.tsx", "*.ts"], {}, true],
    ["a.test.ts", "*.ts", { ignore: "*.test.ts" }, false],
  ]) assert.equal(pm(pattern, options)(file), expected, `${file}: ${pattern}`);
  assert.equal(pm.scan("client/src/**/*.tsx").base, "client/src");
  assert.deepEqual(pm.scan("client/src/**/*.tsx", { parts: true }).parts, ["client", "src", "**", "*.tsx"]);
  assert.equal(pm.scan("!**/*.test.ts").negated, true);
});
