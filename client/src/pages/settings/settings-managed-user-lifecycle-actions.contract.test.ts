import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lifecycleSource = readFileSync(
  new URL("./useSettingsManagedUserLifecycleActions.ts", import.meta.url),
  "utf8",
);
const accountLifecycleSource = readFileSync(
  new URL("./useSettingsManagedUserAccountLifecycleActions.ts", import.meta.url),
  "utf8",
);
const communicationSource = readFileSync(
  new URL("./useSettingsManagedUserCommunicationActions.ts", import.meta.url),
  "utf8",
);

test("managed user lifecycle passes mounted state into communication actions", () => {
  assert.match(
    lifecycleSource,
    /const communicationActions = useSettingsManagedUserCommunicationActions\(\{\s*isMountedRef,\s*loadDevMailOutbox,/s,
  );
  assert.match(
    communicationSource,
    /type UseSettingsManagedUserCommunicationActionsArgs = Pick<[\s\S]*?"isMountedRef"\s*\| "loadDevMailOutbox"/s,
  );
  assert.match(
    communicationSource,
    /export function useSettingsManagedUserCommunicationActions\(\{\s*isMountedRef,\s*loadDevMailOutbox,/s,
  );
});

test("managed user account lifecycle skips UI side effects after unmount", () => {
  assert.match(
    accountLifecycleSource,
    /await updateManagedUserStatus\(normalizedId,[\s\S]*?\);\s*if \(!isMountedRef\.current\) \{\s*return;\s*\}\s*toast\(buildMutationSuccessToast/s,
  );
  assert.match(
    accountLifecycleSource,
    /catch \(error: unknown\) \{\s*if \(isMountedRef\.current\) \{\s*toast\(buildSettingsMutationErrorToast\(error, "Status Update Failed"\)\);/s,
  );
  assert.match(
    accountLifecycleSource,
    /await deleteManagedUserAccount\(normalizedId\);\s*if \(!isMountedRef\.current\) \{\s*return;\s*\}\s*if \(managedSelectedUser\?\.id === normalizedId\)/s,
  );
  assert.match(
    accountLifecycleSource,
    /catch \(error: unknown\) \{\s*if \(isMountedRef\.current\) \{\s*toast\(buildSettingsMutationErrorToast\(error, "Delete Failed"\)\);/s,
  );
});

test("managed user communication lifecycle skips dialogs and toasts after unmount", () => {
  assert.equal((communicationSource.match(/if \(!isMountedRef\.current\) \{\s*return;\s*\}/g) || []).length, 2);
  assert.match(
    communicationSource,
    /const previewUrl = getManagedUserDeliveryPreviewUrl\(reset\?\.previewUrl\);\s*if \(!isMountedRef\.current\) \{\s*return;\s*\}\s*if \(isDevOutboxActivation\(reset\)\)/s,
  );
  assert.match(
    communicationSource,
    /catch \(error: unknown\) \{\s*if \(isMountedRef\.current\) \{\s*toast\(buildSettingsMutationErrorToast\(error, "Reset Failed"\)\);/s,
  );
  assert.match(
    communicationSource,
    /const previewUrl = getManagedUserDeliveryPreviewUrl\(activation\?\.previewUrl\);\s*if \(!isMountedRef\.current\) \{\s*return;\s*\}\s*if \(isDevOutboxActivation\(activation\)\)/s,
  );
  assert.match(
    communicationSource,
    /catch \(error: unknown\) \{\s*if \(isMountedRef\.current\) \{\s*toast\(buildSettingsMutationErrorToast\(error, "Activation Failed"\)\);/s,
  );
});
