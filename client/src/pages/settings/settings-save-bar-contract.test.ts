import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "client/src/pages/settings/SettingsSaveBar.tsx"),
  "utf8",
);

test("settings save bar surfaces an unsaved change summary", () => {
  assert.match(source, /changeSummary: SettingChangeSummary\[\]/);
  assert.match(source, /visibleChanges = changeSummary\.slice\(0, 3\)/);
  assert.match(source, /Unsaved settings summary/);
  assert.match(source, /\+\{remainingChangeCount\} more/);
  assert.match(source, /title=\{`\$\{change\.label\}: \$\{change\.previousValue\} to \$\{change\.nextValue\}`\}/);
});
