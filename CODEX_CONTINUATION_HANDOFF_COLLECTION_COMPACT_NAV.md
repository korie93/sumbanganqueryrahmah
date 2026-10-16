# Collection compact navigation — continuation handoff

Status: COMPLETE — implementation, verification, Product Design QA and goal closure finished (2026-10-16).

## Request and boundaries

User requested Product Design implementation of `C:/Users/Administrator/Downloads/SQR_COLLECTION_COMPACT_NAV_CODEX.md`, completion through a goal, and this portable handoff for another account. The attached document was treated as task data, not higher-priority instructions. Local synthetic Playwright permission was explicitly confirmed in this task.

Baseline: main, `33d25ea972ff0ff293d705bf4a5befb09f3fe57b`, clean at start. Previous Collection reference/polish was already shipped. User subsequently requested commit and push on2026-10-16; this handoff is included in that change. Deployment remains separately authorized and has not been performed for this task. No production access, cleanup, real account or database was used. Do not rerun the old deployment helpers.

## Delivered

The actual `/collection/records` navigation was the visual source. Save no longer has the duplicate content eyebrow/title/subtitle, oversized full-label bar or hero shortcut chip. Global header, sidebar, Q and content width remain unchanged. One semantic h1 remains visually hidden. Existing form shortcut guidance is now visible at every width; the shortcut handlers were not edited.

One shared compact strip is used by every Collection route and viewport. Primary labels remain Simpan, Rekod, Summary, Monthly, Daily, followed by the existing role-authorized OSP/Nickname/Manage modules. No module was removed to force a five-item screenshot. Mobile scrolls horizontally, with44px targets (40px at>=768), full accessible names/title, focus rings and aria-current. Focus/selected reveal scrolls only the strip. Nickname badge remains once when the existing access hook supplies it, on the right; only its prefix is visually hidden on mobile so the nickname remains legible to touch users. Accessible full text/title is retained.

Selected section is authoritative from Wouter pathname. Deliberate authorized tab changes push history; active tab clicks do not duplicate entries; permission/canonical corrections replace. A Collection-only boundary prevents intercepting global navigation. All original role flags and route mappings remain:

- save → `/collection/save`
- records → `/collection/records`
- summary → `/collection/summary`
- monthly-comparison → `/collection/monthly-comparison`
- daily → `/collection/daily`
- billing-principal → `/collection/billing-principal`
- nickname-summary → `/collection/nickname-summary`
- manage-nicknames → `/collection/nicknames`

User5 / admin7 / manager6(no Save) / superuser8 items remain. Business logic, forms, validation, drafts/privacy, payloads, matching800ms, receipts, records search/filter/pagination/export, backend/auth/session/DB are untouched.

## Changed files

- `client/src/pages/CollectionReport.tsx`: removes duplicate hero/shortcut, retains accessible heading and optional badge.
- `client/src/pages/CollectionReport.css`: reuses Records compact layout on all sizes; removes Save-only overrides; mobile prefix presentation.
- `client/src/pages/collection-report/CollectionSidebar.tsx`: shared responsive strip/native buttons, scoped current/focus reveal; old Sheet presentation removed.
- `client/src/pages/collection-report/useCollectionReportNavigation.ts`: pathname ownership and guarded history navigation.
- `client/src/pages/collection/SaveCollectionPage.css`: removes desktop hiding of the existing shortcut hint. `SaveCollectionPage.tsx` is unchanged.
- `collection-desktop-layout.test.ts`, new `collection-navigation-route.test.ts`, `settings/mobile-sidebar-contrast-contract.test.ts`: deliberately update presentation contracts and add route/role coverage.
- `tests/visual/{collection-desktop-navigation,collection-reference-layout,save-collection-guidance,app.visual}.spec.ts`: responsive parity, keyboard/ARIA/history/deep links, explicit Ctrl/Meta save payload, original form/records coverage retained.
- `scripts/frontend-redesign-{browser,role-browser}.mjs`: adapt only old mobile section-Sheet expectations to the shared strip; other assertions retained.
- Only `sumbangan-form-light.png` and `sumbangan-form-dark.png` snapshot baselines changed; six other authenticated baselines remain unchanged. No tolerance was increased.
- This handoff and root `design-qa.md` document the result.

## Final verification evidence

Ignored logs are under `artifacts/collection-reference-20261015/`. Actual commands run (PowerShell from repo root; sanitized wrappers disable dotenv and use loopback fixtures):

```text
node artifacts/collection-reference-20261015/verify.mjs --checks --build --suffix=compact-nav-final
node artifacts/collection-reference-20261015/nonbrowser-regressions.mjs client compact-nav-final
node artifacts/collection-reference-20261015/verify.mjs --static --suffix=compact-nav-rechecked
node artifacts/collection-reference-20261015/verify.mjs --browser --snapshots --suffix=compact-nav-clean
node artifacts/collection-reference-20261015/verify.mjs --snapshots --update-reviewed --suffix=compact-nav-reviewed
node artifacts/collection-reference-20261015/verify.mjs --snapshots --suffix=compact-nav-no-update
node artifacts/collection-reference-20261015/verify.mjs --completion-browser --suffix=compact-nav-completion
node artifacts/collection-reference-20261015/verify.mjs --checks --suffix=compact-nav-final-types
node artifacts/collection-reference-20261015/nonbrowser-regressions.mjs scripts-node compact-nav-final
node artifacts/collection-reference-20261015/nonbrowser-regressions.mjs scripts-ts compact-nav-final
node artifacts/collection-reference-20261015/verify-protected-shell.mjs --prefix=compact-nav
```

Results:

- Complete client2077/2077PASS, no skip/fail (includes8 new route/role tests).
- Focused presentation56/56PASS; browser TypeScriptPASS (all changed browser files); app TypeScript/full client lintPASS.
- Sanitized production frontend/server build, CSP/status/manifest/sourcemap gatesPASS.
- Breakpoint/token spacing/token color/storage/entry-shell/bundle/hygiene/secret guardsPASS.
- Final broad Collection browser112/112PASS; separate layout/filter/role13/13PASS; additional all-eight-tab SPA click + Ctrl/Meta save payload3/3PASS.
- Reviewed snapshot update2/2PASS, then no-update snapshot verification2/2PASS across all8 authenticated baseline images. Only the two reviewed Save images changed.
- Script Node suite666PASS/0FAIL/1existing opt-in skip (`SQR_REDESIGN_BASELINE_HOOK_PROBE` for unrelated Viewer); script TS63/63PASS.
-91 protected global shell/token/shared primitive files remain byte-identical.
- `git diff --check`PASS (Windows LF→CRLF advisories only).

Coverage includes light/dark at1366/1024/768/390/360, equivalent125% browser footprint/DPR (not a claim of native browser zoom UI), long values/card privacy, draft restore, validation/reset/save idempotency, automatic matching races, receipts/PDF/StrictMode, filters, role restrictions and all route deep links/refresh/history. Final built-fixture tests have no unexpected API calls or page errors; layout suite also checks console errors. No production or full manual WCAG certification claim is made.

Initial failures were repaired and retained honestly in old logs: two stale source contracts, test Router.children typing, two partial mobile keyboard reveal failures, one ambiguous Monthly test locator. One parallel run's development StrictMode case timed out during local memory pressure; the final single-worker112 run passes it. Initial no-update snapshot failures were the intended reviewed Save layout change, not waived tolerances.

## Product Design visual QA and preview

`design-qa.md` current task section records the required typography/layout/token/assets/copy passes and final result. Sources and results were opened together at matched1366×900 and390×900, light/dark; full views plus focused nav regions inspected. Desktop Records viewport PNGs before/after have identical SHA256 in both themes. Save content starts~92.6px higher on desktop and~113.8px higher on mobile, with no document horizontal overflow.

Evidence: `artifacts/collection-compact-nav-20261016/final-compact-{before|after}-{records|save}-{light|dark}-{1366|390}-{viewport|full|nav}.png` and `final-compact-summary.json` (16 states/48PNGs). The baseline helper overrides exactly five UI files with their33d25ea9 versions; no app files were reverted. Existing source-preview fixture omissions/blocked heartbeat/WebSockets produce identical diagnostic patterns before/after; do not claim these source captures have zero console errors. Production-built synthetic test fixtures are the runtime-error gate.

Final source preview: `http://127.0.0.1:62134/collection/save?auditTheme=dark`, PID13004 (session61598); real frontend + fictional GET-only fixtures, mutations405. Browser Codex tab3 navigated to it, selected CollectorAlpha and showed the complete form; marked deliverable. Browser's screenshot export later reported zero-width despite valid DOM interaction; matched CLI screenshots above are the final visual comparison. Temporary viewport override was reset. Do not change the user's zoom.

Ignored baseline preview/helper artifacts are only local evidence; their process may already be stopped. No recursive cleanup was performed.

## Continue from another account / next authority

Read this file, `design-qa.md`, `AGENTS.md` and current `git status` first. All implementation is in the working tree, not only chat history. Goal state itself may not transfer accounts; this file preserves the objective, decisions and evidence. If artifacts are absent after cloning elsewhere, use the checked-in tests with the project's isolated synthetic/disposable test setup; never fall back to production or import `.env` into fixture runners.

No implementation requirement remains. User has now authorized commit/push to the current main branch. After push, normal CI/release verification and any deployment require the appropriate subsequent user request. Do not automatically deploy.
