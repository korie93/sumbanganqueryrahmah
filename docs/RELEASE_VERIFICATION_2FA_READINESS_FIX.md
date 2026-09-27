# Release Verification: 2FA browser readiness

## Evidence (2026-09-27)

- Scheduled [run 36327133104](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/36327133104), commit `5f4e11fee022232889494f2192a94a54671aac8b`, passed the release-readiness command but failed **Verify built authenticator lifecycle on disposable PostgreSQL**.
- At 15:01:18 UTC, the browser test started its second Settings visit. It timed out 15 seconds later at `settings: security category`.
- Before that visit, independent QR decoding, enrollment, invalid-code rejection, light/dark layouts and the first 2FA login passed. The test verified an authenticated API response and an HttpOnly session cookie.
- The isolated server log contains no failed authentication, Settings request, rate-limit response or server error after this successful OTP verification. The earlier invalid-code and unauthenticated challenge responses are expected negative checks.
- Manual [run 36303724573](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/36303724573) passed on the same commit earlier that day. The unchanged test also passed locally on Windows; the historical failure has not been deterministically reproduced.

## Narrow correction

The browser harness previously treated a successful HTTP response/cookie as sufficient to immediately reload `/settings`. That does not establish that the login callback, lazy authenticated shell and single-tab initialization have completed. This is an observed synchronization gap consistent with the intermittent failure, not proof of the exact historical browser state.

`scripts/two-factor-browser.mjs` now waits for the real authenticated workspace to be visible and the Login input to disappear:

- after ordinary password login, but not while a 2FA challenge is pending;
- after the first OTP login and the rotated-secret OTP login;
- before and after navigating to Settings.

Settings navigation, authenticated restoration, category selection and the 2FA panel now have separate safe phase markers. Existing 15-second waits remain bounded. No retry, API mock, storage/cookie injection, security relaxation, application-code change or workflow-gate removal was added.

## Verification and handoff

- Five new readiness regression tests prove deferred navigation ordering, timeout propagation and integration at every successful login path. They do not simulate the exact historical GitHub failure.
- The three focused 2FA test files: **13 passed**.
- `npm run test:scripts`: **536 passed, one existing optional Viewer baseline test skipped**, no failures, using a clean test environment without repository dotenv credentials.
- JavaScript syntax checks, secret scan, repository hygiene and `git diff --check` passed.
- Full post-change disposable PostgreSQL/browser verification: **passed, exit 0** on Windows/PostgreSQL 17. All eight UI states across eight widths in both themes passed, including independent QR decoding, real OTP login, Settings restoration, disable and re-enrollment. Evidence: `artifacts/release-36327133104-two-factor-fixed-1.log` and `artifacts/two-factor/run-IHNj9S/`. The fresh app/database stopped and their temporary directory was removed; existing application data was not used.
- An independent agent reviewed the test-only change and its regression tests without finding an issue. The complete Linux GitHub workflow has not been rerun for this patch.

No production connection, deployment, cleanup, commit, push or GitHub workflow rerun was performed for this correction. GitHub verification remains pending a subsequent authorized push/run. Existing application data, uploads and secrets are outside this task.
