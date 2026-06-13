import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./ActivityDesktopLogsTable.tsx", import.meta.url),
  "utf8",
);

test("desktop activity header and rows share the same vertical scrollport", () => {
  const scrollportStart = source.indexOf(
    'className="max-h-[408px] overflow-y-auto [scrollbar-gutter:stable]"',
  );
  const headerIndex = source.indexOf("<ActivityDesktopLogsHeader");
  const rowIndex = source.indexOf("{activities.map");
  const scrollportEnd = source.indexOf("</div>", rowIndex);

  assert.ok(scrollportStart >= 0);
  assert.ok(headerIndex > scrollportStart);
  assert.ok(rowIndex > headerIndex);
  assert.ok(scrollportEnd > rowIndex);
});

