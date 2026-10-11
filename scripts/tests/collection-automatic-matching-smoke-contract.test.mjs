import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("Collection browser probes wait for automatic matching instead of clicking a removed action", () => {
  // NAT simulation intentionally tests a pinned historical application revision,
  // not the current working tree; its legacy manual matching flow stays intact.
  for (const name of ["ui-smoke.mjs", "collection-save-access-smoke.mjs"]) {
    const source = read(name);
    assert.doesNotMatch(source, /Semak Auto-matching|save-collection-source-match-action/, name);
    assert.match(source, /\/api\/collection\/source-matches/, name);
    assert.match(source, /name: "Save Collection"/, `${name} must keep explicit saving`);
  }
});

test("receipt smoke arms the matching listener before completing Amount", () => {
  const source = read("ui-smoke.mjs");
  assert.match(source, /const \[sourceMatchResponse\] = await Promise\.all\(\[\s+page\.waitForResponse\([\s\S]*?getInputByLabel\(page, "Amount \(RM\)"\)\.fill\("12\.34"\),\s+\]\)/);
  assert.match(source, /sourceMatchResponse\.status\(\) === 200/);
  assert.match(source, /match\?\.sourceImportId === sourceImport\.id/);
});

test("role probe arms matching before the final date selection", () => {
  const roleProbe = read("collection-save-access-smoke.mjs");
  assert.match(roleProbe, /const \[response\] = await Promise\.all\(\[\s+page\.waitForResponse\([\s\S]*?\/api\/collection\/source-matches[\s\S]*?button\[name="day"\][\s\S]*?\.click\(\),\s+\]\)/);
  assert.match(roleProbe, /assert\.equal\(response\.status\(\), 200/);
  assert.match(roleProbe, /match\.sourceImportId === fixture\.sourceId/);
});
