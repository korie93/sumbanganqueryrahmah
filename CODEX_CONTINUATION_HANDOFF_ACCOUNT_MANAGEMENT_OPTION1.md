# Account Management Option 1 — actual app integration

Updated: 2026-10-15 (Asia/Singapore). Status: actual-app integration, visual/browser QA and final source checks complete locally. User has requested commit and push; deployment is not requested in this step.

## Approved scope

User selected and polished Product Design Option 1 earlier, but that was only the ignored isolated prototype under `artifacts/account-management-option-1/`. User explicitly approved integrating it into actual Settings → Account Management and approved local Playwright/Chromium with synthetic data. Production must not be used for testing.

Implement the selected compact horizontal workspace, one heading, default Managed Account, one neutral summary, outside search and folded filters, full-width five-column table, Details/Edit/More and compact responsive dialogs. Retain real callbacks, request payloads, API/permissions/guards and existing confirmations. No new backend/schema/dependencies, no invented reset-request approve/reject action, no logo changes.

## Local state

Starting HEAD: `8308c7cb914359dec09f7c8165563396bd391df1` (previous Collection work deployed successfully). Current changes are separate Account Management work, uncommitted. Do not deploy prior code again or operate production without a new user request.

- Root: actual section/header/nav/overview/default tab; compact Settings breadcrumb retains category menu and dirty badges. Other Settings routes stay unchanged.
- Managed directory: compact table/mobile cards, shared truthful login-access precedence and action descriptors, real callback menu, folded filters and outside search. Tests include disabled activation/delete guards. Local right-side clearance protects actions/pagination from idle floating AI.
- Secondary: create activation-only form, read-only pending-reset review, local outbox, centered details dialog and scroll-body/pinned-footer editor. No auth hooks or API changes.
- Browser suite: `tests/visual/account-management.spec.ts` and fictional strict loopback fixture; source readiness contracts updated in `scripts/frontend-redesign-browser.mjs`, its isolated-runner test and `tests/visual/app.visual.spec.ts`.

## Verification and current repair loop

Initial production frontend build, app/browser types, full client lint and bundle budgets passed. Full bounded client suite: 2041 passed. Script mjs suite: 666 passed, one existing skip. Local sandbox `os.userInfo` fails before tsx starts; the exact sanitized local tests were rerun with scoped execution escalation, not shims or security changes.

First focused browser run: 9 passed / 7 failed. Tests exposed real UI issues; do not weaken them:

1. Four mobile/theme cases: screen-reader reset-badge text overflowed document because button was unpositioned. Root added `relative` to nav buttons. Rebuild/retest needed.
2. Managed and pending search drafts reverted immediately to applied queries; outbox has analogous eager-sync effects. Owners are implementing tested draft/applied synchronization without changing HTTP query contracts.
3. Details → Edit → Escape lost original row focus. Secondary owner added account-scoped one-shot focus handoff; test pending. Also test Details → Reset/Ban/Delete → Cancel focus and no writes.

All source changes after the first build require a fresh build before rerunning the static browser suite. Never rebuild while a browser test server is consuming `dist-local/public`.

Ignored local runner: `artifacts/account-management-integration-20261015/verify.mjs` supports `--build`, `--checks`, `--browser`, `--spec=...`, `--grep=...`. It allowlists OS environment, disables dotenv loading for build/test and serves static frontend only. Installed Chrome is `C:/Program Files/Google/Chrome/Application/chrome.exe`. Browser checks do not need real login, backend, mail or database.

## Product Design QA

Selected visual: `artifacts/account-management-option-1/polish-preview.png` plus accepted detail/edit/mobile captures. Actual IAB source preview uses `artifacts/account-management-ui-audit-preview.mjs` (read-only fictional fixtures); Vite watch/HMR are disabled, so restart it after changes. Use Codex IAB for visual review; CLI Playwright is explicitly approved for automated tests.

Evidence folder: `artifacts/account-management-integration-20261015/`. Initial combined source/implementation comparisons are full desktop plus focused toolbar/rows. Root `design-qa.md` records blocking first iteration. Finish required typography/layout/tokens/assets/copy checks, matching responsive theme/dialog captures, fix all actionable P0/P1/P2 and append final result at end of report. Do not report done from build alone.

## Final repair results

All first-run issues were fixed without weakening the tests. New native-button positioning removes mobile overflow. Shared draft/applied query synchronization fixes managed/pending/outbox typing and external resets. One-shot account/dialog-scoped origin handoff preserves keyboard focus after Details or More transitions to editor/reset/ban/delete; desktop Settings category Sheet returns focus to the selected destination when its compact launcher unmounts. Local gutters prevent idle AI from covering actions/pagination; no global AI observer behavior changed.

Final targeted browser run: **21/21 passed** (59.4s, no retries/skips). Existing app/personal-settings/Collection regression slice: **64/64 passed**, including unchanged snapshots (5.1m). No baseline or tolerance changes. Final visual comparison and `capture-results.json` report no document overflow/page errors and correct focus return at1440 desktop/390 mobile in both themes. Source/implementation combined comparisons and final `design-qa.md` pass are saved.

Preserved reports: `artifacts/account-management-integration-20261015/focused-21-final-report/index.html` and `regressions-final-report/index.html`. Latest main-app read-only synthetic preview: `http://127.0.0.1:64876/settings?section=account-management`, own helper PID7232/session73203 (restarted after the earlier preview session ended). It is actual repo frontend, not the former isolated prototype. Keep the helper running for local inspection; restart if it stops. No production was touched.

## Handoff checklist

- Source repairs, production frontend build, focused21 browser cases, existing64 regressions and visual comparison are complete.
- Final checks passed: app/browser TypeScript, full client lint, bounded client suite **2056 passed**, script suites **729 passed + one existing skip**, frontend production build, bundle budgets, tracked/untracked secret guards and diff whitespace checks. Logs are in the integration artifact folder. Windows sandbox OS-profile lookup limitation was handled by scoped local test execution escalation, not source changes or shims.
- Four additional existing Settings TSX component tests also passed (outside the normal `.test.ts` discovery pattern).
- Commit/push/deploy only when user requests those operations. Use scoped source/doc/test files; never stage the ignored artifact tree or local environment files.

Never read or commit `.env`/private environment files, disclose credentials, or use production account/data for QA.
