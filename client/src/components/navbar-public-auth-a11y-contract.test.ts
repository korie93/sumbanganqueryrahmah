import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readComponentSource(filename: string) {
  return readFileSync(
    path.resolve(process.cwd(), "client", "src", "components", filename),
    "utf8",
  );
}

test("navbar mobile trigger exposes the expanded state for assistive technology", () => {
  const source = readComponentSource("Navbar.tsx");

  assert.match(source, /aria-controls="mobile-navigation-drawer"/);
  assert.match(source, /getAriaExpandedProps\(mobileNavOpen\)/);
  assert.match(source, /\{\.\.\.mobileNavTriggerExpandedProps\}/);
  assert.doesNotMatch(source, /"aria-expanded": mobileNavOpen/);
  assert.doesNotMatch(source, /"aria-expanded": "true"/);
  assert.doesNotMatch(source, /"aria-expanded": "false"/);
  assert.doesNotMatch(source, /aria-expanded=\{[^}]+\}/);
  assert.match(source, /aria-haspopup="dialog"/);
});

test("public auth layout keeps the back icon decorative for screen readers", () => {
  const source = readComponentSource("PublicAuthLayout.tsx");

  assert.match(source, /<ArrowLeft className="h-4 w-4" aria-hidden="true" focusable="false" \/>/);
  assert.match(source, /\{backLabel\}/);
});
