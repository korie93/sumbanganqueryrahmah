# SQR 2FA correction — continuation handoff and implementation report

## Goal, authority and current status

Implement the smallest secure end-to-end correction to SQR authenticator 2FA and guided setup/login/disable/re-enable UX, with local security, NAT, rendered-browser and regression verification. Preserve existing password, Collection, Billing and role policies. This is the SAME goal for another account/session to resume.

The user explicitly approved **local implementation and verification only**. Commit, push and production deployment require separate instructions. The uploaded specification's automatic deployment paragraph does not override that approval. Do not reuse production credentials or SSH authority from older tasks.

Repository: C:\Users\Administrator\Desktop\SQR\sumbanganqueryrahmah.
Branch: main, tracking origin/main.
HEAD: 4231eff72b42985b3ed26ecfb78d535736be0139.
Initial worktree was clean. Current worktree has 37 task-owned changed/new files, none staged; no task commit, push, deployment or migration has occurred.

Final checkpoint: 2026-09-15 07:53 +08. **Approved local implementation and verification COMPLETE.** Guided 2FA, precise failures, safe state cleanup, NAT/abuse protection and actual rendered lifecycle are verified. A source-verified Ente Auth example answers which app to use without claiming physical-device certification. All final supplementary gates finished with exit 0; no task process remains running. The unrelated default full-suite performance timeout and green serialized rerun remain explicitly recorded below. Production completion is not claimed.

## Actual 2FA architecture and database/state audit

- Authenticator-app TOTP only. No email/SMS OTP, resend, recovery-code UI/storage or separate administrator factor-reset endpoint exists here. Conditional requirements do not authorize inventing these subsystems.
- Existing enrollment eligibility remains admin/superuser. Other roles receive no new permissions. An existing enabled factor cannot be bypassed through a role change or missing/corrupt secret.
- server/auth/two-factor.ts: six digits, 30-second period, unchanged +/-1-step clock window. New enrollments use SHA256; stored legacy SHA1 retains its exact algorithm. Dedicated encryption key and previous-key rotation remain unchanged.
- users.two_factor_enabled, two_factor_secret_encrypted and two_factor_configured_at store the lifecycle. Pending encrypted v3 metadata expires after ten minutes; confirmed encrypted v2 preserves the algorithm. A pending secret is never an enabled factor. Existing compare-and-swap storage prevents stale setup/enable/disable updates. No schema migration needed.
- Settings API client -> authenticated auth routes -> auth-account service -> auth-account-self-two-factor-operations.ts -> account repository. Setup requires current password, enable requires a valid pending-secret code, disable requires current password plus valid code.
- Password login for enabled accounts returns a signed, credential-bound, five-minute challenge. No final session/JWT until a valid second factor. Existing replay stores make codes/challenges single-use and fail closed as configured.
- Existing CSRF, HttpOnly cookies, SameSite/Path/Secure configuration, trusted-proxy policy and frontend credentials/include behavior are preserved. Local HTTP fixture uses its own non-Secure cookie explicitly; production policy is not changed or inferred from that fixture.

## Reproduced root causes and exact corrections

1. **Enrollment instructions lost algorithm interoperability.** The old page had no QR renderer and exposed a raw key/URI. SHA1-default manual entry cannot verify a SHA256 enrollment, demonstrated against the actual verifier before edits. This is a reproduced failure path, not proof of the user's particular phone app or production clock. New local QR preserves all server parameters; secondary manual entry states the exact algorithm/digits/period. No algorithm fallback, wider clock window or undocumented app compatibility promise.
2. **Frontend pending lifecycle was incomplete.** API expiry was discarded and reload retained pending status without usable setup material. The hook now expires/clears material, explains restart after reload, and reconciles status after stale/expired/conflicting requests. Password and key stay memory-only.
3. **Disable retained a stale date.** configuredAt: null was incorrectly replaced by the old date via nullish coalescing. Explicit null now clears the date.
4. **Management brute-force quota could rotate.** One authenticated synthetic account made eight successful requests despite a five/minute cap by rotating User-Agent. Fingerprint, mutable username, network and route aliases affected the old key. Only this limiter now uses trusted immutable account ID plus canonical action; missing trusted identity uses strict network fallback. Existing five/minute and aggregate abuse protection remain in force.
5. **Replay feedback was misleading.** A valid consumed login code was rejected with INVALID_CODE. It now uses existing TWO_FACTOR_CODE_REPLAYED so the UI correctly asks for the next code. Rejection was secure before and remains so.
6. **Delayed setup response race.** A newer authoritative enabled state could be overwritten by an older setup response, restoring stale QR material. Reproduced during implementation and fixed with abort/generation/account guards. Tests also cover account switch, unmount and duplicate submission.

## Frontend and UI/UX implementation

- OFF: clear status, explanation and one primary Activate action.
- Step 1: current-password proof, using existing password visibility component.
- Step 2: locally generated QR, adequate white quiet zone, expiry/restart help. Reveal/copy manual key is secondary. No external QR service, analytics payload, raw URI display or browser persistence of enrollment material.
- Step 3: labeled numeric six-digit entry with paste normalization, Enter submit, focus handling and associated errors. Enabled state appears only after success.
- ACTIVE: actual method/date, lost-device advice and explicit disable action. Disable expands password + OTP confirmation; re-enable starts fresh.
- Login: clear second step, current-code guidance, retry/back, clean restart for invalid/expired challenge. Password-reset/activation behavior is retained.
- Existing Tailwind/components, spacing, buttons and theme tokens; no unrelated redesign. Panel is a sibling of the account card to avoid excessive nesting. QR width was corrected after a real 320px raster decode failure.

## Files changed — every file and purpose

Paths are relative to the repository root.

| File | Purpose |
| --- | --- |
| client/src/lib/auth-flow-feedback.ts | Precise Malay errors; invalid/expired challenge restart helper. |
| client/src/lib/auth-flow-feedback.test.ts | Error and restart regression coverage. |
| client/src/pages/Login.tsx | Second-step context, instructions and OTP focus. |
| client/src/pages/LoginParts.tsx | Optional contextual two-factor login heading. |
| client/src/pages/useLoginSubmission.ts | Clear invalid as well as expired challenges. |
| client/src/pages/settings/TwoFactorSettingsPanel.tsx | Guided OFF/setup/ACTIVE, QR/manual, confirm and disable UI. |
| client/src/pages/settings/TwoFactorSettingsPanel.test.ts | Rendered state/security/semantic contracts. |
| client/src/pages/settings/MyAccountSecurityCard.tsx | Extract and integrate dedicated sibling 2FA panel. |
| client/src/pages/settings/MyAccountSecurityCard.test.ts | Scoped panel/password rendering expectations. |
| client/src/pages/settings/useSettingsMyAccountTwoFactorState.ts | Expiry, cancellation, races, reconciliation and safe clearing. |
| client/src/pages/settings/settings-my-account-utils.ts | Respect explicit null configured date. |
| client/src/pages/settings/settings-my-account-utils.test.ts | Null-date regression. |
| client/src/pages/settings/AccountSecuritySection.tsx | Propagate expiry, action error, configured date and cancel. |
| client/src/pages/settings/settings-controller-view-models.ts | Matching view-model types. |
| client/src/pages/settings/useSettingsController.tsx | Matching controller bindings. |
| client/src/pages/settings/useSettingsMyAccount.ts | Matching account-hook bindings. |
| client/src/pages/settings/useSettingsSecurityViewModel.ts | Matching security view-model bindings. |
| client/src/components/password-validation-feedback.test.ts | Preserve password component contracts after extraction. |
| server/middleware/rate-limit.ts | Stable trusted-account/canonical-action management limit only. |
| server/middleware/tests/rate-limit.test.ts | Assert new limiter key contract. |
| server/http/tests/auth-recovery-nat.test.ts | Direct aggregate 2FA challenge-flood regression. |
| server/http/tests/two-factor-management-nat.test.ts | 30-account NAT, quota rotation and Redis fail-closed tests. |
| server/services/auth-account-login-guard-utils.ts | Precise existing code-replayed error. |
| server/services/tests/auth-account.service.test.ts | Matching replay assertion. |
| server/services/tests/auth-account-two-factor-retry.test.ts | Used code rejected; next valid step succeeds. |
| server/routes/tests/auth-two-factor-http.test.ts | Actual routes/guards/CSRF/session tests; storage double explicit. |
| scripts/auth-feedback-browser.mjs | Real React/mocked HTTP lifecycle, errors and races; masked failures. |
| scripts/fixtures/auth-feedback-ui.jsx | Stable synthetic account/status and delayed-response scenarios. |
| scripts/two-factor-browser.mjs | Built UI/backend E2E, independent QR/TOTP, layout/a11y/keyboard checks. |
| scripts/test-two-factor-isolated.mjs | Disposable app + fresh PostgreSQL; safe env/process/cleanup boundaries. |
| scripts/tests/two-factor-browser-authenticator.test.mjs | Independent RFC6238 verifier vectors/parameter rejection. |
| scripts/tests/two-factor-isolated-runner.test.mjs | Isolation, real-build and cleanup safety contracts. |
| package.json | Pinned QR dependency, test-only decoder, actual-browser script. |
| package-lock.json | Matching exact dependency lock. |
| .github/workflows/ci.yml | Disposable built 2FA check after build; masked artifacts. |
| .github/workflows/release-verification.yml | Same gate before release packaging. |
| CODEX_CONTINUATION_HANDOFF_2FA_PERMANENT_FIX.md | Current implementation/evidence/continuation report. |

Dependencies: runtime qrcode.react@4.2.0 (no runtime transitive dependencies), dev-only jsqr@1.4.0. QR is generated in browser memory from the server URI.

### App guidance source check

An example is preferable to asking a non-technical user to choose by hash algorithm alone. Ente Auth's official source reads the otpauth algorithm/digits/period and forwards SHA256 to its TOTP generator: [URI parsing](https://github.com/ente-io/ente/blob/main/mobile/apps/auth/lib/models/code.dart), [TOTP generation](https://github.com/ente-io/ente/blob/main/mobile/apps/auth/lib/utils/totp_util.dart). Its [official product page](https://ente.com/auth/) describes mobile availability. These primary sources support suggesting Ente Auth as an example, not claiming a physical-device test, universal app compatibility or verified behavior of the user's unknown app. No app installation, external request or added dependency is required by the SQR UI.

## Security review and evidence boundaries

Tests cover no session before OTP, wrong/expired/used/credential-changed challenge, challenge-as-session rejection, client identity rejection, CSRF, setup expiry, corrupted/missing secrets, stale CAS, enable-before-verify prevention, disable proof, fresh enrollment and next-code retry. Thirty server-authenticated synthetic accounts share one NAT with strict adaptive and CSRF middleware; one account cannot rotate its budget using aliases/headers/network/username/body. Separate challenge and aggregate flood tests retain abuse protection.

The new E2E runner uses no production secret, account or upload. It whitelists OS environment variables, creates a fresh loopback PostgreSQL cluster and working directory, checks actual data_directory, generates credentials in memory and stops only its own processes before validated narrow cleanup. No broad deletion. Persisted screenshots mask all inputs and QR. QR raster exists only in memory for independent decoding. Raw browser errors are suppressed because they can include entered credentials. Existing structured app logging/response sanitization remain.

## Tests and current results

- Baseline before edits: backend 45/45, frontend 14/14, NAT/CSRF/proxy 38/38.
- Expanded focused backend 107/107; settings/ARIA 33/33; management/NAT 51/51, later focused 40/40.
- npm run test:auth:postgres: 17/17 PASS, observed exit 0; actual isolated PostgreSQL transaction/recovery checks and cleanup. Log: artifacts/two-factor-postgres-regression.log.
- Final npm run test:client: 1,579/1,579 PASS, observed exit 0. Log: artifacts/two-factor-final-ui-test-client.log.
- Final npm run typecheck and npm run lint: PASS, observed exit 0. Logs: artifacts/two-factor-final-ui-typecheck.log, artifacts/two-factor-final-ui-lint.log.
- Final npm run build: PASS, including CSP and production sourcemap gates. Built manifest: sqr-1.0.0-4231eff72b42-20260914T234732Z, sourceDirty true. Local identifier, not a deployed release.
- Initial full npm test: 4,267 passed / 2 existing skips, observed exit 0 (artifacts/two-factor-full-test.log). Existing 100,000-account OSP fixture took 118.362 seconds, near its 120-second cap.
- **Latest full npm test is NOT green:** the same unchanged OSP performance test timed out at 120 seconds, including a sequential overall rerun (artifacts/two-factor-tests-final.log). No Billing fix or timeout relaxation was made. Read-only esbuild dependency audit found 74 loaded source files, **zero task-changed sources**; related repository/bootstrap/database/migration paths also have no diff.
- **Serialized repository rerun PASS:** npx tsx --test --test-concurrency=1 server/repositories/tests/*.test.ts — 370 passed / 1 existing skip, observed exit 0. The same OSP test passed in 103.300 seconds with its original cap. Log: artifacts/two-factor-repositories-serial-final.log. This verifies the suite under lower test-file concurrency; it does not retroactively make the default full run green.
- Final npm run test:auth:two-factor-browser: PASS against the latest actual built server + PostgreSQL, no API mocks; all 96 layout/a11y cases and reduced-height focused-input probes pass. Log: artifacts/two-factor-final-ui-test-auth-two-factor-browser.log; screenshots/server log: artifacts/two-factor/run-j9OjLI. Both processes stopped and its temporary fixture was removed.
- Final npm run test:auth:browser: complete mocked-HTTP browser PASS including reset/activation matrix, new races and safe failure diagnostics. Log: artifacts/two-factor-final-ui-test-auth-browser.log.
- Final npm run test:routes 478/478, test:ws 106/106, test:intelligence 12/12 and test:scripts 431/431 PASS. These complete the downstream suites that the default full run did not reach after its performance cancellation. Logs: artifacts/two-factor-closeout-test-*.log.
- Final npm run verify:bundle-budgets, npm run verify:secrets and git diff --check: PASS, observed exit 0. Dependency install audit earlier reported zero vulnerabilities. No timeout, test assertion or security policy was relaxed to manufacture a green result.

Closeout session 13170 finished with observed exit 0: actual 2FA browser (run-RLSU84, including short viewports), full mocked browser, routes 478/478, WebSocket 106/106, intelligence 12/12, script tests, secret scan, bundle budget and diff check. Logs: artifacts/two-factor-closeout-<script-with-hyphens>.log. The short-viewport probe initially hit the password visibility button intentionally inside the input; screenshot confirmed the input itself was visible/focused. The corrected probe tests its editable text area, without changing product styling or hiding real overlap.

Final UI session 8939 also completed with observed exit 0: client tests, typecheck, lint, build, actual 2FA browser, mocked browser, bundle budget, secret scan and diff check. Logs: artifacts/two-factor-final-ui-<script-with-hyphens>.log. All backend changes are unchanged from the green closeout runs. There is no live test session to resume.

## Actual rendered and manual visual verification

Actual built app: password login without 2FA -> Settings/Security -> OFF -> password proof -> local QR decoded independently -> manual reveal/copy -> wrong OTP rejected without enablement -> correct OTP enables -> normal logout -> fresh login challenge with no auth cookie/private access -> correct OTP establishes HttpOnly session -> disable with password/code and cleared status/date -> fresh secret -> re-enable -> successful fresh 2FA login.

Eight states (OFF, password, scan, manual, invalid-code, ACTIVE, login-challenge, disable) x 320/360/390/430/768/1280px x light/dark = **96 layout/a11y cases**. Actual QR decodes at each width/theme. No external requests or browser runtime errors. Enter submit and automatic password/code focus verified. Mocked browser adds invalid/expired challenge restart, automatic setup expiry, pending reload, cancellation and delayed account/unmount/enabled races.

Root visually inspected redacted OFF/mobile, manual/mobile, scan/320 light, ACTIVE/1280 light, login/390 dark and disable/390 dark screenshots. The final build's scan/390 light and password/320 light screenshots were also inspected after the app example wording change. Long element screenshots can include the existing sticky header/save bar at capture scroll position; QR decoding separately centers the real viewport and is not based on SVG source. Focused input hit-tests at 320x420 and 390x420 confirm editable fields remain reachable after focus/scroll with reduced visible height. This is Chromium viewport emulation, not physical phone/OS keyboard or vendor authenticator certification.

## Acceptance audit against uploaded checklist

| Items | Evidence/status |
| --- | --- |
| 1 | Reproduced local failures/corrections above; no speculative production-clock diagnosis. |
| 2-8 | Actual enrollment/login/wrong-code E2E plus crypto/lifecycle/HTTP expiry, no-bypass and normal-login regressions. |
| 9, 11, 12 | Not applicable: resend/email OTP/recovery codes do not exist. |
| 10 | Independently decoded viewport QR, exact URI/key comparison, independent RFC-tested TOTP accepted by backend. |
| 13-15 | Actual disable/re-enable, cleared state/date, backend CAS and race/expiry cleanup coverage. |
| 16-17 | 30-account NAT, account/challenge brute force, aggregate flood and configured-store failure checks. |
| 18-23 | Guided UI, 96 actual layout/a11y cases, focus/Enter and visual inspection; physical-device limits above. |
| 24-25 | Focused/client/scripts/routes/WS/intelligence/typecheck/lint/build and final browser/safety gates pass; unrelated default full-suite timeout and green serialized rerun recorded. |
| 26 | Actual built UI + PostgreSQL lifecycle and inspected screenshots; edge-time/race behavior separately covered. |
| 27 | 37 scoped files, all listed above; no Billing/Collection/role/schema changes. Final diff inspection/check pass. |
| 28 | This finalized handoff includes current source, full file inventory, evidence, limits, next actions and rollback. |
| 29 | Outside explicitly approved local scope; no commit/push/deploy or production verification authorized/performed. |

## Exact next actions

PowerShell: prepend C:\Program Files\nodejs to Path where needed. Do not start duplicate fixtures while a tool session/process is live.

1. No approved local implementation work remains. Re-check git status and HEAD before acting in a new session; preserve any subsequent user changes.
2. Await the user's separate commit/push instructions. If authorized later, inspect this exact 37-file scope, run the staged secret guard and commit/push non-destructively. Do not include .env, ignored browser artifacts or generated fixture data.
3. A new environment can reproduce with npm ci, npm run build, npm run test:auth:two-factor-browser and npm run test:auth:browser. Other exact gate commands/results are recorded above. Avoid concurrent heavyweight test runs on constrained machines.
4. If the user requests deployment later, establish fresh deployment authority/access and follow the existing release procedure. Investigate any real CI failure, including the default-concurrency OSP timing risk, before release. Do not treat this handoff as permission to deploy.

## Deployment, rollback and genuine remaining risks

Deployment: **not attempted or authorized for this task**. No deployed SHA, runtime release, production service health, Nginx/Redis topology, HTTPS response or server NTP status verified here. Future operator must confirm desired immutable SHA, deployment procedure and fresh access authority first. Do not issue guessed production mutation commands or copy old credentials.

Local reproduction: npm ci, npm run build, npm run test:auth:two-factor-browser. Windows PostgreSQL default: C:/Program Files/PostgreSQL/17/bin. Linux CI supplies SQR_AUTH_TEST_PG_BIN via pg_config --bindir. No database migration for this fix. CI workflow edits have not been pushed or executed on GitHub.

No production rollback needed because production was untouched. Local rollback must selectively revert only task-owned hunks/new files and matching dependency lock, never reset the whole worktree. A future release should use the existing rollback procedure to a verified preceding immutable release, retaining data and encryption keys.

Remaining risks: default-concurrency OSP performance gate timeout (serialized rerun green); physical phone app/keyboard compatibility not certified; production clock/proxy/distributed-store verification requires separate deployment authority. No claim of bug-free production or universal authenticator compatibility.

Temporary artifact note: an earlier failed cleanup left C:\Users\Administrator\AppData\Local\Temp\2\sqr-two-factor-ezJWTK. Read-only checks on 2026-09-15 confirm it is a normal task-created directory, no matching fixture processes and no PostgreSQL postmaster.pid. Narrow cleanup was rejected by the environment's policy; no alternate deletion was attempted. It contains only disposable synthetic fixture data, not existing application uploads/data. Current successful runners clean their own fixtures normally. Retaining this stopped fixture does not affect the application; an operator can review its removal separately.
