import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import test from "node:test"

const APP_SRC_DIR = fileURLToPath(new URL("./", import.meta.url))

function readAppSource(relativePath: string) {
  return readFileSync(join(APP_SRC_DIR, relativePath), "utf8")
}

const routeLazyExports = [
  ["LandingPage", "Landing"],
  ["LoginPage", "Login"],
  ["ForgotPasswordPage", "ForgotPassword"],
  ["ActivateAccountPage", "ActivateAccount"],
  ["ResetPasswordPage", "ResetPassword"],
  ["ChangePasswordPage", "ChangePassword"],
  ["SingleTabBlockedPage", "SingleTabBlocked"],
  ["HomePage", "Home"],
  ["ImportPage", "Import"],
  ["SavedPage", "Saved"],
  ["ViewerPage", "Viewer"],
  ["GeneralSearchPage", "GeneralSearch"],
  ["BackupRestorePage", "BackupRestore"],
  ["AIPage", "AI"],
  ["BannedPage", "Banned"],
  ["SettingsRoutePage", "Settings"],
  ["MaintenanceRoutePage", "Maintenance"],
  ["SystemMonitorLayoutPage", "SystemMonitorLayout"],
  ["CollectionReportPage", "CollectionReport"],
  ["ForbiddenPage", "Forbidden"],
  ["NotFoundPage", "NotFound"],
] as const

test("route-level pages are declared through the shared lazy preload registry", () => {
  const lazyPagesSource = readAppSource("lazy-pages.tsx")

  for (const [exportName, pageName] of routeLazyExports) {
    assert.match(
      lazyPagesSource,
      new RegExp(
        `export const ${exportName} = lazyWithPreload\\(\\(\\) => import\\("@/pages/${pageName}"\\)\\)`,
      ),
    )
  }
})

test("navigation prefetch does not statically import route page modules", () => {
  const navigationPrefetchSource = readAppSource("navigation-prefetch.ts")

  assert.doesNotMatch(
    navigationPrefetchSource,
    /from "@\/pages\/SystemMonitorLayout"/,
  )
  assert.match(
    navigationPrefetchSource,
    /from "@\/app\/system-monitor-lazy-sections"/,
  )
})

test("system monitor child sections share lazy handles outside the route module", () => {
  const lazySectionsSource = readAppSource("system-monitor-lazy-sections.ts")
  const monitorLayoutSource = readFileSync(
    join(APP_SRC_DIR, "..", "pages", "SystemMonitorLayout.tsx"),
    "utf8",
  )

  for (const pageName of ["Dashboard", "Activity", "Monitor", "Analysis", "AuditLogs"]) {
    assert.match(
      lazySectionsSource,
      new RegExp(`lazyWithPreload\\(\\(\\) => import\\("@/pages/${pageName}"\\)\\)`),
    )
  }

  assert.doesNotMatch(
    monitorLayoutSource,
    /lazyWithPreload\(\(\) => import\("@\/pages\//,
  )
  assert.match(
    monitorLayoutSource,
    /from "@\/app\/system-monitor-lazy-sections"/,
  )
})
