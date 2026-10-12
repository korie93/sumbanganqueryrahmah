# SQR brand logo migration — COMPLETE LOCALLY

## User authorization and boundaries

User approved local implementation and requested a goal on 12 October 2026.
Source: Downloads/SQR-Brand-Assets-Final.zip and codex-gpt6-astra-ultra-logo-migration-prompt.md.
Goal: replace old branding consistently using supplied assets; validate light/dark, responsive sizing, accessibility, metadata/icons, fallback pages and regression tests. Latest user PNG references supersede only the Q artwork from the ZIP; full SQR logos stay unchanged.
Do not commit, push, deploy, access production, change .env, business data, authentication/permissions or database behavior without separate authorization.

## Baseline and ownership

Clean main at 919514a31aa063cf34bd6c381e44e9cd2b2fa22b; this SHA was already deployed successfully in the prior task.
Root: ZIP import, metadata/index/manifest/boot, static status generation, complete verification and integration.
brand_components agent: shared brand constants, BrandLogo helper/CSS/tests, navbar/login/public auth branding.
brand_landing agent: landing branding/CSS/dependency contracts.
brand_migration_inventory agent: read-only missed-surface review.

## Design

- Exact supplied full SVGs (665×310), light/dark chosen by actual surface background.
- Latest user reference (12 October, ~12:35) supersedes earlier dark-Q-only choice: three identical transparent Q PNGs and one navy-tile PNG. User explicitly approved using originals and exporting small icons **without AI redrawing**. Use transparent on light UI and navy tile on dark UI; fixed boot/status/favicon use self-contained navy tile, readable on either surface. No crop/recolor/generative changes.
- Extend existing BrandLogo (do not introduce a second competing helper), preserving decorative accessibility/loading.
- Versioned/new public paths under /brand; one shared constants module.
- Runtime auth metadata must not restore old auth-v17 favicon.
- Static Nginx fallback assets regenerated locally only; deployment later needs independent static-asset sync, not just app release.
- Keep full logos as exact SVGs. Q source artwork is raster, so preserve exact originals in assets/brand and downsample small exports via scripts/export-brand-icons.mjs (offline Playwright canvas; no new dependency). Provenance/export hashes: assets/brand/q-mark-exports.json. Passive raster-backed SVG containers preserve favicon/status URLs and Nginx allowlist.

## Earlier migration evidence (before final PNG reference)

- Goal active. Prompt, repository instructions and ZIP inventory reviewed.
- Full SVGs and Q SVGs initial active/external-content scan clear.
- Initial ZIP import: 10 exact files, historical artifacts/brand-assets-import-report.json. Latest Q references replace seven of these Q/favicon/device assets; full SVG/social originals remain exact. Removed superseded Q SVGs (recoverable from user ZIP); new PNG sources are preserved in assets/brand. Do not use the historical import report to validate the new Q outputs.
- Shared constants/helper, navbar/auth/landing, boot, metadata/manifest and static status updated. Six replaced legacy files removed (recoverable in Git).
- Brand helper CSS is in public-shell.css, available before authenticated styles; no theme-controller side effects.
- Focused 28 tests passed; typecheck passed; build:status and full production build passed. Build emits a pre-existing nonblocking PostCSS from-option warning.
- Brand byte fidelity is protected by .gitattributes (-text SVG), source/export manifest hashes and asset integrity unit tests.
- Original agents finished or hit account limit; root owns completion. A fresh read-only final review found no concrete branding/source issue and verified all 10 imported hashes.
- Do not reuse old process handles from earlier turns; their runs are terminal. Latest build/grouping verification is in artifacts/brand-build-final.log and artifacts/brand-final-budgets.log.
- New browser regression tests: tests/visual/brand-logo.spec.ts; existing landing-brand assertion updated to accessible name + decoded SVG.
- Full client tests: 1,921 passed (1,161 + 760). Full script MJS tests: 659 passed, one existing skip. Script TS tests: 63 passed with a clean synthetic environment (artifacts/brand-clean-script-tests.mjs); default local dotenv contained a rejected LOG_FORMAT option. No .env edits or validation bypass.
- Typecheck, lint and production build passed. Login screenshot differences reviewed; only the two approved login baselines updated. All nine selected baseline/branding tests passed after update; authenticated snapshots unchanged.
- Status browser: 160 checks passed, seven widths/light+dark, including accessibility. Independent static pages now also reference the local supplied Q SVG as favicon; generator/asset checks pass.
- Auth V17 browser: 38 checks passed, including lazy resource hints, responsive/MFA/reset/CSP. Landing browser: 22 checks passed, including eight widths/a11y/CSP/mobile touch.
- Fixed the landing test's synthetic swipe timing (frame-paced CDP moves and settled native snapping before dot tap). No carousel app behavior or assertions weakened.
- Build grouping resolved: constants stay in public-runtime, BrandLogo in shared ui, React/framework at higher priority. Full build and ALL bundle budgets now pass, no raised limits. Pure Collection loading/details markup was deduplicated while preserving its exact labels, order, formatters/styles/actions; read-only review and 13 SSR tests verify this. Final combined brand/table test run: 23 passed (CSS loader required for table tests).
- Pre-correction final verification reconciled: lint/typecheck/build/budgets passed; 18 selected visual tests, auth 38 checks and landing 22 checks all passed sequentially. Collection contracts 97 passed. All old process handles are terminal; do not poll them.
- Prior ICO suspicion resolved: the original ICO was valid. Playwright aborts /favicon.ico when request interception is enabled. Added dedicated real decode test without routing. New ICO exports must pass the same test.
- Latest implementation: helper auto light/dark again, unframed full-slot Navbar/PublicAuth, transparent Q on fixed pale landing preview; new dark Q boot/status/favicon/device icons. All shape/gradient retained from user PNGs. Runtime PNG exports 128px (~12KB/~25KB); static 96px WEBP in SVG (~16KB); full independent status assets still under original 32KiB limit. No Nginx changes.
- Latest focused 32 tests passed (brand/helper/landing/status generation/package/budgets). New source hashes: transparent 07e5e47d3a1851200301dc22b49764b6bb174b48843bc2462700ba3c0dc5ea5e, dark ba84d8b9b9142727fdb2e88538ed1685a51ca1ccddef872bdc719aab3c111994.
- Forced-password tests: synthetic /api/me now satisfies the strict schema; test enters through actual workspace (where the existing Navbar theme controller applies saved preference) then the existing force-password-change event. It verifies the real screen inherits both themes at 320/390/1440px. No application security/theme-controller logic changed. A cold forced-password load without prior Navbar currently starts light; this pre-existing behavior is outside the branding change.

## Latest PNG reference verification

- Build and all original bundle budgets PASS: artifacts/brand-reference-build.log, brand-reference-budgets.log. No size thresholds raised; no source maps shipped.
- Typecheck + client/server lint PASS: brand-reference-typecheck.log, brand-reference-lint.log.
- Full client tests PASS 1,922 (1,162 + 760): brand-reference-client-tests.log. Full script MJS PASS 659 + one existing skip; TS PASS 63 using clean synthetic environment: brand-reference-script-mjs.log, brand-reference-script-ts.log.
- Focused brand/helper/landing/static status tests PASS 32, including source/export hashes and independent status payload limit.
- Built visual PASS 13: brand-reference-visual.log. Covers original screenshot baselines, metadata SPA navigation, supplied PNG theme switching, forced-password responsive branding, real ICO/device decoding and actual raster pixels under unchanged strict Nginx CSP (both SVG and document headers). No baseline updates required for the latest Q correction.
- Auth V17 PASS 38 checks and landing PASS 22 checks: brand-reference-auth.log, brand-reference-landing.log (real built frontend, synthetic local APIs, strict CSP/a11y).
- Gallery PNGs refreshed and inspected: artifacts/brand-gallery-light.png, brand-gallery-dark.png. Actual 320px dark forced-password screenshot inspected; no inset/duplicate frame/overflow. Desktop workspace light/dark screenshots also checked.
- Status browser PASS 160 checks / 166 screenshots across seven widths and both themes: brand-reference-status.log. Session85242 exited 0; all task verification handles are terminal. Final diff check and source inventory pass. Local implementation complete; no commit/push/deploy.

## Requirement audit

| Requested item | Current authoritative evidence |
| --- | --- |
| 1–2. Audit/replace old assets on all surfaces | Runtime search finds no old minimal/maskable/auth favicon or superseded Q paths. Navbar/PublicAuth/AuthV17/Login/landing/preview/boot/status/static routes now use approved paths; original source PNGs/hash manifest are saved. |
| 3. Correct theme selection | BrandLogo auto/root CSS; fixed pale full logos and landing preview light; workspace toggle and inherited forced-password light/dark browser checks. Latest PNG references override earlier ZIP-only Q choice. |
| 4. Sharp proportional rendering | True SVG full logos, 128px Q exports for 32–60px slots at 2×; 1:1/object-fit assertions, no crop/recolor. Source originals preserved. |
| 5. Favicon/manifest/touch/social | Central path/manifest tests, real SVG/ICO/PNG decode test and SPA metadata checks; OG/Twitter/JSON-LD use supplied social full logo. |
| 6–8. Theme/reuse/centralization | Existing BrandLogo extended (no competing helper/theme controller), shared/brand-assets.ts, CSS in public shell, static generator consumes shared path. |
| 9. Responsive/no regressions | 13 built visual tests at 320/390/1440px plus login/auth/landing suites, unchanged authenticated screenshot baselines, build/budgets/typecheck/lint/full client/script passes. |
| 10. Summary/files/test/manual instructions | docs/brand-assets.md covers changed files, usage snippets, paths, test commands, cache/PWA refresh and separate authorized static-error deployment. This handoff records source precedence and verification. |
| Safety boundaries | No server/.env/package/lock/Nginx changes, no DB or production access, no commit/push/deploy. Exact existing CSP checked on document and SVG responses; pixels match embedded raster. |

All requested local requirements are verified, including latest PNG Q correction and preserved full-logo assets. Production deployment/CI verification is not part of this completed local goal. If the user next requests commit/push, include source assets, generated exports, tests, docs and status files; never include .env, artifacts, secrets or local test outputs. A later deployment must independently sync static error assets using the established reviewed procedure.
