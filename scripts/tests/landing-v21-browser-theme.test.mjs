import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

// Extract the real browser fixture's callback without importing its launcher,
// starting a server, loading Playwright or reproducing the initializer here.
const source = readFileSync(new URL("../landing-v21-built-browser.mjs", import.meta.url), "utf8");
const syntax = ts.createSourceFile("landing-v21-built-browser.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fixture = syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "installFixture");
assert.ok(fixture?.body, "The built-browser fixture remains identifiable");
const initializers = [];
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "context"
    && node.expression.name.text === "addInitScript") initializers.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(fixture.body);
assert.equal(initializers.length, 1, "Exercise the actual context initializer, not a test copy");
assert.ok(ts.isArrowFunction(initializers[0]) || ts.isFunctionExpression(initializers[0]));
const initialize = new Script(`(${initializers[0].getText(syntax)})(fixtureOptions)`, {
  filename: "landing-built-fixture-init.js",
});
const origin = "http://127.0.0.1:32123";

function documentHarness(values = new Map(), documentOrigin = origin) {
  const writes = [];
  let storageAccesses = 0;
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { writes.push([key, String(value)]); values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
  const sandbox = {
    fixtureOptions: { origin, performanceMode: "low", cores: 2, memory: 2, saveData: true, effectiveType: "2g" },
    location: { origin: documentOrigin },
    navigator: {},
    document: { addEventListener() {}, getElementById() { return null; } },
    window: { addEventListener() {} },
    performance: { now: () => 1 },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  Object.defineProperty(sandbox, "localStorage", { get() {
    storageAccesses++;
    assert.equal(documentOrigin, origin, "Foreign/about:blank initialization must not access storage");
    return localStorage;
  } });
  return {
    run: () => initialize.runInNewContext(sandbox, { timeout: 1_000 }),
    writes,
    storageAccesses: () => storageAccesses,
  };
}

test("a fresh own-origin built-browser document receives the initial light preference", () => {
  const values = new Map();
  const document = documentHarness(values);
  document.run();
  assert.equal(values.get("theme"), "light");
  assert.deepEqual(document.writes.filter(([key]) => key === "theme"), [["theme", "light"]]);
});

test("real theme changes survive later fixture documents in both directions", () => {
  const values = new Map();
  documentHarness(values).run();
  // A user changes the canonical preference between real document loads.
  for (const selected of ["dark", "light", "dark"]) {
    values.set("theme", selected);
    const nextDocument = documentHarness(values);
    nextDocument.run();
    assert.equal(values.get("theme"), selected, `Reload/login preserves the selected ${selected} theme`);
    assert.deepEqual(nextDocument.writes.filter(([key]) => key === "theme"), [], "The fixture never overwrites a real choice");
  }
});

test("pre-existing dark and light preferences are preserved on the first document", () => {
  for (const selected of ["dark", "light"]) {
    const values = new Map([["theme", selected]]);
    const document = documentHarness(values);
    document.run();
    assert.equal(values.get("theme"), selected);
    assert.deepEqual(document.writes.filter(([key]) => key === "theme"), []);
  }
});

test("foreign-origin and about:blank documents return before any storage access", () => {
  for (const documentOrigin of ["https://outside.invalid", "null"]) {
    const values = new Map([["theme", "dark"]]);
    const document = documentHarness(values, documentOrigin);
    document.run();
    assert.equal(document.storageAccesses(), 0);
    assert.deepEqual(document.writes, []);
    assert.deepEqual([...values], [["theme", "dark"]]);
  }
});
