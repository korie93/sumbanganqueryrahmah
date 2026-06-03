import assert from "node:assert/strict";
import test from "node:test";
import { readThemeTokenSource } from "../lib/design-token-source.mjs";

test("theme shadow 2xl tokens keep layered depth like the other elevation tokens", () => {
  const css = readThemeTokenSource();
  const declarations = [...css.matchAll(/--shadow-2xl:\s*([^;]+);/g)].map((match) => match[1]);

  assert.equal(declarations.length, 2);
  for (const declaration of declarations) {
    assert.match(declaration, /,/);
    assert.match(declaration, /0px 16px 24px -4px/);
  }
});
