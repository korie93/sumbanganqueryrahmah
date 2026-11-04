# SQR Impeccable remediation handoff

> **Penyerahan akhir 5 November 2026:** nota di bawah ialah sejarah pelaksanaan. Status semasa: 21 pembaikan selamat siap, semua 9 P1 disahkan; S12/S21 ditangguhkan mengikut arahan. Rujuk [laporan BM akhir](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-impeccable-remediation-report.md), [checkpoint semasa](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-impeccable-checkpoint-20261105.md) dan [bukti mesin](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-impeccable-verification.json). Build terkini f2c3fd4fe642 lulus; skor konservatif 15/20. Full typecheck masih OOM; bukan CI standard pass. Tiada commit/push/deploy dibuat.

Goal: implement the safe remediation phases from the user's SQR_Impeccable_Audit_Remediation_Codex_Sol_6_1_Ultra.md. Baseline audit score: 13/20. Do not claim a new score until verified rendering and regressions support it.

## Constraints

- Frontend only. Preserve backend, database, API, authentication/session, role permissions, navigation, branding and business calculations.
- Preserve working animations and low-spec support. No new dependencies.
- Resolve all nine P1 issues before P2. Use harden, clarify, layout/adapt, optimize/harden, then polish/audit as specified.
- S12 and S21 require specific UX approval; leave their behavior unchanged.
- No commit, push or deploy has been requested for this remediation.
- Target-controlled execution must use the existing OS-enforced isolated WSL sandbox, with no external network, empty allowlisted environment, read-only source/toolchain, bounded scratch and CPU/memory/process/file/time limits. Do not execute app/test/build on the Windows host.
- Prior audit artifacts are read-only: C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-ux-audit-20261104/.

## Current state (2026-11-04)

Base HEAD ab44bda4fe34e4b3e1bd3cc17f48a73e1c97b343, main. Existing untracked skill-install directories must be preserved. Source patches now exist for S01/S02/S03/S04/S05/S06. S15/S18/S20 are being implemented by p1_viewer_semantics agent. User manually deleted artifacts/ci-38669128827/smoke.zip; verified absent, initial C: free 215,719,936 bytes. Latest free space about 54 MiB; watch writes. Other deletion attempts were rejected by automatic approval review; do not bypass or repeat them.

This handoff was restored after a failed write at zero disk space truncated our newly created note. No application file was lost. Monitor free space and use small writes.

## Status / scope

| ID | Priority | Requirement | Status |
|---|---|---|---|
| S01 | P1 | Daily calendar draft must survive target save; guard concurrent saves/refresh | IN-PROGRESS |
| S02 | P1 | Group member disclosure accessible name includes leader nickname | IN-PROGRESS |
| S03 | P1 | Restored import job opens usable job status without original File | IN-PROGRESS |
| S04 | P1 | Virtual Viewer table exposes accurate table/row/cell semantics | IN-PROGRESS |
| S05 | P1 | Search AND/OR state and filter fields accessible | IN-PROGRESS |
| S06 | P1 | Audit Logs error/retry differs from empty; reject stale results/export | IN-PROGRESS |
| S07 | P2 | Chaos Scenario Type label associated with control | NOT-STARTED |
| S08 | P2 | Month draft supports sequential typing; normalize on commit | NOT-STARTED |
| S09 | P2 | Nickname filter no-match and clear action differ from true empty | NOT-STARTED |
| S10 | P2 | Receipt metadata has stable visible labels | NOT-STARTED |
| S11 | P2 | Advanced columns fetch loading/error/empty and retry | NOT-STARTED |
| S12 | P2 | Checkbox/inspection UX decision | DEFERRED-UX-APPROVAL |
| S13 | P2 | AI scroll only near bottom, jump to latest preserves reading | NOT-STARTED |
| S14 | P2 | Bound/chunk AI reveal, reduced motion, preserve cancel/retry | NOT-STARTED |
| S15 | P1 | Monitor help buttons are siblings of disclosures | IN-PROGRESS |
| S16 | P2 | Backup job survives section remount with revalidation | NOT-STARTED |
| S17 | P2 | Role preview/count distinguishes saved and draft permissions | NOT-STARTED |
| S18 | P1 | Monitor status normal-text contrast >=4.5 in both themes | IN-PROGRESS |
| S19 | P2 | Forbidden page does not nest main landmarks | NOT-STARTED |
| S20 | P1 | Light 403 CTA normal/hover contrast >=4.5 | IN-PROGRESS |
| S21 | P3 | Single Active Tab theme decision | DEFERRED-UX-APPROVAL |
| S22 | P3 | Landing rail target size >=24 or evidenced exception | NOT-STARTED |
| S23 | P2 | Maintenance prose metrics wrap naturally at narrow widths | NOT-STARTED |

## Root causes and work ownership

- Root S01: target save calls refreshCurrentView; overview overwrites calendar and refresh clears dirty set. Saves have no synchronous mutual exclusion. Need guarded resolution for dirty draft, coherent refresh/edit guards and behavioral regression.
- Agent remediate_import_p1 owns S03: effect prioritizes !file over backgroundJob and step availability requires File for restored job. Existing hook can resume by job ID; no backend fix needed.
- Agent remediate_audit_p1 owns S06: catch only logs, retains old rows/pagination; query identity/race and lazy export need current-result checks.
- Root handles sandbox execution centrally. Agents must not run target code on host.

## Verification / continuation

Existing controller reference: /opt/sqr-audit/ui-audit-20261104-v1-control/ in SQR-Audit WSL. Prior audit runtime artifacts/controllers are read-only; create a new remediation controller and overlay current changed source/tests. Do not test the old build as if it covered new edits. Known limits: CPU 100%, memory 768 MiB, pids 128, scratch tmpfs 256 MiB, file 32 MiB, aggregate CPU 120s, wall 180s; isolated loopback and fontconfig mounts required. Linux Node 24.22.1 and Chromium headless shell are locally available subject to revalidation.

New external controller is ready at /opt/sqr-audit/ui-remediation-20261104-v1-control/, harness with same prefix. Trusted Windows orchestration/scripts/results: C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-remediation-20261104/. Run `node <external>/sandbox.cjs tests <exact .test.ts paths>`, `lint <exact paths>`, `build`, or `browser <batch> <id>`. It freezes current client/shared/scripts/tests/config into read-only inputs and records source manifests per run. No env/repo-root mount. Tests use existing TypeScript transpileModule loader in sandbox because tsx cannot start with the locally available Windows esbuild; JSON/CSS test imports supported. This is not a claim that the normal npm CI command passed.

Evidence so far:
- receipt-adaptive-tests-a1a0adeefded: S01 guard/control tests 5/5 passed.
- receipt-adaptive-tests-481f4c01f5fa: initial S01 changed-file lint passed.
- receipt-adaptive-tests-e0a67b16fddf: S01 + restored import + existing import contracts + S06 reducer, 22/22 passed.
- receipt-adaptive-tests-04ad8dedf78b: S02 + S05 + S04 virtual Viewer new/existing regressions + S06 feedback markup, 22/22 passed.
- receipt-adaptive-build-b1ddffd43308: Vite frontend compiled successfully, but overall wrapper exit1 because required archive/manifest were not yet emitted. build.py now emits them; must rerun. Existing PostCSS `from` warning is not introduced by application edits.
- Earlier failed tests were harness failures (missing Linux esbuild, then native JSON import attributes), corrected in external test loader. Preserve logs, do not count failures as application regressions.
- A broad trusted file search in WSL was deliberately stopped via terminating SQR-Audit after the build had finished; avoid unbounded rglob of all /opt/sqr-audit. No production services involved.

Next: finish/review remaining P1 monitor/contrast patch; targeted lint and regressions; successful current-source build/archive; real browser Daily/Import/Audit, Viewer/Search/Monitor/403 (6 widths x2 themes, screenshots/AX375/1366). prepare-browser.cjs creates a NEW harness from read-only old script and changes assertions for fixed behavior. Browser run requires source manifest exactly matching last valid build; rebuild after edits. New browser harness not executed yet. Then proceed approved P2 phases; no P2 has been edited yet.

## Latest continuation update

### 5 November, current checkpoint

- Latest current frontend build: receipt-adaptive-build-3564cdef5d59 PASSED. Prior build65d2c977ca32 also passed. Root fixed staff selector interaction: disable only during saves (not overview loading); effectiveOpen controls both content and aria-expanded. Independent source review found no import regression.
- New committed-source Playwright regressions: tests/visual/app.visual.spec.ts (async restored import/resume and audit failure/retry/failed filter); tests/visual/collection-report-controls.spec.ts (draft/target/background refresh/discard + save busy). Import test receipt-adaptive-tests-94fe09560050 PASSED 1/1; Audit ca671106f879 PASSED; Daily ec941ca2c42a PASSED. Earlier CLI failures: sandbox offline navigator.onLine caused no protected mount (explicit synthetic override fixed); Daily selector needed scoping to edit panel because bulk also has Leave type. Three-in-one run exceeded aggregate CPU120s; run individually, never raise budget.
- Monitor browser70df83fcfe29 passed behavioral assertions but collector found residual amber badge4.48:1 (not accepted). Added same scoped warning token to Alerts summary, Deferred summary and WebVitals rating; green success copy in Chaos uses scopedgood token. Latest lint bd6997d707a2 PASSED; Monitor rerun5e431760b360 PASSED command, collector pending. Do not claim no axe issues until collector inspected.
- Viewer browser0365294aeb69: 12cases,4screens, no overflow/pageerror/axe violations. Import081f31eea351 likewise12cases commandpassed, still collect screenshots needed. Daily a94b29747d3f12cases fully collected/reviewed; Audit fc3d63dabaac overflow corrected later and requires rerender current source.
- Current live/pending handles at note: collect Monitor session43291; Forbidden browser session52644. Poll these exact handles before relaunch. No other app code execution outside OS sandbox.
- P1 S02 populated groups and S05 search keyboard browser still needed; configured in new external harness. S18/S20 computed color math now captured in browser normal/hover. P2 edits have NOT begun, but phase3source plans are ready below.

P2 plans from fresh read-only agents:
- S07 MonitorChaosControls ScenarioType p -> existing Label htmlFor plus matching SelectTriggerid; never invoke chaos endpoint.
- S08 CollectionMonthField preserve rawdraft, autocommit only completeYYYY-MM, normalizeYYYY-M onblur/Enter; existing normalizer contract stays.
- S09 NicknameAssignmentTable needs source-total count and query+clear callback through Panel/viewmodels; activeAvailable alone cannot prove totalempty. Show no-matchclear vs trueempty/add using existing callbacks.
- S10 CollectionReceiptPanel existingDraft metadata grid add visible Label exact IDs; preserve aria-label/values/disabled.
- S11 useGeneralSearchDataState loadColumns catchlogs only. Separate columnsError+retry threaded desktop/mobileadvancedcontrols; successfulempty differserror; filters unchanged.
- S16 useBackupMutationState localjobID loss. Backup-only sessionStorage recovery record scoped by getStoredAuthenticatedUser id and getStoredActivityId; use safe browser-storage helpers, reject mismatch; querykey includes scope, revalidate existing getBackupJob. MissingID means no tracked job/unknown, never prove globalnone. Unknown/checking/failed+retry until fresh GET; guard async onaccount/sessionchange; no auth/backend/API edits; prevent repeat terminaltoasts.
- S17 expose existing getEffectiveValue from useSettingsDraftState -> systemsettings -> controller -> Settings -> RoleSections. Counts/comparison use draft getter, original SettingItem/rendererobjects preserved; label unsavedpreview.
- S19 Forbidden embedded prop (defaultfalse): main#main-content only standalone; div in protectedrenderer all4sites. Update saved-owner-scope test literal expectation.
- S23 MaintenanceSettingsNotice scoped summaryclass singlecol mobile +1rem prose (no global numericmetric change).
- S13 effects useAIChatExternalEffects and ai/useAIPageLifecycleEffects force scroll on eachchunk. Shared near-bottom follow+accessible JumpToLatest preserve userreading. S14 useAIChatTypingAction and ai/useAIPageTypingAction per-char intervals; bounded elapsed-time chunks/reduced-motionJS preserve existing finalize/session/cancel refs. Need 4k/20k 1x4x6x behavioral/perf captures; source math alone not proof.
- S22 landing-next.css railanchors22x14 ->>=24px target without changing dash/motion/navigation. S12/S21 remain deferred.

- All nine P1 have actual source patches. Still IN-PROGRESS until final browser checks; do not mark them all FIXED based on code alone.
- New Monitor foreground classes must be named tokens (`text-monitor-status-good/warning/critical` in tailwind.config.ts), not arbitrary text-[...] classes, because project ESLint rejects arbitrary typography syntax. This was corrected; lint passed afterwards.
- receipt-adaptive-tests-9331c2ae4efe: Monitor disclosure/contrast + existing InfoHint 7/7 passed. Together the three groups contain 51 targeted tests (22+22+7).
- receipt-adaptive-tests-d2423a82c720: all changed/new client TS/TSX files lint passed.
- receipt-adaptive-build-3493bff85476: current-source Vite frontend build + bounded archive/manifest PASSED. New input archive copies only the verified public archive into read-only inputs; never expose retained artifact directory to target.
- receipt-adaptive-tests-a94b29747d3f: Daily browser12cases (6 widths x2 themes),4screens/axe, no overflow/pageerror/axe violations. Dirty review1 remains1, targetPUT0, backgroundoverviewrefresh0. Two screenshots actually inspected (dark375,light1366).
- receipt-adaptive-tests-081f31eea351: Import browser12cases passed including async restored job Resume/progress visibility. Collect/review artifacts still needed.
- Audit first browser attempt failed because retry fixture omitted required pagination fields. Corrected fixture only (no API/schema changes). receipt-adaptive-tests-fc3d63dabaac then passed error/retry behavior and true-empty-after-success, but collector found document width403 at320/375. Screenshot confirmed new unavailable sentence was nowrap in Activity Records trigger. Source now adds min-w-0/whitespace-normal and shrink-0 chevron. Must rerun tests/build/browser for that actual fix; last valid build predates it.
- Viewer browser session53164 was running when this note was updated; poll that exact handle, do not restart only due timeout.
- WSL had getpwnam/root I/O and E_FAIL startup failures; shutdown/restart recovered and subsequent browser runs succeeded. Treat failures as environment, not app tests. Free C fluctuates ~160MB; user has NOT confirmed1GB free.

User latest steering: clean unimportant files IN PROJECT. Inventory found artifacts4.93GB, coverage43MB, dist-local13MB. Do not bulk-delete them: design references/screens/logs may matter. Verified21 old `chrome-probe-*` disposable localhost test profiles under artifacts/login-lcp-fix and artifacts/landing-v21-reference (~1.3GB), no reparse points/activeChrome/Edge/tracked files. Native PowerShell deletion was rejected by automatic approval review (`blocked by policy`) despite user authorization. NO profile was deleted; do not bypass via other API/tool. Exact manual list and instructions: docs/ui-impeccable-cleanup-plan.md. Preserve main dependencies, project code, envs, assets, real receipts/PDF/Excel/Collection/database and prior external audit artifacts.

P2 source analysis ready (no P2 edits): S08 CollectionMonthField.tsx commits one-digit months on every key; preserve rawdraft and commit only complete YYYY-MM, normalize on blur/Enter. S10 existing receipt metadata lacks visual Labels although IDs/aria good. S23 MaintenanceSettingsNotice uses numeric summary strip for prose; narrow scoped mobile single-column/text values; don't modify global numeric metrics. Agent remediate_import_p1 supplied details. Continue phase3 only after P1 regressions.

Client test discovery only includes .test.ts (not .test.tsx). Add meaningful tests picked up by CI. Record targeted red/green checks, each phase's tests, actual pages/widths/themes rendered, screenshots/AX evidence and remaining gaps. Final BM report must list S01-S23, changed paths, tests and evidence-based comparison with 13/20.
