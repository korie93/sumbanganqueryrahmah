import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const loginCssPath = path.resolve(process.cwd(), "client", "src", "pages", "Login.css");

test("Login.css avoids !important overrides", () => {
  const css = readFileSync(loginCssPath, "utf8");
  const importantMatches = css.match(/!important/g) ?? [];

  assert.equal(
    importantMatches.length,
    0,
    `Expected Login.css to avoid !important overrides, found ${importantMatches.length}.`,
  );
});
