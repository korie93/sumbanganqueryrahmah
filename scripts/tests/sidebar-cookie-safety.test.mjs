import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sidebarPath = path.resolve(process.cwd(), "client/src/components/ui/sidebar.tsx");

test("sidebar persistence cookie keeps SameSite=Lax", () => {
  const source = readFileSync(sidebarPath, "utf8");

  assert.match(source, /SameSite=Lax/);
});
