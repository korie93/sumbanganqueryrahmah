import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sidebarPath = path.resolve(process.cwd(), "client/src/components/ui/sidebar.tsx");

test("sidebar persistence cookie keeps SameSite=Lax", () => {
  const source = readFileSync(sidebarPath, "utf8");

  assert.match(source, /SameSite=Lax/);
});

test("sidebar toggle controls expose expanded state and controlled regions", () => {
  const source = readFileSync(sidebarPath, "utf8");

  assert.match(source, /aria-controls=\{isMobile \? mobileSidebarId : desktopSidebarId\}/);
  assert.match(source, /function getAriaExpandedProps\(isExpanded: boolean\)/);
  assert.match(source, /"aria-expanded": "true" as const/);
  assert.match(source, /"aria-expanded": "false" as const/);
  assert.match(source, /getAriaExpandedProps\(isMobile \? openMobile : open\)/);
  assert.match(source, /\{\.\.\.ariaExpandedProps\}/);
});
