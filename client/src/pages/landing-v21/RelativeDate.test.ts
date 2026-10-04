import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("preview dates reuse a formatter without changing locale or calendar-day subtraction", () => {
  const code = ts.transpileModule(readFileSync(new URL("./RelativeDate.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  let formatters = 0;
  let now = new Date(2026, 9, 4, 12).getTime();
  class FixtureDate extends Date { constructor() { super(now); } }
  const exports: { RelativeDate?: (props: { daysAgo: number }) => string } = {};
  runInNewContext(code, {
    exports, Date: FixtureDate,
    Intl: { DateTimeFormat: class extends Intl.DateTimeFormat {
      constructor(locale: string, options: Intl.DateTimeFormatOptions) { super(locale, options); formatters++; }
    } },
    React: { createElement: (_tag: string, _props: unknown, value: string) => value },
  });
  for (const timestamp of [new Date(2026, 9, 4, 12).getTime(), new Date(2027, 0, 1, 12).getTime()]) {
    now = timestamp;
    for (const daysAgo of [0, 1, 2, 31]) {
      const expected = new Date(now);
      expected.setDate(expected.getDate() - daysAgo);
      assert.equal(exports.RelativeDate!({ daysAgo }), expected.toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      }));
    }
  }
  assert.equal(formatters, 1, "Repeated rows and tab changes must reuse one formatter");
});
