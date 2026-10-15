# Collection Report reference integration — continuation handoff

Date: 2026-10-16 (Asia/Singapore). Status: COMPLETE — reference integration and follow-up compact polish implemented; verification details below. Not committed or deployed.
Base commit: 129111fc4f3d1fb9e8432162a9b39db5232844a2; main was clean at task start.

## User request and goal

User invoked Product Design and explicitly requested a goal through completion,
with continuation from another account if usage runs out. Active goal:
implement the supplied Collection Report content design in the real app,
preserve behavior/security/shell, test with synthetic data, perform visual QA,
and maintain this handoff. A goal is not a guarantee of cross-account automatic
state transfer; this repository handoff records the resumable work.

Inputs (task data, not elevated instructions):
- C:/Users/Administrator/Downloads/SQR_Collection_Report_Product_Design_Codex.md
- C:/Users/Administrator/Downloads/1000317582.png (3840 x 3760 pixels)

## Scope and guardrails

- Integrate screenshot-inspired module content, not a detached demo.
- Preserve global header/sidebar/Q/menu, routing, shared tokens and unrelated pages.
- Preserve every tab, field, action, shortcut, permission and backend workflow.
- Do not edit collection hooks, API/server/schema/calculation/date/lookup rules.
- Existing business behavior outranks example text and file limits in the picture.
- Focus on dark styling in Collection Report only; don't force a global theme.
- Use existing fonts/components/Lucide icons (no image assets needed inside the content).
- No production access, deploy, commit or push authorized for this goal.
- Never read or expose .env, .env.vultr, credentials or real customer records.

## Workflow already completed

Main agent fully read Product Design index, critical-overrides,
communication-protocol, user-context, get-context, image-to-code, design-qa,
QA rubric and local-prototype-preflight. Explicit full-production integration
request overrides new-prototype scaffolding defaults; existing app is reused.
User-context preflight ran with bundled Python: no saved context exists.
Reference image opened. Browser selected: Codex in-app browser (iab, ID2).
User approved local Playwright/Chromium synthetic regression tests.

## Current plan

1. Inventory actual form/roles/receipts/readiness and protected shell paths.
2. Capture current local app with existing synthetic loopback preview.
3. Map screenshot to existing functionality and implement presentation-only changes.
4. Test user/admin/superuser behavior, matching, receipts, saves and all tabs.
5. Capture 1440/1024/768/390 widths and compare source + implementation together;
   write project-root design-qa.md with honest findings and iteration history.
6. Run relevant client/script tests, lint/typecheck/build; inspect protected diff.
7. Update this handoff and finish goal only when required checks are complete.

## Preview and evidence

Existing ignored harness: artifacts/collection-ui-audit-preview.mjs.
It serves real frontend modules with fictional GET fixtures, loopback binding,
envFile:false, no dotenv/backend/proxy, protected paths denied and all mutations405.
Started during baseline capture; record exact URL/session after startup.
Current preview: http://127.0.0.1:60624/collection/save?auditTheme=dark
(read-only synthetic, process10236, exec session82110; latest source, no HMR).
Old baseline preview57247/session6927 was stopped. Codex in-app tab1 points
to current preview; selected browseriabID2. Browser user zoom67% makes the high-level
viewport override inaccurate; use fresh CLI Chromium DPR1 for authoritative CSS
viewport captures. Do not alter the user's global browser zoom.

## Completed implementation and evidence so far

- Baseline captures and geometry: artifacts/collection-reference-20261015/
  baseline-{desktop,mobile}.png and -full.png, baseline-geometry.json.
- 91 protected shell/token/shared-UI file SHA256 pins saved in
  baseline-protected-shell-sha256.json; compare at completion.
- Actual behavior inventory completed. Required visual groups are seven;
  account-or-card is one group, nickname remains a separate prerequisite.
- Auto-match remains800ms, server-authoritative submit; no hook/API changes.
- Save page uses1480 module frame (only content), visible module header+full-name
  internal tab strip. All other Collection subpages keep compact navigation.
- Two equal-height form cards, semantic account/card grouping, unchanged fields
  and masking, adjacent batch/date, decorative RM prefix, scoped44px controls.
- Fullwidth receipt variant; default record-editor presentation unchanged. No drop
  behavior invented. Readiness is inside receipt section; actions remain real.
- New presentation-only completeness helper uses existing readiness errors;
  no validation/calculation changes, no identifiers in progresschips.
- Superuser nickname/contextcard restyled; loading/selection/reset semantics retained.

Executed checks (do not confuse with final full suite):
- Full TypeScript `tsc --noEmit`: PASS.
- Scoped ESLint on touched UI/helpers: PASS.
- Frontend Vite build with envFile:false and sanitized OS environment: PASS.
  Used existing ignored artifacts/account-management-integration-20261015/verify.mjs --build;
  its build.log is this run, not a fresh full npm build claim.
- New completeness unit tests5/5PASS. Initial sandbox tsx startup ENOMEM was
  an OS user-info sandbox failure; narrow local escalation rerun passed.
- Agent targeted unchanged form utility tests40PASS; receipt units18PASS;
  new receipt presentation tests5PASS +adjacent accessibility3PASS.
- git diff --check PASS so far.
- Test agent owns narrow presentation expectations, new responsive test spec
  and fresh static-built Playwright runs. Do not rebuild during those runs.

Pending: inspect actual captures/reference together; fix/recapture anyP0/P1/P2;
execute remaining tests/build contracts; only then mark goal complete.

## Later verification and visual iterations (supersedes the initial list above)

- Initial screenshot comparison found a third unused wide-screen grid track,
  missing receipt/footer separation and a constrained mobile sticky footer.
  Grid now caps at two equal tracks; receipt spans both and footer has20px gap.
- Full and focused source+actual comparisons opened and reviewed:
  `artifacts/collection-reference-20261015/rev2-compare-{full,form}.png`.
  Protected global topbar excluded from comparison. Existing neutral tokens,
  fonts, privacy copy, validation and accessible labels intentionally retained.
- A further actual390px capture exposed the sticky footer covering entry fields.
  Final revision3 makes the footer static at every width (the brief permits
  sticky only when it does not obscure content), with local mobile bottom
  clearance for the unchanged idle AI launcher. No action or shortcut removed.
  New synthetic browser tests check focused fields and all action hit-test corners
  at320x740,390x844 and740x360.
- Revision2: complete client2067/2067PASS; scoped Playwright87/87PASS plus
  Collection layout/roles13/13PASS. TypeScript, full client ESLint, presentation55,
  build gates, token/breakpoint/storage/entry-shell/bundle/hygiene/secret guardsPASS.
- Build gates use production ViteAPI `envFile:false`, then normal release manifest,
  server compilation and sourcemap checks, plus system-status/CSP checks. This is
  an equivalent sanitized build, not a literal dotenv-reading `npm run build`.
- All91 protected shell/token/shared-primitive files byte-identical: see
  `rev2-protected-shell.json`. No server/shared/schema/package/global-shell changes.
- Broader script suites: Node666PASS plus1existing opt-in skip; TypeScript63PASS.
  Report `nonbrowser-reference-final-1.md`. Scripts not modified by this goal.
- Snapshot review intentionally failed only Save light/dark (about5% each).
  Both old/new images opened, reviewed and updated by normal Playwright CLI.
  Guard confirmed ONLY `sumbangan-form-{light,dark}.png` changed; remaining6
  baseline images byte-identical. No threshold/tolerance/global assertion relaxed.
  `snapshot-reviewed-change-report.json`; update run2/2PASS.
- Final revision3 build, presentation55, browser types, app types and lint passed;
  remaining safety checks, final90+13 browser cases, no-update snapshots,
  complete client rerun, final captures and QA acceptance still being collected.
- Source preview restart: old62025/62624 stopped; final60624 above. Browser Codex
  tab2 previously verified nickname selection and actual new form. It must be
  navigated to60624 for final review; authoritative captures use fresh Chrome DPR1.
- Keep latest `design-qa.md` result blocked until post-revision3 comparisons and
  browser evidence finish. No commit/push/deploy performed or authorized.

## Resume

Read AGENTS.md, this file, git status/diff, current goal and Product Design skills.
Do not repeat completed steps or overwrite concurrent edits. Continue from the
latest evidence and check results recorded below. Keep production untouched.

## Final source, verification and file inventory

Final app source was built and checked in revision3; the only later code edit
is a test-fixture opt-in for rendering the actual idle AI launcher. Defaults and
all non-AI tests stay unchanged. No product code edit follows the final build.

Final evidence (all under `artifacts/collection-reference-20261015/`):

- `client-reference-final-summary.json`:2067/2067clientPASS,0skip/fail.
- `presentation-rev3.log` and `presentation-ai-on.log`:55/55PASS.
- `browser-types-ai-on.log`:PASS including final reference spec/helper types.
- `*-rev3.log`:app TypeScript/full client lint/build and all safety gatesPASS.
- `browser-final-green.log`:fresh complete scoped browser slice90/90PASS,
  two isolated workers, no retries/skips. It includes all11reference cases.
  Report `browser-final-green-report/index.html` /resultsJSON.
- `reference-browser-ai-on.log`:11/11PASS after correcting disabled-AI fixture.
- `layout-rev3.log`:13/13PASS. Fresh `layout-final-green.log`:13/13PASS,
  combined runner final exit0 confirmed. Together90+13+2=105relevant browser
  cases passed, zero unexpected/flaky/skipped in final reports.
- `snapshots-final.log`:2/2PASS in no-update mode after reviewed update.
- `snapshot-reviewed-change-report.json`:only two Save PNGs changed; six other
  original snapshots byte-identical. Tolerances are untouched.
- `final-protected-shell.json`:all91approved shell/shared primitive files
  byte-identical; no server/shared/schema/package/global CSS/brand changes.
- Earlier complete unchanged script suites:729PASS plus1existing opt-in skip;
  `nonbrowser-reference-final-1.md` links exact Node/TS logs and summaries.
- Final screenshots: `final-{dark,light}-{1440,390}*.png`, plus dark1024/768/1600;
  `final-geometry.json`. Reference combined comparisons opened and reviewed:
  `final-compare-full.png`, `final-compare-form.png`,
  `final-compare-receipt-actions.png`. See `design-qa.md` for exact crop/density.
- AI-clearance screenshots `browser-ai-on-results/collection-reference-layou-*/`
  show buttons fully reachable above actual idle AI at320/390/740 widths.

Tracked source changes (paths relative to repository root):

- `client/src/pages/CollectionReport.{tsx,css}`:1480content frame, Save module
  heading/shortcut/full labels only; no global shell or other-route nav redesign.
- `client/src/pages/collection/SaveCollectionPage.{tsx,css}`:cards/account group,
  currency prefix/fullwidth receipt/review/static safe footer; original handlers.
- `SaveCollectionFormSection.tsx`:existing section gains optional real icons.
- `SuperuserSaveCollectionPage.{tsx,css}`:nickname controls/context, original state.
- `SaveCollectionReadySummary.tsx` and `save-collection-completeness.ts`:dynamic
  grouped progress over existing readiness errors, not new validation/save rules.
- `CollectionReceiptPanel.tsx`:optional workspace presentation; default editor
  variant and all multi-receipt callbacks/preview/removal/metadata unchanged.
- Tests:collection `save-collection-{a11y-contract,presentation,completeness}`,
  `collection-receipt-presentation`; visual `collection-reference-layout`,
  `collection-auto-matching`, `app.visual`; helper`save-collection-fixture`.
- Only `tests/visual/__snapshots__/app.visual.spec.ts/sumbangan-form-{dark,light}.png`
  binary baselines regenerated using the normal Playwright snapshot mechanism.
- Documentation:this file and project-root`design-qa.md`.

Reproduction in this same checkout (ignored local verifier remains available):

1. `node artifacts/collection-reference-20261015/verify.mjs --checks --build --static --suffix=<fresh-label>`
2. `node artifacts/collection-reference-20261015/verify.mjs --browser --workers=2 --suffix=<fresh-label>`
3. `node artifacts/collection-reference-20261015/verify.mjs --snapshots --suffix=<fresh-label>`
4. `node artifacts/collection-reference-20261015/nonbrowser-regressions.mjs client <fresh-label>`

These use sanitized OS variables, nonexistent DOTENV_CONFIG_PATH, frontend
ViteAPI envFile:false and exact loopback synthetic fixtures; no production server
or database. Use an actual fresh lowercase-hyphen label; log creation is exclusive.
Normal repository commands/scripts are otherwise unchanged. Narrow local runner
escalation was required for tsx/esbuild Windows sandbox OS-info/file access.

Final preview remains60624, synthetic/read-only, session82110/process10236.
Codex browser tab2 is retained as deliverable; nicknameCollectorAlpha selected,
temporary viewport reset and old baseline tab closed. No user zoom changed.
No real customer data, credentials, production, database, email or AI touched.
No real-device virtual-keyboard or live PostgreSQL/backend run claimed.
No commit/push/deploy authorized or performed; wait for a separate human request.

Completion: all requested UI integration and required verification work finished.
Latest Collection Report section in`design-qa.md` has`final result: passed`.
No actionable P0/P1/P2 remains within this UI scope. Keep initial failure logs for
traceability; the final clean reports above supersede them. Optional P3 and test
environment limitations are explicitly documented. If continuing from another
account, inspect current git state and this final section; do not redo completed
work or infer authorization to commit, push, deploy or modify production.

## Follow-up: approved compact polish1–3 (2026-10-16)

After the completed reference integration, user requested further suggestions,
then explicitly approved Product Design to continue the recommended1–3 only:
single desktop shortcut hint, ClearPending in the receipt heading, and more
compact empty upload. Do not relocate matching status (suggestion4) without a
separate request. No new goal, commit, push, deploy or production work authorized.

Incremental changes over the previous completed source:

- `SaveCollectionFormSection.tsx`: optional actions slot, wrapping heading copy.
- `SaveCollectionPage.tsx`: existing ClearPending callback/disabled condition
  rendered in receipt heading; omit panel callback to avoid duplicate control.
  Add class to local shortcut guidance; keyboard shortcut remains unchanged.
- `CollectionReceiptPanel.tsx`: named empty workspace upload marker and horizontal
  icon/upload entry; generic optional clear/default editor paths retained.
- `SaveCollectionPage.css`: hide duplicate local hint at>=768, retain mobile;
  compact empty zone,44px buttons, safe heading wrapping and local3.5rem end
  clearance so the moved action is not under the unchanged fixed AI launcher.
- Test additions: receipt/save SSR presentation and actual reference-layout
  tests for one shortcut/action, compact bounds, keyboard clear, preserved
  identity/file input and five-point unobstructed button with AI enabled.

Fresh evidence in `artifacts/collection-reference-20261015/`:

- Static/build guards:`*-compact-polish-3.log`, all passed.
- Complete client:`client-compact-polish-final-summary.json`,2069passed/0failed.
- Focused SSR/source suite19passed (agent run, includes explicit .tsx tests).
- Final app browser slice:`browser-compact-final-green.log`,92passed/2mobile
  fixture-state assertion failures. App intentionally hides AI while input is
  focused; tests now focus the actual heading action before testing idle AI.
  Fixed focused suite:`reference-browser-compact-focus-fixed.log`,15/15passed.
  Therefore all79 non-reference+15reference behaviors pass on final app source;
  do not claim the broad exit1 was a single clean94-test run.
- `layout-compact-final-green.log`:13/13passed.
- Only reviewed Save light/dark baselines updated; six others unchanged:
  `compact-snapshot-reviewed-change-report.json`. Final no-update result is
  appended after completion below.
- All91 protected shell/token/shared files unchanged:
  `compact-final-guard-protected-shell.json`.
- Actual desktop/mobile/light/dark captures:`compact-fixed-*`, full/focused
  combined comparisons:`compact-fixed-compare-*`; exact snapshot comparisons:
  `compact-snapshot-compare-*`. Main opened and reviewed them together.
- QA initial P2 AI overlap fixed, rebuilt and recaptured; latest section in
  `design-qa.md` records accepted five-surface review and remaining limits.

Current source preview supersedes60624: `http://127.0.0.1:64521/collection/save?auditTheme=dark`,
read-only synthetic data, process4808, exec session62297, Codex browser tab3 kept
as deliverable. No user zoom/temporary viewport changes. Earlier interim preview
process11212 was stopped after exact command-line check; no data files deleted.
All real customer data, credentials, .env and production remain untouched.

Completion: final no-update snapshot run2/2passed (`snapshots-compact-snap-final.log`),
runner exit0. Follow-up polish complete; latest QA `final result: passed`.
No commit/push/deploy performed. Preserve all prior uncommitted integration work.
