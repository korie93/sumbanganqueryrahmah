import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useAuditLogsActionState.ts", import.meta.url),
  "utf8",
);

test("audit log actions clear async work on unmount", () => {
  assert.match(source, /import \{ useCallback, useEffect, useMemo, useRef, useState \} from "react";/);
  assert.match(source, /const isMountedRef = useRef\(true\);/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*isMountedRef\.current = true;\s*return \(\) => \{\s*isMountedRef\.current = false;\s*exportInFlightRef\.current = false;\s*\};\s*\}, \[\]\);/s,
  );
});

test("audit log cleanup avoids UI updates after unmount", () => {
  assert.match(
    source,
    /const response = await cleanupAuditLogs\(days\);\s*if \(!isMountedRef\.current\) \{\s*return;\s*\}/s,
  );
  assert.match(
    source,
    /catch \(error: unknown\) \{\s*if \(isMountedRef\.current\) \{\s*toast\(\{\s*title: "Cleanup Failed",/s,
  );
  assert.match(
    source,
    /finally \{\s*if \(isMountedRef\.current\) \{\s*setCleanupLoading\(false\);/s,
  );
  assert.doesNotMatch(source, /finally \{\s*setCleanupLoading\(false\);/s);
});

test("audit log exports avoid UI updates after unmount", () => {
  assert.match(
    source,
    /logClientError\("Failed to export audit logs PDF:", error\);\s*if \(isMountedRef\.current\) \{\s*toast\(\{\s*title: "Export Failed",/s,
  );
  assert.match(
    source,
    /finally \{\s*exportInFlightRef\.current = false;\s*if \(isMountedRef\.current\) \{\s*setExportingPdf\(false\);/s,
  );
  assert.match(
    source,
    /logClientError\("Failed to export audit logs CSV:", error\);\s*if \(isMountedRef\.current\) \{\s*toast\(\{\s*title: "Export Failed",/s,
  );
  assert.doesNotMatch(source, /finally \{\s*exportInFlightRef\.current = false;\s*setExportingPdf\(false\);/s);
});
