# Password, activation, Collection and 2FA verification report

Date: 13 September 2026. Base commit: `6dd58b4ff16c45c21eb7ca21da1c5518f07867a6`.

Status: COMPLETE for the approved repository implementation and local verification. User subsequently authorized commit and push on 13 September 2026. No deployment or production data changes performed.

## Scope and diagnosed causes

The approved work covers generated temporary credentials, manual-password consistency, recovery/activation/Collection feedback, email instructions, authenticator enrollment/login and abuse protection for shared office IPs. Billing OSP, receipts, imports, exports and business records are not changed.

Repository inspection and regression tests identified:

- The old temporary-password generator produced at least 16 characters. Collection resets reused a process-wide configured credential.
- Password hints/strength feedback disagreed with the existing 14-character manual policy. Matching confirmation did not mean the password was valid.
- Recovery consumed a token separately from password persistence. A failed write could burn the link; concurrent resends could leave multiple usable links.
- Delayed reset-email completion could overwrite a password already set through that link. An in-flight self-password change could also overwrite a newer reset.
- Enabled 2FA could be overwritten during setup, enabled accounts with a missing secret could fail open, pending setup lacked expiry and stale setup writes were not conditional. Login challenges needed single-use and credential-state binding, including at final session insertion.
- Manual authenticator setup could use SHA1 while the issued URI specified SHA256. The UI now makes the issued algorithm, digits, period and phone-clock requirements explicit; it does not accept alternate algorithms as a workaround.
- Shared anonymous IP quotas could penalize independent recovery/2FA users behind one NAT.
- Atomic database session revocation initially hid activity IDs from later cleanup queries. The final implementation returns these IDs so reset routes can close WebSockets and clear associated Collection sessions.

## Requirement-to-evidence audit

These rows group the approved requirements. They do not replace the password policy or claim that every possible defect has been eliminated.

| Requirement | Implementation and verification |
| --- | --- |
| Exactly eight generated temporary characters | Shared length constant; crypto.randomInt selection and secure shuffle; required letter, digit and symbol (also both cases). Generator tests check length, classes and repeated generation. |
| Keep manual passwords stronger | Existing 14–256 characters, uppercase/lowercase/digit/symbol retained. Shared assessment drives backend and frontend. Eight-character temporary credentials do not qualify as chosen passwords. |
| No reusable reset credential | Collection generates a fresh credential per reset, stores its hash and forces change. Legacy COLLECTION_NICKNAME_TEMP_PASSWORD is accepted but ignored; .env.example documents removal. |
| Accurate password and confirmation feedback | Separate validity and match feedback in reset, activation, change-password, Collection and settings. Matching an invalid password is not shown as valid. Browser tests assert invalid submissions are blocked. |
| Actionable recovery errors | Specific rule/mismatch errors; safe invalid/expired/used/superseded/already-activated messages and restart/newest-link instructions. Service, route and UI tests cover these states. |
| Activation, resend and reset emails | Templates import actual policy and explain confirmation, expiry, one-use/newest-link behavior and next action. Resent activation has distinct copy. Tests cover text and HTML. |
| Atomic token consumption and persistence | User-row-locked transactions consume the matching valid token, update credentials, invalidate siblings and revoke sessions together. Real PostgreSQL tests exercise rollback, replay, concurrent consumption, resend and expiry while waiting for locks. |
| Delayed delivery and stale-password safety | Preparation requires the still-current token and expected password hash. Self-password writes use the hash actually verified; stale writes return 409 before success audit/session cleanup. PostgreSQL and service tests cover both races. |
| Collection access remains restricted | Superuser-only reset enforcement, existing nickname/account checks, current-password proof, forced change and conditional writes remain server-side. Collection service/repository/route tests cover unauthorized and stale operations. |
| Verified 2FA enrollment | Expiring pending encrypted setup; active enrollment cannot be silently replaced; confirmation and disable use conditional state updates. Pending state is not a completed factor. |
| Correct authenticator verification | Independent RFC-vector checks cover SHA1/SHA256 and bounded clock windows. URI parameters are explicit; no alternate-algorithm fallback, bypass flag or hardcoded OTP. |
| No session before valid second factor | Signed expiring, single-use challenges bind credential state. Missing/malformed secrets fail closed. Final activity insertion rechecks proof under the user lock. PostgreSQL/route/service tests cover stale and replayed proof. |
| Replay and infrastructure failures | Live replay entries are not evicted to admit new ones. Redis consumption is atomic; configured Redis/identity lookup failures fail closed. Dedicated tests cover failures and saturation. |
| Shared-NAT-safe abuse controls | Aggregate trusted-IP admission precedes identity lookup; verified account buckets retain strict per-account caps. Invalid/unmatched recovery tokens and invalid 2FA challenges share a strict network fallback. Password-reset requests retain normalized-identifier quotas plus the aggregate cap. Tests cover 30 staff identities, rotated hints, aliases, expiry and floods. CSRF remains enabled. |
| Sensitive data and session cleanup | Expected-error logs contain codes/status, not credentials/tokens/OTP. Revoked IDs stay internal for socket/Collection cleanup and are not exposed in public JSON. Route and PostgreSQL tests assert cleanup and response shape. |
| Usable and accessible frontend | Chromium contracts use production components/hooks at 390px/1280px: labels, descriptions, keyboard, feedback, expiry/restart, no horizontal overflow or runtime errors. Existing Edge/ARIA conventions preserved. |
| Architecture and deployment scope | Existing services/repositories/storage contracts extended without new dependencies or migrations. Production configuration, database, files and Nginx untouched. |

No email OTP or recovery-code subsystem existed in the inspected implementation; no new parallel authentication mechanism was invented.

## Verification evidence

Completed local checks:

- `npm test`: final aggregate run passed after socket-ID/CAS refinements: 4,137 passed, zero failed, 62 optional infrastructure tests skipped. Covers client, scripts, contracts, auth, HTTP, services, repositories, routes, WebSocket and intelligence. Two subsequent bounded changes (per-socket transport-failure handling and the standard safe-JSON parser) are checked by the final impacted suite below.
- `npm run test:auth`: 144/144 passed in that aggregate run.
- `npm run test:auth:postgres`: final 17/17 passed, no skips, in a fresh disposable PostgreSQL 17 cluster. Includes revoked activity IDs and self-password CAS. Fixture stopped and removed safely; no application database used.
- `npm run test:auth:browser`: passed real Chromium feedback contracts with mocked HTTP, not live backend/SMTP E2E. Ignored screenshots: artifacts/auth-feedback-browser/.
- Recovery/managed-service/full auth-route rerun: 64/64 passed after socket-ID propagation. Self-credential plus existing account-service tests: 21/21 passed.
- NAT/limiter/full auth-route combination: 85/85 passed. Password/Collection/config: 145 passed, plus 14 Collection route/access tests. Final feedback/ARIA: 37/37 passed.
- `npm run test:security`: passed.
- `npm run test:coverage:gate`: passed, 321 tests; **86.92% lines / 73.59% branches for its configured file subset**, not whole-repository coverage.
- Final impacted crypto/2FA lifecycle/session/full auth-route suite after the last two changes: 72/72 passed, no skips. Includes per-socket failures that must not interrupt remaining cleanup.
- Final typecheck, lint and production build passed (root session 25324, exit 0). CSP hashes and production source-map gates passed; build transformed 4,419 modules and emitted zero source maps. Final secret scan, repository hygiene, explicit changed/untracked-file secret guard and diff whitespace checks passed.
- Server/client JSON parsing, server environment-access and client bundle-budget contracts passed. Pending 2FA payload parsing uses the existing safe-JSON helper without logging decrypted payloads.

CI and release-verification now run the dedicated PostgreSQL and browser commands. The PostgreSQL runner uses a private Unix socket directory and validates its owned temporary path before cleanup. The Unix-specific branch has been reviewed, but GitHub Linux execution is pending publication; no remote green check is claimed.

## Main changed areas

- Shared password policy, errors and API contracts: consistent rules, precise errors and setup metadata.
- Server auth: temporary generation, encrypted pending 2FA state, replay stores and cryptographic tests.
- Auth account services/repositories and storage wrappers: atomic recovery/issuance, delivery races, conditional credential/2FA writes, errors and session propagation.
- Activity repository/storage and auth routes: final credential-state checks, socket cleanup and compatible public responses.
- Collection nickname service/repository/storage/validation and runtime config: unique resets, conditional setup and obsolete shared-credential deprecation.
- Mail templates: policy-consistent instructions, no permanent password in email.
- Middleware/API protection/route registration: account-bound recovery/2FA limits with aggregate network protection.
- Password feedback components, reset/activation/change pages, Collection fields/hooks, login and settings: independent feedback, accessible errors, explicit authenticator setup/restart.
- Targeted tests, isolated browser/JSX and PostgreSQL scripts, package commands and CI workflows: reproducible checks. Dependency lockfile unchanged.

Existing unrelated NAT documentation edits and docs/SQR_POST_REBOOT_HOSTNAME_RECOVERY.md are preserved and excluded from this auth task.

## Operational notes and limits

- Existing confirmed authenticator secrets remain compatible. Unfinished legacy setup without authenticated expiry must restart; pre-change login challenges must restart login. No enrolled factor is silently disabled.
- No schema migration or new dependency. Keep existing encryption/session keys stable. The deprecated shared Collection variable no longer affects new resets; stored passwords are not bulk changed.
- Manual passwords remain at least 14 characters. Eight-character output is temporary and must be changed through the forced-change flow.
- These tests do not prove real production SMTP delivery, a particular phone's settings/clock, production reverse-proxy configuration, or unlimited traffic without 429 responses. The stated shared-IP simulation passes; abusive traffic remains limited.
- Publication was subsequently authorized by the user. Deployment and a post-deployment operational smoke test still require separate instruction. No claim is made that future CI runs or every unrelated application flow can never fail.
