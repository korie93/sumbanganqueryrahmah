# SQR new landing — implementation and local QA complete

Updated: 31 October 2026 (Asia/Singapore). User requested implementation from `C:/Users/Administrator/Downloads/SQR_Landing_Page_Codex_GPT6.zip`, with a goal and continuation support. Implementation base commit: `44f3c4d3fc408096e4bd04b6b660af850788efbf`. Local QA completed before publication; the user subsequently authorized committing and pushing this work on 30 October 2026. **Deployment still requires a separate user request.**

## CI follow-up — intercepted response teardown, 31 October 2026

[CI run 41148647718](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41148647718) on `748636b1f76f0c1991ee158e43362be58b9adfb7` passed build-and-test and coverage. Its visual stage had 768 passing cases and one failure in the direct-fragment/refresh landing case: `route.fulfill: Route is already handled!`. Installed Playwright 1.60 clears page route registrations before `unrouteAll({ behavior: "wait" })` finishes waiting. A completed callback can then remove server interception while other callbacks are still fetching artwork, causing those routes to be continued before their later fulfilment.

The pending fix changes only `tests/visual/landing-next.spec.ts`: track and return each whole route-handler promise, drain callbacks with registration intact before unregistering, await drains before fixture assertions, and use the same cleanup before closing the manual phone context. CSP augmentation, protected/off-origin request guards and original assertion coverage remain intact. No application code, dependencies, retries, timeouts, snapshot baselines or pixel thresholds changed.

A deterministic browser regression holds two real SVG responses, starts cleanup, releases them across a public interception-update barrier, and verifies original status/body/semantic headers, exact appended CSP, decoding and successful cleanup. Reverting only the pre-unroute drain line in an immutable counterfactual snapshot reproduces the same `Route is already handled!` error; the fixed case passes. Rejection observers and finally-released gates keep assertion failures from stranding test operations; they do not suppress route errors.

Local validation passed all 23 landing browser cases (the original 22 plus this regression), 27 focused source/contract tests and strict changed-root TypeScript (1 root, 289 resolved files). Coverage includes light/dark responsive layouts, direct fragment refresh, keyboard/touch, OS/persisted/denied storage, animation cleanup, all 32 SVG variants, login/Home return, low-spec asset isolation and axe checks. All passing fixtures report zero unexpected/protected requests and no page/CSP errors. The verified frontend from the storage fix was reused only after proving all application inputs are identical. Independent source review passed.

Evidence: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ci-landing-route-lifecycle-20261031/`, including `CI_FAILURE_EVIDENCE.json`, `source-input.json` (records the precise counterfactual), `setup.json`, before/after browser receipts and `FINAL_VALIDATION.json`. Tested source manifest SHA256: `7f874da8756ddda8ecb150e93b7cc6950e6ef5444f50ca234e998c18f5b6228b`. Only this handoff was updated after the snapshot. The fix is uncommitted and has not been pushed or deployed; full CI/Release Verification still requires the published revision.

## Release verification follow-up — 31 October 2026

The main [CI run 41082772697](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41082772697) passed on `c10a171d2bffb6daf4c31de8f845b07d9b6a950e`. Both scheduled release run 41087055426 and manual [release run 41110770619](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41110770619) then failed `verify:browser-storage-safety`: `useLandingNextMotion.ts` still accessed `localStorage` directly. The same guard failure was reproduced in the local sandbox before the fix.

The pending fix replaces the two theme reads and one write with existing `getBrowserLocalStorage`, `safeGetStorageItem` and `safeSetStorageItem`. The landing key, OS preference, explicit choice, app-theme separation and low-spec boundary remain intact. The landing import contract permits this one shared helper only for the motion hook; the storage guard has no new exceptions. A new actual-repository scan in `scripts/tests/browser-storage-safety.test.mjs` runs through ordinary CI's existing `test:scripts`, closing the earlier gap where only synthetic sources were tested. Three native browser cases cover denied storage access, denied reads and quota failures at 320/390/1440px, including manual theme selection and fresh-page OS fallback.

Local results: all 13 release source guards, 68 focused tests in 11 files, source lint, strict changed-root TypeScript (3 roots, 313 resolved files) and the actual production frontend build passed. Bundle and sourcemap checks passed; 508 built files were boundedly verified before browser use. Seven native Playwright cases passed against that new build: persisted/OS theme behavior, three storage failures, all four login links/Home return and preserved low-spec asset isolation. No unexpected/protected requests or page/CSP errors occurred. Independent source review passed; no dependency, workflow, shared helper, auth or backend changes were needed.

Evidence: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/release-storage-20261031/`, including before/after receipts and `FINAL_VALIDATION.json`. Source manifest SHA256: `a737f55d0b2feaf964dff492debf2f981cbf043fa2f49bc3e3c886b07323f3ce`. Only this handoff was updated after the tested snapshot. This fix was published as `748636b1f76f0c1991ee158e43362be58b9adfb7`; subsequent CI passed build-and-test/coverage but found the interception teardown issue documented above. Full Release Verification, including its PostgreSQL/runtime/drill/package stages, still requires CI; local focused validation is not a claim that the entire release pipeline passed.

## CI follow-up — 30 October 2026

Landing implementation was published as `a2567fb4b90e091f66ada26f8ba4c0a35936be87`. [CI run 41069123341](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41069123341) passed build-and-test, coverage, full TypeScript, client tests, script tests and the built landing checks. All 19 new landing browser cases passed. The visual step finished with 765 passing cases and one failure in Viewer's hide-empty alternate-record keyboard test; subsequent smoke/accessibility/PageSpeed steps did not run. The earlier CI limitations below describe the original local QA, not failures in these now-confirmed CI checks.

The pending fix adds a close-completion barrier in `tests/visual/viewer-hide-empty.spec.ts` and the equivalent `viewer-detail-search.spec.ts`: wait for the old dialog to be hidden and for focus to return to its original row before keyboard-opening the next row. Radix defers its close autofocus; otherwise it can move focus between the test's `focus()` and global Enter. All original exact title, focus, reset, copy, accessibility and no-refetch assertions remain intact. No production code, snapshots, timeouts, retries or workflow settings changed. Independent source/diff review passed.

Local verification of this fix: all six native Playwright cases across the two spec files passed, followed by three additional repeats of the CI-failing handoff case. The original baseline passed locally once, so this is accurately recorded as a CI-observed intermittent race supported by source analysis, rather than a locally reproduced baseline failure. The same verified frontend build was reused after checking that application inputs were identical; tests ran only in the isolated synthetic-loopback sandbox. Evidence: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ci-viewer-dialog-focus-20261030/`, including `CI_FAILURE_EVIDENCE.json`, `source-after-setup.json` and the three `*-verified.json` post-fix receipts. These changes were published as `c10a171d2bffb6daf4c31de8f845b07d9b6a950e`; the main CI run 41082772697 subsequently passed.

## Delivered behavior

The anonymous normal-profile `/` now renders the supplied landing: compact sticky header, Search/Analyse/Monitor hero, supplied radar, Import→Search→Analyse→Monitor workflow, About, five capability/security panels, Get started and footer. All four Log in links retain `/login` and the existing navigation callback. Registered/authenticated users retain the existing protected application flow.

Light/dark follows the OS until an explicit landing choice. The independent `sqr-landing-next-theme` key does not modify app theme or performance settings. Mobile menu supports touch, keyboard, Escape, anchor closure and desktop resizing. Anchors focus their section, direct fragment URLs survive lazy mount/refresh, and the section index, progress and back-to-top work. Motion is local, demand-driven, cleaned on unmount and paused for hidden/offscreen/reduced-motion states; replay can restart. All32 supplied SVG variants decode under strict CSP. Official Q, favicons and application branding remain unchanged.

## Files and integration boundary

- `client/src/pages/Landing.tsx`: the existing `useLandingMotion` decision selects a normal-only lazy `LandingNext`; the original low-spec return markup is identical after newline normalization.
- `client/src/pages/landing-next/LandingNext.tsx`: semantic React sections, local supplied image assets and native controls.
- `client/src/pages/landing-next/landing-next.css`: every selector/keyframe is scoped; shared safe-area tokens reused. Source list margin restored after preflight; enlarged text reflows.
- `client/src/pages/landing-next/useLandingNextMotion.ts`: owned theme/menu/observer/pointer/scroll/replay lifecycle.
- `client/public/landing-next/`:32 extracted SVG variants; original geometry/CSS preserved, with CDATA required for valid external XML. No AI redrawing or external assets/fonts.
- `client/src/pages/landing-next/landing-next-contract.test.ts` and `tests/visual/landing-next.spec.ts`: preservation/source guards and19 native browser cases.
- Existing tests/helpers updated narrowly: legacy landing AST import allowance; low-spec image/header fixtures; legacy built-browser low-spec fixture; exact `Log in|Sign In` smoke/auth link discovery; normal logout destination; exact-new-stylesheet-only breakpoint allowance and negative tests.
- `design-qa.md`: latest landing review first, previous design QA history preserved below.

No backend, API, database, auth/session/role logic, dependency versions, CI workflows, global theme, boot shell, brand or favicon files changed. All low-spec runtime/component/CSS files remain unchanged; only their test coverage was adapted to target that preserved branch explicitly.

## Verified evidence

External dossier: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/landing-gpt6-20261030/`.

Authoritative summary: `FINAL_VALIDATION.json`. Source10 is the final application build; source11 differs only by a synthetic test's online-state fixture. `11-dashboard-build-compatibility.json` proves all application inputs match. After final documentation updates, final audit rechecks every other current file against source11.

- Source10 manifest: `de359bf736ef70e5ba4e8b53ad7d915a5e9736a111ac9b64612060393432c3b4`.
- Source11 manifest: `ff00fc621db38f768f1f2d23ddc51bef90be5da008b63c12d1b71998b9c4734d`.
- `10-build-verified.json`: actual Vite/Rolldown production frontend,508files; bundle budget and source-map gates passed. Existing nonfatal PostCSS `from` warning remains.
- `10-tests-verified.json`:160 scoped contracts passed.
- `10-lint-verified.json`: changed source lint and changed `.mjs` syntax checks passed. `07-lint-lint-full-verified.json`: full client/server/shared ESLint patterns passed; later source changes also passed scoped lint.
- `11-types-verified.json`: strict changed-root diagnostics passed,9roots/333resolved files. This is not a full-project typecheck claim.
- `06-tests-all-client-1..12-transpile-verified.json`: all501 canonical client test files/2495cases passed; latest source then passed its160 affected contracts. Reviewed real TypeScript transpilation, no runtime/compiler stubs.
- Final native browser: **22cases passed**. `10-browser-{layouts,navigation,functions,accessibility,images,touch,legacy-images}-final-verified.json` covers19 new landing and2 preserved image cases; `11-browser-dashboard-logout-verified.json` covers real Account/Security/logout-to-landing behavior. Zero rejected/unexpected protected/external requests in passing fixtures; no page/CSP errors. Strict script/Trusted Types and style-attribute-none policy; all32 SVG variants decoded.
- Final images and DOM states: `captures/10-browser-capture-{desktop,mobile,sections}-final/`, `10-browser-capture-search/`, `10-browser-low-after-final/`.
- Opened combined source-left/app-right comparisons: `comparisons/10-{desktop-light,desktop-dark,mobile-light,mobile-dark,about-light,about-dark,search-light,search-dark}.png`; focused instrument comparison `10-search-instrument-detail.png`. Density1, matching viewport/state, explicit80px panel anchor. No remaining actionable P0/P1/P2 visual differences.

## Low-spec proof

`FINAL_LOW_SPEC_PROOF.json` compares the final build against committed44f3 baseline. Desktop1440×900 and mobile390×844 screenshots have **identical SHA256**, normalized DOM and geometry; no next landing JS/CSS/assets requested. Desktop hash `5dc8ac78d8b2d733fb26ce6d6dd35ccd0759e33b23a39c9b96aa322aa225108c`; mobile hash `a39ca5e7f05f8a55db68d989ebb2b7dc2267b8d3653072a3de15238ab9e25638`. Original JSX suffix plus18 protected source hashes pass.

The user explicitly chose to preserve low-spec/boot entirely instead of adding a global no-JavaScript fallback. SQR's inherited JavaScript requirement remains an accepted constraint. This was not silently omitted or claimed as implemented.

## CI still required — user-approved separation

The user explicitly accepted full-project typecheck and native esbuild checks in CI. Do not label these local checks as passed:

- Full root TypeScript graph (2926roots) exceeds local memory. Monolithic1024MiB V8 and a same-full-graph diagnostic-shard pilot both exhausted memory; no compiler options/root set were weakened. Keep canonical `npm run typecheck` in CI.
- Real Linux esbuild binary is unavailable; no download/install authorized. Four directly dependent script files remain for CI: billing-osp-table-layout, collection-daily-filter-layout, collection-records-table-layout, frontend-redesign-import-browser `.test.mjs`.
- Exhaustive remaining script attempt ran119MJS+10rootTS files:772/791cases passed;19failures are documented local dependency limitations (missing dotenv/tsx/jsqr entry points, installed systeminformation5.33.15 vs locked5.33.16). No tests were skipped, assertions changed, or missing modules stubbed to claim a pass. Inventory `08-remaining-scripts-setup.json`; receipts `08-tests-{scripts-01..05,script-ts}-verified.json`.
- The existing monolithic legacy full-page browser command exceeded the local memory cap after passing its preload/metadata and320–768px interactions. Its complete CI command remains required; native preserved low-spec image/DOM/network tests passed separately.

Existing CI already runs `npm ci`, typecheck, script tests, `test:landing:built`, `test:visual`, smoke and accessibility gates. After an authorized commit/push, verify those and release readiness before any authorized deployment. Local QA is not a claim that unexecuted full CI is green.

## Safe continuation

Target code runs only in reviewed WSL `SQR-Audit` bwrap, isolated loopback/no external network, empty allowlisted synthetic environment, readonly source/toolchain/deps and scratch-only writes. Typical limits1CPU,768MiB/no swap,128tasks,180s wall/120s aggregateCPU,256MiB scratch. Chromium required finite32MiB temporary files after measured SIGXFSZ at8MiB; retained artifacts remain capped8MiB. Larger failed compiler experiments are documented and not passing evidence. Never run repository/npm/build/test/browser code on Windows or use production identities/data.

The in-app browser failed initialization, so the previously explicitly authorized native Playwright/Chromium fallback was used. No user-accessible live preview is claimed; image previews are retained. Physical devices, full screen-reader use and production were not tested.

Disk pressure was mitigated without deleting application/customer data: redundant agent transport payloads reduced, task text and local dependency text losslessly compressed, audit VHD trimmed/compacted while stopped. Disk remains limited; check capacity before future builds. Source snapshot inventories retain hashes but some old `base64` transport fields were removed after materialization; use current repo to create a fresh snapshot rather than replaying those JSONs.

Final sandbox cleanup and current-byte audit are recorded in `FINAL_VALIDATION.json` before the goal is completed. Commit and push are now authorized. Publish the reviewed landing files only, then verify the remote commit; full CI remains required before a separately authorized deployment. Host-side Git hooks are not used to execute repository code on Windows; retain the sandbox QA evidence and the required CI checks.
