# Password reset / creation visual UX V2 handoff

Status: local implementation and verification COMPLETE on 2026-09-14. The user subsequently authorized commit and push. Deployment still requires a separate request.

Verification base: `main`, `5a148289b6a5522d28c07190017407ae1289af7b`. The worktree was clean before this task. The 22 V2 files below form the authorized commit scope.

## WHY PREVIOUS IMPLEMENTATION WAS INCOMPLETE

Actual public routes `/reset-password` and `/activate-account` mount `ResetPassword.tsx` and `ActivateAccount.tsx` through `App.tsx`. `main.tsx` loads the public CSS entry, not the lazy authenticated stylesheet. The public Tailwind content allowlist omitted shared password components. Consequently required component layout, state, and meter utilities did not reliably ship. The old browser fixture eagerly loaded authenticated CSS and concealed this omission.

The previous built app reproduced a too-small visibility target on the real reset route at 320px. Baseline evidence is under ignored `artifacts/password-public-build-baseline/`.

A second rendered-only issue was found and fixed: the shared dark form stylesheet forces `border-color: var(--dm-input-border) !important`, which defeated ordinary success/error border declarations. Reset/activation now override that token on the individual validated input only. No global dark form behavior was changed.

## AUTHORITATIVE PASSWORD POLICY

`shared/password-policy.ts`: manually chosen passwords remain 14–256 JavaScript UTF-16 code units, with at least one `[a-z]`, `[A-Z]`, digit and character outside `[A-Za-z0-9]`. This preserves the existing whitespace/non-ASCII semantics. No trimming/normalization; confirmation is exact. The separate generated temporary 8-character policy is unchanged.

## Implementation

- Explicit public Tailwind coverage for shared auth components; bounded allowlist, no whole-app glob.
- Existing independent `PasswordInput` eye controls now receive their actual public layout CSS; masked initially, keyboard/caret behavior preserved.
- Checklist: neutral untouched, green/check met, red/x unmet after interaction, live count and accessible non-color text.
- Five visible strength segments: red/amber/green/deeper green; existing estimator remains distinct from policy acceptance.
- Reset/activation retain interaction after clearing; shared helper drives neutral/success/error input borders and `aria-invalid`.
- Enhanced confirmation is neutral empty, green matching, red mismatching, recomputed immediately when either value changes.
- Old fixture now loads authenticated CSS only for authenticated harnesses.
- New `test:auth:public-build` serves the real built public assets on loopback, mocks synthetic API only, and blocks unexpected/external requests. CI and release verification run it after building and retain screenshots.

## TESTS

- Focused `npx tsx --test` suite across `PasswordRequirementsChecklist.test.ts`, `PasswordInput.test.tsx`, `password-validation-feedback.test.ts`, `password-creation-feedback.test.ts` and `auth-password-ux-parity.test.ts`: 29/29 passed.
- Agent forms focused suite: 23/23 passed; typecheck and scoped lint passed.
- `npm run build`: passed; sourcemap gate passed. Final tested runtime build: `sqr-1.0.0-5a148289b6a5-20260913T230402Z` (dirty local source, not a deployment).
- `npm run verify:bundle-budgets`: passed (public CSS 13.7 KiB gzip / 14 KiB limit); no budget relaxed.
- `npm run verify:secrets` and `npm run verify:repo-hygiene`: passed.
- `npm test`: passed on the full serial rerun, exit 0; 4,243 passed / 0 failed / 2 existing skips across 4,245 tests. Durable log: `artifacts/password-v2-npm-test-serial.log`.
- First fresh built-browser run exposed an assertion race against the existing 160ms border transition. Runner now polls the final rendered color and waits for the request counter, without disabling animation or weakening color checks.
- Corrected fixture `npm run test:auth:browser`: passed all existing isolated UI contracts, including reset/activation, change, settings, Collection, token failures, login and 2FA.
- `npm run lint` and `npm run typecheck`: passed.
- Current compiled CSS + built-server/workflow focused contracts: 9/9 passed.
- First full `npm test` run stopped on the pre-existing CSRF constant-time microbenchmark (5-microsecond threshold) while browser suites were competing for CPU. The unchanged benchmark and all full-suite gates passed when rerun without parallel browsers. No threshold, auth code or security assertion was changed.
- `npm run test:auth:postgres`: 17/17 passed in a brand-new disposable PostgreSQL cluster, including token one-time redemption, expiry after lock wait, hash/session transaction rollback and stale-credential/2FA concurrency. The recovery suite skipped by default in `npm test` was thus exercised explicitly. The temporary cluster was stopped and its generated fixture directory removed; no application data was used.
- The other default skip is the optional live-Redis NAT test, which requires an explicitly isolated Redis URL. Rate-limit implementation was not changed in V2.
- New built-browser runner fixes: wait for CSS border transition, use a unique success-status locator, apply the existing dark theme class after the DOM exists, and capture from scroll-top so fixed skip links are not painted into full-page screenshots. The dark matrix explicitly exercises the existing theme class; it does not test automatic theme selection on deep links.
- `npm run test:auth:public-build`: passed all 24 actual-built reset/activation viewport/theme cases; zero accessibility violations, browser errors or unexpected requests. Geometry, live states, keyboard/caret/independent toggles, exact examples, counter, all strength levels, submission guards and duplicate prevention passed. Latest summary: `artifacts/password-public-build-browser/summary.json`.
- `git diff --check`: passed. Independent read-only review found no blocking correctness/security issues.

## FILES CHANGED

- `client/src/components/PasswordRequirementsChecklist.tsx`: three-state rows, count and semantic five-segment meter.
- `client/src/components/PasswordRequirementsChecklist.test.ts`: neutral/cleared/example states, meter levels and enhanced confirmation tests.
- `client/src/components/PasswordStrengthMeter.tsx`: optional interaction flag forwarded only for checklist variant.
- `client/src/components/PasswordConfirmationFeedback.tsx`: enhanced neutral/success/error states with check/x icons.
- `client/src/components/PublicAuthControls.css`: scoped reset/activation field borders, including the shared dark border token.
- `client/src/components/password-validation-feedback.test.ts`: activation SSR state and policy-independence coverage.
- `client/src/pages/ResetPassword.tsx`: persistent interaction, live field states and neutral empty confirmation blur.
- `client/src/pages/ActivateAccount.tsx`: equivalent activation state wiring.
- `client/src/pages/ActivateAccountParts.tsx`: render activation field/checklist state and accessible invalid attributes.
- `client/src/pages/password-creation-feedback.ts`: shared authoritative policy / exact-match visual-state helper.
- `client/src/pages/password-creation-feedback.test.ts`: helper interaction, boundary, mismatch and server-error tests.
- `tailwind.public.config.cjs`: explicit shared public auth component coverage.
- `scripts/tests/tailwind-public-config.test.mjs`: actual CSS compilation, dark colors/tokens, sizing, hidden text and bounded-coverage regression checks.
- `scripts/fixtures/auth-feedback-ui.jsx`: remove authenticated CSS masking from public auth harnesses.
- `scripts/password-public-build-browser.mjs`: actual-built public-page visual, interaction and accessibility matrix.
- `scripts/lib/password-public-build-server.mjs`: read-only loopback static server with path/symlink/MIME restrictions.
- `scripts/tests/password-public-build-browser.test.mjs`: static-server isolation and CI/build-order tests.
- `package.json`: expose `test:auth:public-build` using existing dependencies.
- `.github/workflows/ci.yml`: run built-public verification after build and retain artifacts.
- `scripts/release-readiness-local.mjs`: run the same post-build gate for release readiness.
- `.github/workflows/release-verification.yml`: retain built-public screenshots/summary.
- This handoff: authorization, causes, implementation, evidence and resume instructions.

## SHOW/HIDE IMPLEMENTATION

Both fields use the existing independent `PasswordInput` state, masked initially and remasked on clearing/pending submission. Public CSS now positions the actual Lucide eye icon inside the right edge, reserves 7rem input padding, and gives a 48px-high target. Labels (`Lihat ...` / `Sembunyikan ...`), `aria-controls`, `aria-pressed`, pointer caret preservation and keyboard Enter/Space behavior were verified. `PasswordInput.tsx` itself needed no V2 change.

## LIVE REQUIREMENT UI

Every rule independently uses neutral/circle before interaction, green/check when met and red/x when missing after change/blur/submit. Clearing preserves evaluated status. Hidden status text remains available to screen readers without leaking into the visual layout. The counter tracks 0–5 exact policy requirements; the supplied 2/5, 4/5 and 5/5 examples pass unit and actual-built browser checks.

## STRENGTH METER

Five real segments reuse `evaluatePasswordStrength`; no dependency or policy changes. Empty is unfilled/neutral, weak levels red, medium amber, strong green and very strong deeper green (appropriate lighter tones in dark mode). Filled segment count and text labels update together. Even a heuristically very strong but too-short value retains red length/policy/input feedback and cannot submit.

## CONFIRMATION UI

Empty is neutral; exact matches are green/check and mismatches red/x, with matching field borders. Editing either field recomputes immediately. Confirmation agreement never makes an invalid new password acceptable. Known backend field errors retain precedence until edited; reset token and duplicate-request guards remain intact.

## MANUAL VISUAL VERIFICATION

Root opened the generated real-built screenshots using the image viewing tool, not just markup inspection:

- `reset-320-light-valid.png`: both eyes visibly inside inputs, all five green/check rows, full green meter, green matching confirmation and borders; keyboard focus ring remains visible.
- `reset-320-dark-partial.png`: both eyes visible, two green/check and three red/x rules, red weak meter, red mismatch and input states.
- `reset-320-light-strength-2.png`: three amber segments, `Sederhana`, mixed rule states and clear invalid-policy message.
- `activation-320-light-neutral.png`: both eyes visible, 0/5 neutral circles, unfilled meter and neutral empty confirmation.
- `reset-1280-dark-valid.png`: aligned desktop inputs, visible eyes, green requirements/confirmation and full meter.
- `activation-1280-light-partial.png`: desktop mixed green/red rules, meter and red confirmation, clean grouping.

No horizontal overflow, icon/text overlap or clipped controls was observed. Automated geometry and axe checks additionally cover 320/360/390/430/768/1280px, both routes and both themes, including short mobile viewports. Dark verification activates the application's existing `.dark` contract; automatic deep-link theme selection is outside this task.

## SECURITY

No backend/shared password-policy, reset-token expiry/one-time-use, hash, CSRF/session, rate-limit or unrelated 2FA/Collection/Billing implementation changed. Visibility is transient component state; no credential storage, plaintext logging or telemetry was introduced. The built-page runner uses synthetic credentials and mocked local HTTP, blocks external requests, and never starts the production backend or loads `.env`. Browser evidence is UI verification, not a real-user reset transaction or a new production security audit.

## REMAINING RISKS

No unresolved V2 implementation blocker was found in the completed checks. Local browser verification uses Chromium, not a physical device or Safari/Firefox. CI/release gates are wired; their GitHub results must be checked after push. Production will retain the previous UI until a separately authorized deployment.

## Handoff / next authorized action

Implementation and local verification are complete. The user authorized committing and pushing all 22 listed files; there are no backend/shared-policy or dependency-lock changes. Preserve unrelated work and do not deploy without separate authorization. Logs and screenshots are ignored local artifacts. On another session, read this file, `git status --short` and the local/remote branch SHAs to establish publication status; do not rerun completed work unless code/environment changed or a new verification request requires it.

COMPLETE
