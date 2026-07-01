import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mutationSource = readFileSync(
  new URL("./useDevMailOutboxMutationState.ts", import.meta.url),
  "utf8",
);

test("dev mail outbox delete skips toast and refresh after unmount", () => {
  assert.match(
    mutationSource,
    /await deleteDevMailOutboxPreview\(normalizedId\);\s*if \(!isMountedRef\.current\) \{\s*return;\s*\}\s*toast\(buildMutationSuccessToast\(\{\s*title: "Email Preview Deleted"/s,
  );
  assert.match(
    mutationSource,
    /catch \(error: unknown\) \{\s*if \(isMountedRef\.current\) \{\s*toast\(buildSettingsMutationErrorToast\(error, "Delete Failed"\)\);/s,
  );
});

test("dev mail outbox clear skips toast and refresh after unmount", () => {
  assert.match(
    mutationSource,
    /const response = await clearDevMailOutboxPreviews\(\);\s*if \(!isMountedRef\.current\) \{\s*return;\s*\}\s*toast\(buildMutationSuccessToast\(\{\s*title: "Mail Outbox Cleared"/s,
  );
  assert.match(
    mutationSource,
    /catch \(error: unknown\) \{\s*if \(isMountedRef\.current\) \{\s*toast\(buildSettingsMutationErrorToast\(error, "Clear Failed"\)\);/s,
  );
});
