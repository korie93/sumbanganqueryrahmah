import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("theme shadow 2xl tokens keep layered depth like the other elevation tokens", () => {
  const css = readFileSync("client/src/theme-tokens.css", "utf8");
  const declarations = [...css.matchAll(/--shadow-2xl:\s*([^;]+);/g)].map((match) => match[1]);

  assert.equal(declarations.length, 2);
  for (const declaration of declarations) {
    assert.match(declaration, /,/);
    assert.match(declaration, /0px 16px 24px -4px/);
  }
});
