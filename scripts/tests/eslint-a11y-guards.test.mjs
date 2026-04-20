import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

async function lintSnippet(code, filePath) {
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: path.resolve(process.cwd(), "eslint.config.mjs"),
  });

  const [result] = await eslint.lintText(code, {
    filePath,
  });

  return result.messages.map((message) => message.ruleId).filter(Boolean);
}

test("eslint a11y guard flags icon-only Button instances without an accessible name", async () => {
  const violations = await lintSnippet(
    [
      'import { Button } from "@/components/ui/button";',
      "",
      "export function Example() {",
      "  return (",
      '    <Button size=\"icon\">',
      '      <svg aria-hidden=\"true\" />',
      "    </Button>",
      "  );",
      "}",
    ].join("\n"),
    "client/src/components/ui/button.tsx",
  );

  assert.deepEqual(violations, [
    "jsx-a11y/control-has-associated-label",
    "sqr-a11y/audited-accessible-name",
  ]);
});

test("eslint a11y guard allows icon-only Button instances when aria-label is present", async () => {
  const violations = await lintSnippet(
    [
      'import { Button } from "@/components/ui/button";',
      "",
      "export function Example() {",
      "  return (",
      '    <Button size=\"icon\" aria-label=\"Refresh\">',
      '      <svg aria-hidden=\"true\" />',
      "    </Button>",
      "  );",
      "}",
    ].join("\n"),
    "client/src/components/ui/button.tsx",
  );

  assert.deepEqual(violations, []);
});

test("eslint a11y guard flags Input instances without an accessible name", async () => {
  const violations = await lintSnippet(
    [
      'import { Input } from "@/components/ui/input";',
      "",
      "export function Example() {",
      "  return <Input />;",
      "}",
    ].join("\n"),
    "client/src/components/ui/input.tsx",
  );

  assert.deepEqual(violations, ["sqr-a11y/audited-accessible-name"]);
});

test("eslint a11y guard accepts Input instances associated through Label htmlFor", async () => {
  const violations = await lintSnippet(
    [
      'import { Input } from "@/components/ui/input";',
      'import { Label } from "@/components/ui/label";',
      "",
      "export function Example() {",
      "  return (",
      "    <>",
      '      <Label htmlFor=\"search\">Search</Label>',
      '      <Input id=\"search\" />',
      "    </>",
      "  );",
      "}",
    ].join("\n"),
    "client/src/components/ui/input.tsx",
  );

  assert.deepEqual(violations, []);
});
