# CI authentication feedback autofocus correction

## Failed run

[CI run 36330887721](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/36330887721), commit `c788c94692e1d4d66f7c238c940eb7ed66c0990f`:

- Build/tests and coverage passed; CodeQL also passed in its separate workflow.
- `smoke-ui` failed at **Verify password and authenticator browser feedback**, which runs `scripts/auth-feedback-browser.mjs`.
- This occurs before the built-application 2FA lifecycle check corrected in the preceding commit. That change is retained; this run did not reach it.
- The final PASS was token-link rejection feedback at 15:55:48 UTC on 2026-09-27. Failure followed about 1.3 seconds later during the Login OTP block, not after a locator timeout.
- The digest-verified, masked failure screenshot shows a restarted OTP challenge with the normal enter-code notice; the input has received focus by screenshot time. Raw assertion details were deliberately suppressed, so the historical assertion line is not directly available.

## Diagnosis and bounded fix

`Login.tsx` schedules OTP autofocus in a React effect using `requestAnimationFrame`. The harness waited for the input to become visible, then made an immediate `document.activeElement` assertion. Visibility does not establish that the scheduled callback has run. Guided setup had the same immediate assertion against effect-based autofocus.

The two assertions now use awaited Playwright `toBeFocused` checks with a five-second bound. They observe actual application focus; they do not call `focus`, add fixed sleeps, retry authentication requests or swallow failures. All invalid/replayed-code, expired/invalid-challenge, empty-code, request-count and unauthenticated-state checks remain intact.

Fixed phase labels and allowlisted error categories now identify the relevant substep without logging raw Playwright errors, OTPs, passwords, tokens or enrollment material. Failure screenshots remain masked. No application, backend, dependency, database or workflow changes are included.

## Verification

- Four source regression tests cover the awaited assertions, bounded timeouts, absence of forced focus, retained security checks and safe diagnostics.
- `npm run test:scripts`: **540 passed, one pre-existing optional Viewer baseline test skipped**, no failures. A clean test environment excludes repository dotenv credentials.
- Syntax, secret scan, repository hygiene and whitespace checks passed.
- The unchanged component-browser baseline passed locally, consistent with an intermittent scheduling race.
- An isolated diagnostic against the actual Login component reproduced visible-before-focused ordering at **1280px and 390px** by holding its scheduled animation-frame callback. The old immediate check returned false; the bounded assertion correctly failed while focus was absent and passed after releasing the application's own callback. No manual focus injection, external requests or page errors occurred. This demonstrates the scheduling defect; it does not recover the suppressed historical assertion line. Reproduction source: `artifacts/ci-36330887721-autofocus-repro.mjs` (local ignored diagnostic).
- Post-change complete component-browser suite: **all isolated UI contracts passed**, including invalid/replayed OTP, expired/invalid challenge restart and autofocus, guided setup, delayed-response protections, six viewport widths, light/dark accessibility and expanded state captures. Evidence: `artifacts/ci-36330887721-auth-feedback-fixed.log` ends with the terminal `PASS all isolated UI contracts` marker. The deterministic diagnostic also passed both widths; sanitized output is in `artifacts/ci-36330887721-autofocus-repro.log`.

This is isolated real-component browser evidence with synthetic HTTP, not production/backend authentication verification. No production connection, deployment, commit, push or workflow rerun was performed in this task. GitHub confirmation remains pending a subsequently authorized push/run.
