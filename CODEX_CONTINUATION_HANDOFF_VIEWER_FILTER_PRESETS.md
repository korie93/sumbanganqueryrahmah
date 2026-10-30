# Viewer personal filter presets — continuation handoff

User selected recommendation **2: saved filter presets** and requested a goal on **30 October 2026**. **Status: implementation and focused QA complete.** Preserve all earlier uncommitted Viewer numeric/date filtering, numeric sorting and searchable-column work. Base HEAD remains `de45961f6693add3f601f6f9df0c67388c0b969a`. No commit, push or deployment has been performed or authorized yet.

## Delivered behavior

Open **Filters** in a Saved file's Viewer to save a complete valid filter/sort combination. Choose a preset and click **Apply** to replace filters and numeric sort together. Presets never apply automatically. Applying resets page, cursor, selected rows, stale retry and export readiness, including when applying the same preset again; global search stays as entered. Changing files clears old raw/debounced filters and sort.

**Rename** changes a name. **Delete** asks for inline confirmation and leaves current filters unchanged. English controls remain inside the existing desktop panel/mobile Sheet and preserve keyboard focus after Save/Rename/Cancel/Delete. Stale columns block application instead of silently dropping conditions. Errors support explicit retry/refresh without optimistic success.

Presets persist in PostgreSQL, private to the internal account ID and import file. They store only column-filter definitions and numeric sort: no global search, imported/selected rows, visible/reordered columns, page size, density or cursor. Filter values may contain personal information, so every backend operation is owner/file scoped. Client requests have scope/abort guards; Viewer remounts on account/role changes.

## Backend, migration and key files

Routes: `/api/imports/:id/viewer-presets` GET `{presets}` and POST `{name,columnFilters,numericSort}` -> `{preset}`; `/:presetId` PATCH `{name}` -> `{preset}` and DELETE `{ok:true}`. Owner comes solely from `req.user.userId`; clients cannot select an owner. Existing authenticated shared-import read permissions are retained.

Strict validation limits ten presets per account/file, sixty-character names and ten valid filters. Invalid numeric/date bounds, unknown keys, malformed Unicode and unavailable columns are rejected. Owner-row locks serialize quotas/name checks/account deletion; import-row locks fence soft deletion. Names differing only by case cannot coexist within a scope. Deleted/banned accounts and deleted imports cannot access presets. Physical account/import deletion cascades; terminal managed-account deletion atomically purges presets while preserving business evidence.

Apply **migration 0065_viewer_filter_presets** using the existing release migration process before starting this version in migration mode. Equivalent local bootstrap follows users/imports; runtime readiness requires the table. No dependency change is needed. Legacy application JSON backup archives **exclude personal presets**; PostgreSQL backups preserve them. See `docs/viewer-filter-presets.md`.

Key files: `shared/common/viewer-filter-presets.ts`, `shared/schema-postgres-viewer.ts`, new preset repository/service/controller/routes/schema helper, migration/journal/bootstrap/readiness integration, terminal-account purge, `client/src/lib/api/viewer-presets.ts`, `useViewerFilterPresets.ts`, `ViewerFilterPresetControl.tsx`, `viewer-preset-utils.ts`, atomic apply in `useViewerDataState.ts` and account plumbing in `AppPageRenderer.tsx`. New client/API/repository/schema/PG/browser tests accompany them; the real preset scenario is registered in `scripts/test-auth-recovery-isolated.mjs`.

## Final authoritative evidence

External dossier: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/viewer-filter-presets-20261030/05/FINAL_VALIDATION.json`. It verifies individual proof hashes, resource results, requirements, cleanup, current source hashes and preserved Git state.

Immutable source: `/opt/sqr-audit/source-viewer-filter-presets-05`, **3,842 files**. Manifest SHA-256: **`2c53b6db23cc28d990eb7ee4558be6f363c6b9eaebd10b98d120cb8d60c516f1`**. Final working files match that snapshot except this documentation-only handoff update.

All final checks passed without failed or skipped cases:

- **232 client/shared/script tests**, covering serialization/isolation, invalid drafts, cancellation, import reset, shared boundaries and rollback governance.
- **98 backend/repository/service/HTTP/schema tests**, covering ownership, strict bodies, permissions and schema/bootstrap consistency.
- **4 real PostgreSQL scenarios**: presets plus existing date/numeric/import lifecycle. Preset cases cover independent owners/files, IDOR, concurrent caps/name races, dirty payloads, unavailable owners/imports, repeated migration/bootstrap and FK cleanup.
- **18 real PostgreSQL managed-account deletion cases**, including atomic preset purge and preserved Collection evidence.
- **18 native Chromium/Playwright cases** on the actual built frontend: four preset cases (CRUD/reopen/file isolation, compound/same-query Apply and CSV, mobile320 dark keyboard/errors/focus, delayed old-file responses after SPA navigation) and fourteen existing Viewer date/column-search/numeric-sort/numeric-filter/text/export/retry cases.
- ESLint passed. Real TypeScript strict semantic checks passed for **83 changed roots**, partitioned as 24 UI, 21 tests, 6 shared, 1 main renderer and 31 backend roots, with `exactOptionalPropertyTypes` enabled.
- Actual Vite/Rolldown frontend build, bundle-budget and sourcemap gates passed; **471 built files**. The existing nonfatal PostCSS `from`-option warning remains.
- Cleanup verified **zero active audit cgroups, scratch mounts and target-user processes**, then terminated `SQR-Audit`.

These are focused synthetic checks, not full CI, the full visual suite or a full-repository TypeScript check. Browser account-change remount/abort is source-reviewed; the browser late-response test exercises file changes, while real backend tests exercise cross-account ownership. Production was never contacted.

## Execution boundary and retained attempts

Never execute repository/npm/build/test/browser code on Windows. All target execution used WSL `SQR-Audit` bwrap/cgroups: read-only source/toolchain, isolated loopback/no external network, empty allowlisted environment, synthetic identities/data and scratch-local HOME/tmp/cache. Caps stayed one CPU, 768 MiB/no swap, 128 tasks, 180 seconds wall/120 aggregate CPU, 256 MiB scratch and bounded output. Final heavy checks ran sequentially. Browser-only `MemoryHigh=512M` encourages earlier cache reclamation without increasing hard limits. TypeScript was partitioned without weakening strictness. A pinned read-only dependency mount avoids duplicate dependency directories.

The existing account-deletion suite needed real `dotenv/config`, absent from the minimal Linux dependency fixture. Already-installed local **dotenv 16.6.1** was copied to a separate read-only fixture after package-lock version verification; no download/install/lifecycle scripts ran. Supplement manifest SHA-256: `5a8e3f197e62666dc6d51beefcaa8b3ec2cb3f8dcce13deaaf21a6cfd27bb00e`.

Retained attempts `01`–`04` document initial classification/control-regex/ES-library compatibility fixes, disk-full interruption, broad TypeScript heap pressure, the missing fixture dependency and corrected browser assumptions about native select keys and Viewer reload. A real keyboard-focus defect was fixed with post-commit focus intent and browser assertions. An overlapping exploratory type run was stopped and cleanup verified; final reported runs are sequential. Never count incomplete or failed proofs as passing evidence.

C: space exhaustion was resolved before final QA. Recovery preserved source, toolchains and proofs: reversible NTFS compression, audit-VHD trim/compaction, removal of downloaded installers for already-installed Linux packages and four old frontend materializations verified recoverable from retained archives. No production/project data was deleted. Audit WSL is stopped; disable WSLInterop again if restarted, and keep `/mnt/c` absent.

## Continue from another account

Read this handoff, `FINAL_VALIDATION.json`, the feature document and earlier Viewer handoffs; inspect `git status` before editing. Preset work is complete and remains uncommitted with prior Viewer improvements. Commit/push/deploy only after a later user request. New code changes require a fresh immutable snapshot and affected checks; do not reuse proofs for changed code.
