import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { matchesGlob } from "node:path";

const require = createRequire(import.meta.url);
const tailwindPublicConfig = require("../../tailwind.public.config.cjs");

const normalizePattern = (pattern) => pattern.replace(/^\.\//, "").replaceAll("\\", "/");
const normalizePath = (filePath) => filePath.replaceAll("\\", "/");

function isCoveredByPublicTailwind(filePath) {
  const normalizedPath = normalizePath(filePath);
  return tailwindPublicConfig.content.some((pattern) =>
    matchesGlob(normalizedPath, normalizePattern(pattern)),
  );
}

test("tailwind public config covers all landing route files", () => {
  const requiredLandingFiles = [
    "client/src/pages/Landing.tsx",
    "client/src/pages/LandingHeroShell.tsx",
    "client/src/pages/LandingDeferredSections.tsx",
    "client/src/pages/LandingRouteFallback.tsx",
  ];

  for (const filePath of requiredLandingFiles) {
    assert.equal(
      isCoveredByPublicTailwind(filePath),
      true,
      `${filePath} must be included in tailwind.public.config.cjs content globs`,
    );
  }
});

test("tailwind public config still covers public auth route files", () => {
  const requiredPublicRouteFiles = [
    "client/src/pages/Login.tsx",
    "client/src/pages/ForgotPassword.tsx",
    "client/src/pages/ActivateAccount.tsx",
    "client/src/pages/ResetPassword.tsx",
    "client/src/pages/ChangePassword.tsx",
    "client/src/pages/Maintenance.tsx",
    "client/src/pages/Banned.tsx",
  ];

  for (const filePath of requiredPublicRouteFiles) {
    assert.equal(
      isCoveredByPublicTailwind(filePath),
      true,
      `${filePath} must stay included in tailwind.public.config.cjs content globs`,
    );
  }
});
