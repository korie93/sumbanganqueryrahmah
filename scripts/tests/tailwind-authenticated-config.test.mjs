import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authenticatedConfigSource = readFileSync(
  new URL("../../tailwind.authenticated.config.ts", import.meta.url),
  "utf8",
);
const authenticatedCss = readFileSync(
  new URL("../../client/src/index.css", import.meta.url),
  "utf8",
);

const publicOnlyPatterns = [
  "./client/src/pages/Landing*.tsx",
  "./client/src/pages/Login.tsx",
  "./client/src/pages/LoginParts.tsx",
  "./client/src/pages/ForgotPassword.tsx",
  "./client/src/pages/ActivateAccount.tsx",
  "./client/src/pages/ActivateAccountParts.tsx",
  "./client/src/pages/ResetPassword.tsx",
  "./client/src/pages/Banned.tsx",
  "./client/src/pages/NotFound.tsx",
];

test("authenticated Tailwind CSS excludes routes already covered by the public entry", () => {
  assert.match(
    authenticatedCss,
    /^@config "\.\.\/\.\.\/tailwind\.authenticated\.config\.ts";/,
  );

  for (const pattern of publicOnlyPatterns) {
    assert.match(
      authenticatedConfigSource,
      new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${pattern} must stay listed as public-only Tailwind content`,
    );
  }

  assert.match(authenticatedConfigSource, /publicOnlyContent\.map\(\(pattern\) => `!\$\{pattern\}`\)/);
});

test("authenticated Tailwind CSS retains protected and shared route coverage", () => {
  assert.match(authenticatedConfigSource, /import baseConfig from "\.\/tailwind\.config";/);
  assert.match(authenticatedConfigSource, /\.\.\.baseConfig\.content/);
  assert.doesNotMatch(authenticatedConfigSource, /pages\/ChangePassword\.tsx/);
  assert.doesNotMatch(authenticatedConfigSource, /pages\/Maintenance\.tsx/);
});
