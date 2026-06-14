import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./SystemMonitorLayout.tsx", import.meta.url),
  "utf8",
);

test("system monitor does not re-emit the requested section on initial mount", () => {
  assert.match(
    source,
    /lastEmittedSectionRef = useRef<MonitorSection \| null>\(requestedSection\)/,
  );
  assert.match(
    source,
    /if \(lastEmittedSectionRef\.current === activeSection\) return;/,
  );
});
