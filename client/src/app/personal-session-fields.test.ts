import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// All existing /me hydration paths must retain authoritative profile/security
// fields. Browser tests also verify upload/global state and enabled-2FA refresh.
for (const file of ["useAppShellSessionValidation.ts", "useAppShellAuthBootstrap.ts", "usePublicAppState.ts"]) {
  test(`${file} retains personal metadata and real 2FA status`, () => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const field of ["createdAt", "avatarUrl", "twoFactorEnabled", "twoFactorPendingSetup", "twoFactorConfiguredAt"]) {
      assert.match(source, new RegExp(`${field}: me\\.${field}\\b`));
    }
  });
}
