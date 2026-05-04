import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("form controls omit aria-invalid when the field is valid", () => {
  const formSource = readSource("form.tsx");
  const loginSource = readSource("../../pages/Login.tsx");

  assert.doesNotMatch(formSource, /aria-invalid="false"/);
  assert.match(formSource, /aria-invalid=\{error \? true : undefined\}/);
  assert.doesNotMatch(loginSource, /"aria-invalid": "false"/);
});

test("table headers default to column scope while allowing overrides", () => {
  const tableSource = readSource("table.tsx");

  assert.match(tableSource, /scope = "col"/);
  assert.match(tableSource, /scope=\{scope\}/);
});

test("breadcrumb current page is not exposed as an inactive link", () => {
  const breadcrumbSource = readSource("breadcrumb.tsx");

  assert.doesNotMatch(breadcrumbSource, /role="link"/);
  assert.match(breadcrumbSource, /aria-current="page"/);
});

test("toast notifications expose polite and assertive live-region semantics", () => {
  const toastSource = readSource("toast.tsx");

  assert.match(toastSource, /role: "alert" as const/);
  assert.match(toastSource, /"aria-live": "assertive" as const/);
  assert.match(toastSource, /role: "status" as const/);
  assert.match(toastSource, /"aria-live": "polite" as const/);
});

test("toast close controls keep an explicit accessible name", () => {
  const toastSource = readSource("toast.tsx");

  assert.match(toastSource, /const ariaLabel = props\["aria-label"\] \?\? "Dismiss notification"/);
  assert.match(toastSource, /aria-label=\{ariaLabel\}/);
  assert.match(toastSource, /title=\{title\}/);
});
