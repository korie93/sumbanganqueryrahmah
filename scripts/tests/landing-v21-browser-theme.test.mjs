import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Inspect wiring without importing browser launchers or starting a server. The
// callback's real lifecycle behavior is exercised in browser-theme-fixture.test.
for (const [file, mode] of [
  ["scripts/landing-v21-built-browser.mjs", "preserve-choice"],
  ["tests/visual/landing-next.spec.ts", "system"],
  ["tests/visual/public-theme-continuity.spec.ts", "preserve-choice"],
  ["tests/visual/brand-logo.spec.ts", "fixed"],
]) {
  test(`${file} selects the shared ${mode} fixture instead of resetting preferences itself`, () => {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
      file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    const imported = syntax.statements.find((node) => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.endsWith("/browser-theme-fixture.mjs"));
    assert.ok(imported, "The caller uses the common fixture module");
    const calls = [];
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "addInitScript") calls.push(node);
      ts.forEachChild(node, visit);
    }
    visit(syntax);
    const selected = calls.filter((node) => ts.isIdentifier(node.arguments[0])
      && node.arguments[0].text === "initializeBrowserThemeFixture");
    assert.equal(selected.length, 1, "Exactly one explicit theme lifecycle initializer");
    const options = selected[0].arguments[1];
    assert.ok(options && ts.isObjectLiteralExpression(options));
    const property = (name) => options.properties.find((node) => ts.isPropertyAssignment(node)
      && node.name.getText(syntax) === name);
    const configuredMode = property("mode");
    assert.ok(configuredMode && ts.isStringLiteral(configuredMode.initializer));
    assert.equal(configuredMode.initializer.text, mode);
    assert.ok(options.properties.some((node) => node.name?.getText(syntax) === "origin"), "The fixture is restricted to this test's exact loopback origin");
    // Hardware/observer/online callbacks may run in either order. Storage setup
    // and intentional denial must remain together in the shared initializer.
    for (const call of calls.filter((node) => !selected.includes(node))) {
      const callback = call.arguments[0];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        assert.doesNotMatch(callback.getText(syntax), /\b(?:localStorage|sessionStorage)\b|Storage\.prototype/);
      }
    }
  });
}
