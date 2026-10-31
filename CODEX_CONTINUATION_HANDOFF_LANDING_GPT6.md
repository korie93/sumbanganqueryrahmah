# SQR new landing — implementation and local QA complete

Updated: 31 October 2026 (Asia/Singapore). User requested implementation from `C:/Users/Administrator/Downloads/SQR_Landing_Page_Codex_GPT6.zip`, with a goal and continuation support. Implementation base commit: `44f3c4d3fc408096e4bd04b6b660af850788efbf`. Local QA completed before publication; the user subsequently authorized committing and pushing this work on 30 October 2026. **Deployment still requires a separate user request.**

## Current CI follow-up — landing image sizing and brand fixtures, 31 October 2026

[CI run 41170744884](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41170744884)
on `20b210da104efb5f210ab3abeed1e8c75478d655` passed build-and-test, dependency
audit and coverage. [CodeQL run 41170744816](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41170744816)
passed separately on the same SHA. The CI visual stage passed 770 cases and failed six:
two public-brand cases and one offline favicon/SPA case still selected V21
elements; three lazy-image cases reported `LazyLoadImageIssue` at 1440/390/320px.

The locally verified fix updates brand/favicon fixtures to the actual banner SQR
link, transparent Q and Main > Log in navigation. All decoding, metadata,
auth-logo, offline recovery and CSP assertions remain. The only runtime change
adds `aspect-ratio:1` to `.sqr-landing-next .instrument-image`, which already has
percentage width and auto height. Chromium's sizing check requires an explicit
CSS ratio in that combination; the HTML-derived `auto 120 / 120` is insufficient
even when observed geometry is stable. Do not describe this as confirmed CLS.
No animations, SVG files, image loading policy, dependencies, snapshots, retries
or thresholds are changed.

Synthetic connectivity is now explicit: the public-brand scenario starts online,
and the favicon fixture updates `navigator.onLine` from online/offline events
before application handlers run. Actual `context.setOffline`, offline PNG decode,
polling suppression, SPA round-trip, reconnect and reload assertions are retained.

The image regression now holds all five original instrument SVG responses,
checks positive square reserved dimensions before decoding, then compares every
image's size afterward. The zero-browser-issues assertion stays intact. Against
the unchanged previous build, the same enhanced fixture fails on computed
`auto 120 / 120` versus required `1 / 1`. The patched real frontend build passed
all three image cases. Final source passed 62 focused contracts, changed-file lint, strict
changed-root TypeScript (4 roots, 314 resolved files), bundle and sourcemap gates.
In total, 23 selected native browser cases passed: 3 image, 2 public-brand,
5 favicon, 5 responsive layout, 6 constrained-device animation and 2 accessibility
cases. No serious/critical axe violations were reported in either theme. The
expanded image regression covers all five lazy assets at 1440/390/320px.
The user authorized commit/push of this follow-up on 31 October 2026. No
deployment is included; production remains at `4d06b29e`. Publication receipts
are retained as `PUBLICATION_PREPARED.json` and `PUBLICATION_VERIFIED.json` in the
evidence directory below. The complete GitHub visual suite still needs to run
against the published fix; these are focused local checks, not a new CI pass.

Evidence directory:
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ci-universal-landing-20261031/`.
It contains the full bounded CI job log, failure summary, source inventories,
before-fix regression and passing checks. Target code runs only in the existing
WSL bwrap/cgroup sandbox with synthetic loopback fixtures and no external network.
No large CI artifact was downloaded; no dependency installs or production probes
are required. Disk pressure was addressed by lossless text compression and
removing verified duplicate agent-only release transports from older deployments;
server releases/backups, customer files and source contents are retained.

Source/evidence lineage: production frontend build and image checks use manifest
`d9d9c5d2df783e05bb2c1dcbef7aa0a5a0b50f282673eb119c4ec6fc1cd0391d`.
Remaining browser cases use fixture-only manifest
`763cd063ca768ab0315b7670f496ae619ee8384a8b5c1ea5a8e95927631f6c06`.
Final tests/lint/types use manifest
`1c5f60f1d0d91d633c7f9953da6a47260c7fe73e6f93d41b430de85400c501f9`:
only a redundant new source assertion was removed; the existing contract file is
identical to HEAD. Production frontend inputs are identical across these three
manifests; this final handoff update is documentation-only. `FINAL_VALIDATION.json`
records exact receipts and current source hashes.

## Universal landing implementation — 31 October 2026

Production was successfully deployed to `4d06b29e7b5ec26d66a6f6a9701af7bc42795cbe`
on 31 October. CI, CodeQL and Release Verification passed that exact SHA;
deployment and verified full PostgreSQL backup evidence are outside the repo at
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/deploy-20261031/DEPLOYMENT_RESULT.json`.

The user then reported the old landing on desktop but the new one on their
phone. Source inspection confirmed the route still selected the V21 page for
low-spec signals, including reported memory/cores at or below four. The user
explicitly superseded the earlier low-spec preservation requirement: **use the
new landing on every device and do not reduce its animations for low specs**.
This latest instruction takes precedence over historical preservation notes and
the original ZIP. Explicit OS/browser `prefers-reduced-motion`, hidden-page and
offscreen pauses remain accessibility/lifecycle controls, not hardware downgrades.

Implementation complete locally: `Landing.tsx` always lazily mounts `LandingNext`;
the new motion hook owns its reduced-motion subscription and does not read
hardware, network or `perf_mode`. Shared animation CSS excludes only the public
landing from low-spec animation/transition suppression. Other application device
policy, stored preferences, boot shell, auth and protected routes remain intact.
Legacy modules remain unmounted. Tests that previously required the old branch
now assert universal layout, animation and navigation behavior.

Current local QA/evidence directory:
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/landing-universal-20261031/`.
Run target code only in the existing reviewed WSL/bwrap/cgroup sandbox; no host
repository execution, production identities, customer data or dependency installs.
Local QA complete: 112 focused tests, full client/changed-MJS lint, strict changed-root
TypeScript (9 roots, 323 resolved files), real production frontend build (507
files), bundle/sourcemap guards and 32 native browser cases passed. Browser
coverage includes all six device/performance/network profiles, responsive
light/dark layouts, actual CSS/SVG animation and transition states, live reduced
motion, hidden/offscreen cleanup, keyboard/menu/anchors/login/Home, denied
storage, all 32 SVG variants, lazy-image geometry and axe checks. The header
fixture was corrected to assert the existing global Malay skip link before the
landing's English skip link; its final browser/lint/type checks passed (1 root,
288 resolved files). Only test code changed after the production build.

The package-invoked `scripts/landing-v21-built-browser.mjs` retains its entrypoint
and 20 functional checks for the universal page. It now captures viewport
overviews and all nine sections individually at 320/1440px instead of a single
large full-page canvas. A context init script now seeds only its own loopback
origin, avoiding storage access in the initial `about:blank`; the final assertion
still rejects every unexpected page/API/asset/CSP error. Its final canonical
rerun passed all 20 checks, including every viewport/section capture, with zero
unexpected page/API/asset/CSP errors. Earlier failing attempts remain retained as
diagnostics; none count as passing evidence. Final full client/changed-MJS lint
also passed after the fixture correction. The sandbox uses the same bounded
native Chromium launch flags as the focused browser suite; it does not replace
Chromium or stub the app/compiler. Artifact source SHA for the final test overlay:
`72e20be4a7241963c1f939ea17a32249f436a49a279cc861fb5b96d64e8ef9ae`.
Application/build inputs remain identical to source manifest
`782933a2a06ecb568f7a95b24889c3f3ff446a741b0e07c3b3200fbc7f4f416c`.
Independent source and test review found no actionable issue. Final source hashes,
passing receipts, build-input identity and sandbox cleanup are recorded in
`FINAL_VALIDATION.json` in the evidence directory above. Only this handoff changed
after the final snapshot. The user authorized commit/push on 31 October 2026;
the 13 reviewed paths will be published together, with final commit/remote/blob
verification recorded in the external `PUBLICATION_VERIFIED.json`. For these
Git invocations only, a reviewed empty hook directory preserves the sandbox-only
execution boundary; no Git configuration is changed. Sandbox lint/tests plus
staged-content secret/hygiene and Conventional Commit checks are retained as
publication evidence. No deployment is included; production still runs
`4d06b29e`. Full clean-install
CI/Release Verification remains required after publication. Physical hardware
frame-rate measurements and the whole-project TypeScript graph were not rerun;
the device-profile checks are native browser tests with synthetic reported signals.

## CI follow-up — dependency audit, 31 October 2026

[CI run 41156100909](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41156100909)
on published `89d0b4db95cfdfe66a2379cdfa77333a2ce89472` stopped at Audit dependencies.
The new minimatch advisory propagated through development-tool chains. A fresh
official npm bulk response also flagged glob. Fixed with exact overrides
`minimatch` 11.0.1 (GHSA-g3hv-75wg-m249) and `glob` 14.0.2
(GHSA-3g3m-2fjr-6pw4). Only four lock entries change: those two, required
`path-scurry` 3.0.0 and new `@isaacs/nonrecursive-glob-match` 1.0.1, all dev-only.
Glob 14 also supports minimatch 11's Matcher objects during coverage discovery.
The existing legacy React ESLint callable adapter is retained. Audit thresholds,
exceptions, retries, lifecycle-script allowlist and runtime application code are
unchanged. Both override runbooks and the helper rationale are updated.

New `scripts/tests/dependency-minimatch-regressions.test.mjs` and
`scripts/tests/dependency-glob-regressions.test.mjs` run via existing
`test:scripts`. They cover ESM/CommonJS, ordinary glob matching, bounded
optimization preprocessing, async/sync coverage discovery, test-exclude and
first-directory-read cancellation. Fixtures are tiny; no exhaustion payloads,
timing assertions, production data or external runtime network were used.

Local verification passed 183 audit/compatibility tests; full client,
server/shared and changed-tooling ESLint; the actual c8 tool running 91 tests
(90.44% statement/line coverage for the audit helper only); and real npm audit
through the unchanged project gate against isolated-loopback replay of the
fresh, unmodified official registry response. The final registry response has
zero advisory packages. Offline npm lock-only resolution succeeded with no
installation or graph change; the sole normalization was pre-existing Zod
funding metadata changing from a URL string to `{url}`. It was compared as
equivalent in the external harness; the unrelated repository entry is preserved.

All execution used WSL `SQR-Audit` bwrap/cgroups: no external network, empty
allowlisted environment, readonly source/dependencies/toolchain, scratch-only
writes, 1 CPU, 768 MiB/no swap, 128 tasks, 180 s wall/120 s aggregate CPU and
256 MiB scratch. Official patched tarballs matched registry SHA-512 integrity.
Missing sandbox coverage-tool files were copied from existing local packages at
the exact locked versions and mounted readonly; nothing was installed and no
package lifecycle script ran. Independent source review found no actionable issue.

Evidence: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/minimatch-ci-20261031/`:
`registry-evidence.json`, before/after official audit responses, verified package
data, `setup-v2.json`, source inventories and passing sandbox receipts. Tested
source manifest SHA256: `3b7586e83b4d2d24468768d61c4bc7d757cc3443732d6ca268899d6c6262d4ac`.
Only this handoff and the validation paragraph in Dependency Notes changed after
the tested snapshot. The user authorized commit/push on 31 October 2026. The
eight reviewed paths will be published together; final commit, remote and exact
blob verification are recorded in the external `PUBLICATION_VERIFIED.json`.
Host-side repository hooks are replaced only for these Git invocations with a
reviewed empty hook directory, preserving the sandbox-only execution boundary.
Sandbox lint/tests, staged-content hygiene/secret checks and Conventional Commit
validation provide the corresponding publication checks; Git configuration is
not changed. No deployment is included.
Full clean-install CI, build/typecheck/browser and Release Verification still
require the published revision; do not claim those jobs are green locally.

## CI follow-up — intercepted response teardown, 31 October 2026

[CI run 41148647718](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41148647718) on `748636b1f76f0c1991ee158e43362be58b9adfb7` passed build-and-test and coverage. Its visual stage had 768 passing cases and one failure in the direct-fragment/refresh landing case: `route.fulfill: Route is already handled!`. Installed Playwright 1.60 clears page route registrations before `unrouteAll({ behavior: "wait" })` finishes waiting. A completed callback can then remove server interception while other callbacks are still fetching artwork, causing those routes to be continued before their later fulfilment.

The pending fix changes only `tests/visual/landing-next.spec.ts`: track and return each whole route-handler promise, drain callbacks with registration intact before unregistering, await drains before fixture assertions, and use the same cleanup before closing the manual phone context. CSP augmentation, protected/off-origin request guards and original assertion coverage remain intact. No application code, dependencies, retries, timeouts, snapshot baselines or pixel thresholds changed.

A deterministic browser regression holds two real SVG responses, starts cleanup, releases them across a public interception-update barrier, and verifies original status/body/semantic headers, exact appended CSP, decoding and successful cleanup. Reverting only the pre-unroute drain line in an immutable counterfactual snapshot reproduces the same `Route is already handled!` error; the fixed case passes. Rejection observers and finally-released gates keep assertion failures from stranding test operations; they do not suppress route errors.

Local validation passed all 23 landing browser cases (the original 22 plus this regression), 27 focused source/contract tests and strict changed-root TypeScript (1 root, 289 resolved files). Coverage includes light/dark responsive layouts, direct fragment refresh, keyboard/touch, OS/persisted/denied storage, animation cleanup, all 32 SVG variants, login/Home return, low-spec asset isolation and axe checks. All passing fixtures report zero unexpected/protected requests and no page/CSP errors. The verified frontend from the storage fix was reused only after proving all application inputs are identical. Independent source review passed.

Evidence: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ci-landing-route-lifecycle-20261031/`, including `CI_FAILURE_EVIDENCE.json`, `source-input.json` (records the precise counterfactual), `setup.json`, before/after browser receipts and `FINAL_VALIDATION.json`. Tested source manifest SHA256: `7f874da8756ddda8ecb150e93b7cc6950e6ef5444f50ca234e998c18f5b6228b`. Only this handoff was updated after the snapshot. Published as `89d0b4db95cfdfe66a2379cdfa77333a2ce89472`; subsequent CI stopped earlier at the dependency audit documented above. This is not a deployment or full CI/Release Verification pass.

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
