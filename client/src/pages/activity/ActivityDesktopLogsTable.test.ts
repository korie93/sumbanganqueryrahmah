import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./ActivityDesktopLogsTable.tsx", import.meta.url),
  "utf8",
);

test("desktop activity header and rows share the bounded column navigation viewport", () => {
  const scrollportStart = source.indexOf("<HorizontalScrollHint");
  const headerIndex = source.indexOf("<ActivityDesktopLogsHeader");
  const rowIndex = source.indexOf("{activities.map");
  const scrollportEnd = source.indexOf("</HorizontalScrollHint>", rowIndex);

  assert.ok(scrollportStart >= 0);
  assert.ok(headerIndex > scrollportStart);
  assert.ok(rowIndex > headerIndex);
  assert.ok(scrollportEnd > rowIndex);
  assert.doesNotMatch(source, /overflow-y-(auto|scroll)/);
});

test("desktop activity columns use a visible, keyboard-accessible horizontal scrollport", () => {
  assert.match(source, /ariaLabel="Activity log columns"/);
  assert.match(source, /navigationLabel="Activity table column navigation"/);
  assert.match(source, /showNavigationControls/);
  assert.match(source, /framedTable/);
  assert.match(source, /viewportClassName="activity-log-viewport overscroll-x-contain"/);
  assert.match(source, /getActivityGridTemplateColumns/);
  assert.match(source, /getActivityTableMinWidth/);
  assert.match(source, /role="table"/);
  assert.doesNotMatch(source, /min-w-\[70rem\] overflow-hidden/);
});

