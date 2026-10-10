# Simpan Collection safety and guidance — continuation handoff

Updated: 2026-10-10 (Asia/Singapore)

## Authorized scope and goal

User approved the four suggested frontend improvements and explicitly requested a completion goal plus durable cross-account continuation:

1. Confirm Reset Form only when there is form input or pending receipt work to discard; empty form needs no prompt.
2. Explain that browser-session draft restoration covers batch, payment date and amount, not customer identifiers or receipt files. Preserve current privacy/storage behavior.
3. Add accessible Betulkan navigation from invalid summary items to their editable fields.
4. Visibly mark existing required fields; Account/Card remain either-or, with no new validation restrictions.

Start: clean `main`, commit `350bd4b7`. Previous Edit Collection work is complete and pushed; do not repeat it.

Preserve backend, permissions, matching, validation rules, mutation payloads/version/idempotency, successful-save reset, masked card behavior and mobile keyboard handling. No dependencies, database changes or production access authorized. Commit and push were separately authorized by the user on 2026-10-10 after implementation completed; deployment was not requested.

## Status — COMPLETE

All four approved frontend improvements are implemented and verified locally. Root completed integration, final source review, browser checks and visual inspection after implementation agents reached usage limits. Goal has been marked complete; no required implementation work remains. This note accompanies the authorized commit/push: consult Git log/status and the remote branch for the resulting commit and delivery state. No deployment was performed.

Implementation:

- SaveCollectionPage.tsx: accurate draft scope/restore copy, six visible required markers (hidden from accessible names since aria-required already exists), Account/Card either-or unchanged, reset dialog and summary navigation wired.
- useSaveCollectionPageState.ts: separate guarded Reset request/confirmation from original success reset; synchronous pending/in-flight guards protect reset/submit races and Ctrl+S during confirmation; Cancel preserves mutation intent.
- SaveCollectionResetDialog.tsx and save-collection-reset-guard.ts: scoped AlertDialog, safe Cancel initial focus and opener restoration, populated/receipt/restored-work policy, submitting/suspended guard.
- SaveCollectionReadySummary.tsx and summary helper: stable field keys and optional Betulkan buttons only for invalid local editable fields, no external Staff target or receipt action.
- save-collection-field-navigation.ts: explicit field IDs, disabled/fieldset checks, focus + scroll without clicking/revealing card.
- Dedicated unit tests plus existing a11y/summary tests extended. tests/visual/save-collection-guidance.spec.ts: 12 synthetic browser cases. Existing app.visual.spec.ts Reset interaction now explicitly confirms. Two reviewed Save Collection light/dark baseline PNGs intentionally updated for the new guidance/required labels; no tolerance changes or unrelated baseline updates.

## Completion audit

- Reset safety: only entered/restored work prompts; Cancel/Escape/backdrop preserve values, receipts, matching feedback, draft and failed-save retry intent. Confirm clears once; empty Reset does not prompt. Focus starts on Cancel, remains inside after backdrop clicks and returns to Reset on close.
- Draft guidance: accurately names batch/date/amount and explicitly excludes customer identifiers and receipt files. Storage behavior is unchanged; reload privacy covered by browser assertions.
- Betulkan: invalid editable summary entries focus and scroll to their field; date picker stays closed and card stays masked. Controls respect pending submission/access suspension.
- Required fields: six existing mandatory fields are visibly marked. Account/Card remain either-or; no new validation restrictions.
- Invariants: backend, permissions, database, dependencies, source matching, mutation payloads, idempotency headers and original successful-save reset are unchanged. User/admin/superuser paths and existing manager visibility are covered by synthetic browser fixtures.

Final verification:

- Focused unit/render tests PASS: initial 29 tests, final-source reset/render six tests. Test-only Array.at target mismatch corrected to indexed access.
- Full `npm run test:client` PASS, session 90964 exit 0: **1,888 tests (1,153 + 735)**, no failures/skips/cancellations. Log: `artifacts/save-guidance-client-tests.log`.
- Typecheck and full client lint PASS after final frontend changes (56210 exit 0). Fresh frontend build PASS: 4,482 modules, log `artifacts/save-guidance-build.log`. Existing nonfatal PostCSS `from` warning remains.
- Ten visual snapshot/isolated runner script contract tests PASS.
- Final browser run **33/33 PASS**, session 61903 exit 0, WITHOUT snapshot updates. Command: `npm run test:visual:built -- --grep 'Save guidance|Collection layout polish|Billing receipt polish previews|authenticated key page baselines' --workers=1`. Log: `artifacts/save-guidance-browser-final.log`.
- Browser coverage: 12 new Save guidance scenarios; 13 existing layout/role scenarios (320–1920px, light/dark); six receipt preview scenarios; two authenticated baseline scenarios, including unchanged Dashboard/Settings snapshots.
- Screenshot-only test hardening then added explicit dialog opacity/viewport assertions and disabled screenshot animations. The four Reset scenarios passed again (20837 exit 0), log `artifacts/save-guidance-dialog-review.log`. Final mobile light/dark and desktop dark dialog screenshots inspected: complete readable copy, accessible focused Cancel, no clipping. Guidance at 390px and summary at 320px/740px also inspected.
- Only two intentional baseline PNG changes: `sumbangan-form-light.png` and `sumbangan-form-dark.png`, reviewed and verified by the final normal run. No snapshot tolerance changes.
- Final repository hygiene, tracked secret scan, explicit changed/untracked-file secret guard and `git diff --check` PASS (53211 exit 0). Git reports only benign LF-to-CRLF notices. Final source review confirms scope: nine modified files and seven new files, no backend/dependency/private configuration changes.

Verification notes: initial sandbox tsx failed before tests with Windows uv_os_get_passwd ENOMEM; approved scoped escalation resolved it. Synthetic auth fixtures were corrected to model an existing same-user session, preserving legitimate account-boundary draft cleanup. A genuine rapid-reopen/backdrop focus issue was fixed locally in the new Reset dialog, without changing shared modal components. Temporary diagnostics were removed.

Tests used a static loopback frontend build and synthetic requests/files, never a real backend/database or production data. These results do not claim a GitHub CI run or production verification. Commit/push are now authorized; deployment still requires a separate request.

## Cross-account continuation

Read AGENTS.md, this note, current Git diff/status and goal state. Preserve all task changes; the approved implementation is complete, so do not restart it. Do not read `.env`, export credentials, stage secrets or touch production data. Use apply_patch for any subsequent edits. Update this note when a separately authorized commit/push/deploy is performed.

This file is the portable work record when the same repository is accessible to another account; automatic transfer of chat, goal state or credentials is not assumed. Do not infer deployment authorization from the current commit/push request.
