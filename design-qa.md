# Forgot Password manual retry feedback — 2026-11-03

final result: passed

## Findings

No P0, P1, P2 or P3 findings remain within this accepted retry-feedback scope.
Paired screenshots and independent review show the intended label change without
layout, typography, artwork, error-message or reference drift.

## Implemented behavior

Recognized temporary Forgot Password failures change the existing submit label
to **Cuba hantar semula / Try sending again**. The identifier, visible error and
safe reference remain available until the user acts. Switching BM/EN updates the
label without submitting a request. Editing or starting another submission clears
the hint. Pending submission retains the existing disabled controls and sending
label; success retains generic account privacy and superuser approval guidance.

This is presentation feedback only. Retry is manual, using the existing handler.
The backend, API request/retry policy, approval flow and existing pending-request
lock are unchanged. Leaving the page still aborts the caller-owned request.

The classifier uses actual shared SQR error codes. Temporary HTTP 408, 500, 502,
503 and 504 can qualify; recognized application codes are INTERNAL_ERROR,
INTERNAL_FAILURE, DATABASE_DOWN, SERVICE_UNAVAILABLE and REQUEST_TIMEOUT.
Known native fetch/offline/timeout failures can also qualify. HTTP denials,
rate limits, validation/account codes, aborts, unrelated programming errors and
unknown application codes do not receive this hint. This predicate neither
schedules nor authorizes any request.

Files changed for this step:

- `client/src/pages/ForgotPassword.tsx`: localized presentation flag and resets.
- `client/src/pages/public-auth-runtime-utils.ts`: bounded conservative error classification.
- `client/src/pages/public-auth-runtime-utils.test.ts`: five new boundary tests;
  the existing three tests are retained.
- `client/src/locales/ms/auth.json` and `client/src/locales/en/auth.json`: retry labels.
- `tests/visual/public-auth-recovery-feedback.spec.ts`: five new real-controller
  browser cases and local fixture responses/cancellation tracking.
- `tests/visual/public-auth-recovery-resilience.spec.ts`: server-reference regression checks.

Earlier accepted copy polish and confirmation action hierarchy remain included.
No CSS, artwork, dependency, server or environment files changed.

## Validation

| Check | Result |
|---|---|
| Selected client tests | 32 passed, 0 failed; five existing test files |
| Actual-source frontend build | Passed; 506 generated files |
| Existing bundle budgets / production sourcemap checks | Passed |
| Playwright repository cases | 8 passed: five new, one extended reference case, two shared-fixture regressions |
| Screenshot matrix | 16 before + 16 after; 8 contexts per phase |
| Matched visual states | 16 pairs; 24 full/focused comparison boards |
| Scoped ESLint | Passed; all five changed TS/TSX/test files |
| Scoped strict TypeScript | Passed; 5 roots, 356 resolved modules |
| Locale JSON parsing / Git whitespace | Passed |
| Unexpected runtime, console or network errors | 0 |

The browser cases verify network and 503 failures, localized manual retry, input
and reference retention, hint reset after editing, caller abort, empty local
validation, 400 INVALID_IDENTIFIER, 429 AUTH_RECOVERY_RATE_LIMITED and even an
application rate-limit code carried with 503. Advancing the synthetic clock by
60 seconds produces no additional recovery POST. Repeated Enter during a gated
retry still yields one pending POST. Explicit retry succeeds with the expected
single additional POST; keyboard editing restores the ordinary ready label.

Known mock 503 console messages are scoped to the exact failed POST URL. Capture
runs intentionally contain eight such messages per phase; they are recorded,
not hidden as generic errors. All unexpected errors remain failures.

The initial unsupported validation fixture code was corrected to the actual API
contract. Server-error fixtures and classification use the actual shared/server
codes, including INVALID_IDENTIFIER, INTERNAL_ERROR and SERVICE_UNAVAILABLE.
The final immutable revision reran client tests, build and all affected browser
checks. Client tests use the existing sandbox TypeScript loader; this is not a
claim that the full npm client suite was run.

## Source, captures and isolation

- Baseline manifest: `ea7ad004a4878bf82c5e40ac9bd65e7055b34860f38a0860adbc7e404b1d740a`.
- Final manifest: `7ee97ca56a09464d80d075a9f0b8526f150fc66e06ef208b6665d44202afbee7`.
- Parent comparison checked all 3,913 snapshot files against the worktree. The
  seven application/test file hashes were checked again at finalization; the
  report is finalized afterwards as documentation outside the application graph.
- Both comparison phases use actual-source builds, with no compiled-JS patching.
- Capture route/state/theme/language match: 320x1000 and 1440x900 CSS pixels,
  density 1, light/dark, BM/EN, ready/error. PNGs retain natural full-page height.
  Product pixels are unscaled, with readable desktop form crops and a neutral
  pointer position to avoid hover-only differences.
- Execution reused the existing constrained WSL bwrap/cgroup sandbox: synthetic
  data, no external network, read-only source/toolchain and scratch-only writes,
  with CPU, memory, process, file, disk and wall limits. Parent-only bounded
  no-follow promotion occurs after target processes exit. No dependency download
  or production access was performed.

Required fidelity surfaces:

- **Typography:** existing font family, weight, size and line height are retained;
  both retry labels fit without clipping or wrapping regression.
- **Spacing/layout:** all 16 matched states retain x/y/width/height within 1 px;
  input, alert, reference, submit and artwork bounds remain aligned.
- **Colors/tokens:** existing primary/error/neutral palette rules remain intact.
- **Image quality/assets:** original themed artwork and logo remain decoded and
  separated from the form. All 108 CSS, image and font files are byte-identical.
- **Copy/content:** only the submit label changes in temporary-error states;
  ordinary submission, error details, reference and generic approval copy remain.

## Evidence

[Machine-readable final results](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-forgot-retry-20261103/FINAL_QA_RESULT.json)

[Phone light comparison](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-forgot-retry-20261103/comparisons/error-light-ms-320.png)

[Desktop dark comparison](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-forgot-retry-20261103/comparisons/focus-error-dark-en-1440.png)

[All paired boards and hashes](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-forgot-retry-20261103/comparisons/boards.json)

[Prior confirmation-action QA](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-forgot-retry-20261103/PREVIOUS_DESIGN_QA.md)

## Limits and checklist

- [x] Accepted temporary-error feedback implemented in BM/EN.
- [x] Real-controller manual retry, deduplication, denial and cancellation checks passed.
- [x] Matching visual QA and scoped static checks passed.
- [ ] Full repository suites, native-phone keyboard testing and GitHub CI were
  not run for this focused change.
- [ ] The existing PostCSS missing-`from` warning remains in baseline/after builds;
  it does not fail the build and is outside this change.

No commit, push or deployment was performed for this step.
