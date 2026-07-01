import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("useSingleImportState routes active job storage through safe browser storage helpers", () => {
  const source = readFileSync(new URL("./useSingleImportState.ts", import.meta.url), "utf8");

  assert.match(source, /getBrowserSessionStorage/);
  assert.match(source, /safeGetStorageItem/);
  assert.match(source, /safeSetStorageItem/);
  assert.match(source, /safeRemoveStorageItem/);
  assert.doesNotMatch(source, /window\.sessionStorage/);
  assert.doesNotMatch(source, /sessionStorage\.(?:getItem|setItem|removeItem)/);
});

test("useSingleImportState reset invalidates pending preview parsing before clearing state", () => {
  const source = readFileSync(new URL("./useSingleImportState.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /const resetSingleImport = useCallback\(\(\) => \{\s*singleParseRequestIdRef\.current \+= 1;\s*singleSaveAbortControllerRef\.current\?\.abort\(\);/s,
  );
});

test("useSingleImportState ignores stale background cancel responses after the active job changes", () => {
  const source = readFileSync(new URL("./useSingleImportState.ts", import.meta.url), "utf8");

  assert.match(source, /const backgroundJobIdRef = useRef<string \| null>\(null\);/);
  assert.match(source, /backgroundJobIdRef\.current = nextJob\?\.id \?\? null;/);
  assert.match(
    source,
    /const jobId = backgroundJob\.id;\s*try \{\s*const nextJob = await cancelImportJob\(jobId\);\s*if \(isMountedRef\.current && backgroundJobIdRef\.current === jobId\) \{\s*setTrackedBackgroundJob\(nextJob\);/s,
  );
  assert.match(
    source,
    /catch \(cancelError\) \{\s*if \(isMountedRef\.current && backgroundJobIdRef\.current === jobId\) \{/s,
  );
});
