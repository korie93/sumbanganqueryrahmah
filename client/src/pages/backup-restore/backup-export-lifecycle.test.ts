import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useBackupExportState.ts", import.meta.url),
  "utf8",
);

test("backup export state clears in-flight work on unmount", () => {
  assert.match(source, /import \{ useCallback, useEffect, useRef, useState \} from "react";/);
  assert.match(source, /const isMountedRef = useRef\(true\);/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*isMountedRef\.current = true;\s*return \(\) => \{\s*isMountedRef\.current = false;\s*exportInFlightRef\.current = false;\s*\};\s*\}, \[\]\);/s,
  );
});

test("backup export async completions do not update unmounted state", () => {
  assert.match(
    source,
    /if \(isMountedRef\.current\) \{\s*notifyMutationError\(\{\s*title: "Export Failed",\s*error,\s*fallbackDescription: error instanceof Error \? error\.message : "Failed to export CSV",\s*\}\);/s,
  );
  assert.match(
    source,
    /if \(isMountedRef\.current\) \{\s*notifyMutationError\(\{\s*title: "Export Failed",\s*error,\s*fallbackDescription: error instanceof Error \? error\.message : "Failed to export PDF",\s*\}\);/s,
  );
  assert.match(
    source,
    /finally \{\s*exportInFlightRef\.current = false;\s*if \(isMountedRef\.current\) \{\s*setExportingPdf\(false\);/s,
  );
  assert.doesNotMatch(source, /finally \{\s*exportInFlightRef\.current = false;\s*setExportingPdf\(false\);/s);
});
