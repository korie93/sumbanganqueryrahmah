# Viewer numeric filters — continuation handoff

Goal: finish Greater than, Less than and inclusive Between in Viewer, with matching browser/backend semantics, pagination/export support and regression checks. User explicitly requested a goal on 29 October 2026. **Status: implementation and focused local QA complete.** Changes remain uncommitted.

Base commit: `de45961f6693add3f601f6f9df0c67388c0b969a` on `main`. This base is already deployed; the numeric filter work is uncommitted and must not be deployed or pushed without a new request.

Implementation: shared browser-safe decimal contract in `shared/common/import-data-filters.ts`; Viewer menu/two-input range row, query identity/chips/export plumbing; validated import API request; Viewer-only guarded numeric SQL, keeping Advanced Search unchanged. No migration or dependency changes. Fix includes correct chip removal when a preceding filter draft is incomplete, retaining server numeric membership after JSON rounding, and full filtered totals on cursor pages (previously only remaining rows were counted).

Completed validation:

- 203 client/shared/API tests across 38 files; 73 backend/API/repository/service tests; two real disposable PostgreSQL tests. No failures or skips in these successful runs.
- Strict semantic TypeScript checks for 22 changed client roots and 10 changed server roots with `exactOptionalPropertyTypes`; lint for changed TypeScript files.
- Actual Vite/Rolldown production frontend build, bundle budgets and source-map gate passed. No substitute compiler or browser.
- Six native Chromium/Playwright cases passed: numeric operators/invalid bounds; maximum-only changes resetting pagination and preserving CSV bounds; 320px dark layout and keyboard focus; existing mobile text filtering/page size; existing export scopes; existing cursor retry. These are focused cases, not the full visual suite.
- The PostgreSQL cases exercise mixed dirty JSON cells, exact decimals, strict/inclusive boundaries, hostile column names, cursor totals, export batches, soft deletion and unsafe integer JSON rounding. The test is registered in `scripts/test-auth-recovery-isolated.mjs` for CI.

Successful client units used round 01 inputs; subsequent shared-contract changes only added the explicit `undefined` type annotation. Successful backend and PostgreSQL tests used round 03 inputs; the final source differs only in two optional-property type annotations and documentation. Final server typecheck, lint, frontend build and six browser cases use round 04. Source continuity and hashes are recorded in the external validation report.

Next action, only when requested: review `git diff`, commit and push this feature, then verify the resulting CI. No production deployment has been performed for these changes. Full repository CI and full repository typecheck have not been claimed.

Execution boundary persists: **never execute repository/npm/test/build/browser code on Windows**. Run target code only in the existing WSL `SQR-Audit` bwrap/cgroup sandbox: read-only source/toolchain, empty allowlisted environment, synthetic data, isolated loopback only, no external runtime network. Preserve normal caps (1 CPU, 768 MiB, no swap, 128 tasks, 180 s wall/120 s CPU per run, 256 MiB scratch). Use trusted host built-ins for source packaging/verification only. No dependency installation. Native Vite/Rolldown is available; offline Linux esbuild binary is absent. Runtime root `/opt/sqr-audit`; existing source `/opt/sqr-audit/source-dependency-ci-01`, manifest SHA-256 `cefc513bf075b457a9c687e725ea248585ecd6184ab1bc05023d4c6f3074dec3`. Existing controls/harness examples are retained outside the repository in `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah`.

QA evidence and controls: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/viewer-numeric-filters-20261029`, with final receipts in `04/FINAL_VALIDATION.json`. Final runtime source: `/opt/sqr-audit/source-viewer-numeric-04`; manifest SHA-256 `cd87effdf8028334809af7a9b8a1dbb69d8fd2cd2cb5179b8fae6d05b50120d2`. Run heavy checks sequentially: WSL has a 1.5 GiB VM cap. Concurrent checks timed out. Split client/server semantic typechecks use less memory than a combined program; do not raise sandbox caps. Earlier test, harness, resource-limit and typecheck failures remain retained alongside their successful replacements. One existing PostCSS `from`-option warning remains nonfatal in the production frontend build.

No production probes or customer data are needed for this feature. Preserve all current working changes and use `git status` before continuing. This handoff is the continuation source if a different account or session resumes the task.
