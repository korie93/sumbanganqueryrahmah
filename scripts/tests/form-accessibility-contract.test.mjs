import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const formPath = path.resolve(process.cwd(), "client/src/components/ui/form.tsx");

test("form controls keep stable error linkage and polite message announcements", () => {
  const source = readFileSync(formPath, "utf8");

  assert.match(source, /aria-errormessage=\{formMessageId\}/);
  assert.match(source, /aria-required=\{ariaRequired\}/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /mergeAriaDescribedByIds\(/);
});
