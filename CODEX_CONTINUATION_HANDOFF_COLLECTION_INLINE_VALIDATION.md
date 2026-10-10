# Edit Collection inline validation — continuation handoff

Updated: 2026-10-10 (Asia/Singapore)

## Authorized scope

User approved inline field errors in Edit Collection and explicitly requested a completion goal plus cross-account continuation. Start: clean `main` at `d657c3e2` (previous unsaved guard already committed/pushed). Do not repeat that work.

Preserve existing validation rules/messages/order, backend permissions and save/version/idempotency behavior. After invalid Save, show errors under fields, identify them with text/border/ARIA and focus/scroll first invalid field. No early errors before Save; corrected errors clear without focus stealing. Continue editing preserves state; discard/reopen resets. Keep API/network errors as generic feedback rather than guessing fields.

On 2026-10-10, the user explicitly authorized commit and push of this completed work. Deployment and production access remain unauthorized, as do backend/database/dependency changes, new validation restrictions, autosave and browser-persisted drafts. Do not read `.env` or transfer credentials.

## Implementation in working tree

- `collection-record-edit-utils.ts`: exported typed field errors; shared structured checks preserve previous first-message helper and generic missing-record order.
- `useCollectionRecordEditSaveAction.ts`: failed Save counter enables derived live field errors; lifecycle reset reuses mutation-intent reset; suppress duplicate local-field toast, retain generic/API errors and unchanged/in-flight guards.
- `useCollectionRecordEdit.ts`: forwards errors/attempt to dialog.
- `EditCollectionRecordDialog.tsx`: eight control/error pairs, scoped first-invalid focus on new invalid attempts, existing scroll body/footer/unsaved dialog retained. Uses existing date-picker ARIA support and local color utilities, no shared primitive changes. The invalid-only `--dm-input-border` token override ensures dark form rules cannot hide invalid borders.
- `CollectionRecordDiscardDialog.tsx`: regression hardening for a rapidly reopened modal; local key handler consumes only otherwise-unhandled Escape and safely continues editing (saving blocks closing). Already-handled Escape and other keys unchanged; never invokes discard. One added unit matrix covers both saving states/default prevention/other keys.
- `tests/edit-collection-dialog-layout.test.ts`: pristine/corrected and all eight error associations plus existing layout/action contracts.
- `tests/collection-record-edit-utils.test.ts`, `tests/collection-record-edit-save-guard.test.ts`: rule parity and state/source guard checks.
- `tests/visual/collection-polish.spec.ts`: 11 new `Collection inline validation` cases; previous 49 cases retained, with extra assertions that API errors stay generic. Synthetic record overrides cover unmatched account/future date scenarios. Required phone remains required; matched-card exemption remains for account number only.
- This handoff.

## Status — COMPLETE locally, verified

Implementation, final review and verification are complete; the implementation goal is marked complete. This delivery comprises ten changed/new files including this handoff. Commit/push to `origin/main` is authorized; inspect Git history and remote state for the final delivery commit. No backend/data/permission/dependency changes, production access or deployment.

### Final verification

- `npm run typecheck` and `npm run lint:client`: PASS on final source (29460 exit 0).
- `npm run test:client`: **1,874 PASS** (1,153 + 721), zero failures/skips/cancellations (29460 exit 0).
- Focused dialog/layout/Escape tests: **10 PASS**; utility/save/close-policy tests: **22 PASS**, included in full client run.
- `node scripts/run-client-build.mjs`: PASS (4,479 modules, 81738 exit 0). Existing nonfatal PostCSS `from` warning remains.
- `npm run test:visual:built -- --grep 'Collection polish|Collection return|Collection edit|Collection unsaved|Collection inline validation' --workers=1`: **60 PASS**, 6.4 minutes (72431 exit 0). Includes all 49 existing Collection cases and 11 new inline-validation cases. Synthetic fixtures/static loopback only; no backend/database access.
- Six targeted Escape/saving/repeated-modal browser cases PASS before full run (81738 exit 0).
- 15 Collection table/visual snapshot/isolated browser-runner script contracts PASS.
- Repository hygiene, secret scan, new-handoff secret guard and `git diff --check`: PASS (CRLF notices only).
- Final screenshots inspected in desktop/mobile light/dark, 320x844 and 740x360, including focused Amount and long Account Number error. Text/borders fit, first error visible, footer reachable. Final screenshot hashes match inspected images except one dark-mobile image re-inspected from the final report. Ignored report/screenshots live under `artifacts/playwright-report/`; subsequent runs replace them.

### Resolved findings during verification

- Initial synthetic fixtures used invalid empty `cardNumberLast4` and impossible batch enum; corrected to contract-valid null/card absence and actual allowed batch selection. Invalid-batch branch remains unit/layout-covered; no API contract was weakened.
- Calendar test used button role, while observed calendar uses gridcell; corrected test selector, retaining real UI date selection and payload assertion.
- Dark global input border overrode invalid borders; invalid-only local token override fixed it. Browser tests assert computed border color matches error text in both themes.
- First full browser run exposed two mobile reopened-confirmation Escape failures. Diagnostic reruns indicated timing sensitivity; Radix document Escape/layer registration uses effects. Local fallback handles otherwise-unconsumed Escape only, retains saving guard and never discards. Added unit matrix, removed diagnostic instrumentation; targeted six and final full 60-case browser runs pass without sleeps/assertion weakening.

### Completion audit

1. Exact validation rules, first-error order, generic missing-record behavior and nickname/card exemptions: utility matrix, legacy helper parity and browser phone/account/date scenarios PASS.
2. No early errors; inline text/borders/ARIA after invalid Save; no API mutation for invalid drafts: component tests plus 11 browser cases PASS.
3. Every invalid Save focuses first invalid field; corrections clear errors without focus movement; date/select behavior preserved: browser correction/repeated-Save/date assertions and all eight control associations PASS.
4. Continue retains draft/resits/errors; discard/reopen clears; saving, success/failure/conflict, version/idempotency, receipt removal and nested overlay behavior preserved: full 60-case browser suite PASS.
5. Responsive light/dark layout and visible errors/actions: screenshots inspected and bounds/color assertions PASS.
6. Durable handoff provided; no storage/autosave/deps/backend/database/deployment changes: final diff/status reviewed. Subsequent commit/push is explicitly authorized.

Root completed final production diff review; no actionable issue remains. Agents supplied implementation/test work before reaching their usage limit; no unfinished review is required. All verification processes are terminal. Default Windows sandbox can fail Node user-info lookup with ENOMEM; approved scoped escalation worked. Never bypass an approval rejection.

## Next step

The implementation goal is complete. Package the ten scoped files, run staged checks, commit and push to `origin/main`, then verify the remote commit and working tree. Deployment requires a separate explicit request. Do not redo passing implementation/tests merely because this note is read from another account.

## Cross-account continuation

Open this same project, read this note and `AGENTS.md`, inspect `git status`, recent history and remote state before resuming delivery. Preserve unrelated uncommitted files. Goal/session state does not automatically transfer files or credentials between accounts; this repository note is the durable handoff. Existing test process IDs may no longer be valid after switching/restarting; check before repeating work. Use `apply_patch` for edits and scoped test execution. Current authorization covers commit/push of this completed scope only; deployment needs a new explicit request.
