# SQR Audit Fix Report - 2026-06-03

Source audit: `CODEX_GPT55_EXTRA_HIGH_AUTONOMOUS_FIX_AUDIT_SQR.md`

Branch: `fix/task-13-split-theme-tokens`

## Summary

Completed a surgical remediation pass across the 38 audit findings. The pass fixed confirmed security and accessibility gaps, added targeted regression tests, and verified the remaining findings as already controlled, false positive, or intentionally phased to avoid broad regression.

## Fixes Applied

| ID | Status | Evidence |
| --- | --- | --- |
| CRITICAL-01 Error response sanitization bypass | Fixed | Encoded URL/HTML entity variants are inspected before public error payloads are exposed. Added tests for encoded database URLs, bearer tokens, invalid entity probes, stack/file paths, and nested details. |
| CRITICAL-02 Login 2FA token signing error handling | Fixed | `signTwoFactorChallengeToken()` is wrapped with structured logging and safe 503 `SERVICE_UNAVAILABLE` response. Added route test for signing failure. |
| CRITICAL-03 Collection nickname authorization TOCTOU | Hardened | Collection access now fails closed for banned, inactive, and expired session/user snapshots before role or nickname authorization. Added access tests. |
| CRITICAL-04 `DATABASE_SSL` default | Fixed | `.env.example` now defaults to verified TLS with an explicit local-only opt-out comment. Existing runtime TLS guards verified. |
| CRITICAL-05 Audit HMAC key fallback | Fixed | Production-like hosts now require `SQR_AUDIT_HMAC_KEY` and reject reuse of `SESSION_SECRET`. Local fallback remains warning-only. Added runtime tests. |
| BACKEND-06 DB connection string masking | Verified | Logger/error response sanitizers redact PostgreSQL URLs, encoded URLs, assignments, bearer tokens, stack traces, and file paths. |
| BACKEND-07 Seed passwords in memory | Fixed | Long-lived `runtimeConfig` no longer stores seed passwords; bootstrap reads seed password env values transiently. Added runtime config test. |
| BACKEND-08 Admin groups N+1 queries | Verified | Admin group visibility already uses batched storage lookup rather than per-item query loops. |
| BACKEND-09 WebSocket shutdown race | Verified | Shutdown flow closes clients, HTTP server, telemetry, and PostgreSQL pools through existing guarded shutdown helpers and tests. |
| BACKEND-10 Base32 strict validation | Fixed | TOTP Base32 decode now uses strict RFC 4648 validation, rejects invalid padding/chars, and records invalid-secret metric. Added tests. |
| FRONTEND-11 Modal focus trap | Verified | Modal/dialog implementation uses Radix focus handling and viewport contract tests. |
| FRONTEND-12 Image `src` validation | Verified | Receipt preview source uses safe URL resolution and existing safe-url/preview tests. |
| FRONTEND-13 Rotation data attribute | Verified | Receipt preview rotation is normalized before rendering and covered by preview tests. |
| FRONTEND-14 Large list rendering | Verified | Large operational views use pagination/virtualization patterns; client tests cover virtualized viewer rows. |
| FRONTEND-15 Countdown interval | Verified | Login lock countdown uses timestamp delta, clears interval on unmount/state change, and has lock-state tests. |
| A11Y-16 Form validation focus | Fixed | Login submit validation now focuses the first invalid field with `preventScroll`; added contract test. |
| A11Y-17 Image alt fallback | Verified | Receipt previews retain fallback alt text when filename is absent. |
| A11Y-18 Modal keyboard trap | Verified | Radix dialog/alert-dialog and viewport contracts remain in place. |
| A11Y-19 Custom select ARIA | Verified | Radix Select owns option ARIA state; decorative select icons are hidden from assistive tech. |
| A11Y-20 Decorative icons | Fixed | Added `aria-hidden` to relevant carousel/select/receipt preview icons. |
| CSS-21 Sticky header overlap | Verified | Sticky layer tokens and viewport contracts are already centralized and tested. |
| CSS-22 Backdrop filter fallback | Verified | Sticky/footer surfaces keep opaque-ish background fallbacks outside `supports-[backdrop-filter]`. |
| CSS-23 Safe-area default | Verified | Safe-area env values are centralized with `env(..., 0px)` fallbacks. |
| CSS-24 Text overflow | Verified | Collection daily details and dense badges use ellipsis or `overflow-wrap:anywhere`; referenced comparison CSS file was not present. |
| CSS-25 Virtual keyboard modal sizing | Verified | Dialog viewport uses shared viewport token instead of raw `dvh`; tests pass. |
| CONFIG-26 `skipLibCheck: true` | Phased | Kept unchanged to avoid broad dependency type churn in this surgical pass. Existing `npm run typecheck` passes. |
| CONFIG-27 ESLint warnings | Phased | `react-hooks/exhaustive-deps:error` trial found 20 pre-existing frontend dependency findings; not flipped globally in this pass. |
| CONFIG-28 `compression@1.8.1` | False positive | `npm view compression version` reports `1.8.1` as current latest; dependency audit reports no moderate+ vulnerabilities. |
| CONFIG-29 Tailwind dark mode | Fixed | `tailwind.public.config.cjs` now uses selector mode with `.dark`. |
| CONFIG-30 SAST/CodeQL | Verified | `.github/workflows/codeql.yml` already exists. |
| CONFIG-31 Nginx backup headers | Verified alternative | Repo intentionally keeps app-owned security headers and verifies nginx contract to avoid duplicate/conflicting headers. |
| CONFIG-32 Vendor XLSX integrity | Verified | `verify:xlsx-vendor-integrity` passed and build pipeline includes vendor integrity checks. |
| STATE-33 Context provider values | Fixed | Memoized provider values for toggle-group, chart, form, and carousel. |
| STATE-34 localStorage multi-tab race | Verified | Auth session is sessionStorage-scoped with single-tab lock and forced logout broadcast tests. |
| STATE-35 Abort cleanup | Verified | AbortController cleanup contracts pass for login/change-password/viewer/export/AI/query flows. |
| STATE-36 Batch partial failure | Verified | Collection mutation support uses `Promise.allSettled` and fails mutation on save failures; cleanup is best-effort and observable. |
| STATE-37 Preload failures | Verified | Lazy preload helper resets failed promises and catches scheduled preload rejections; tests pass. |
| STATE-38 PDF export retry/network | Verified | Export row loading uses abort-aware API client; transient API retries are covered in query client tests and aborts finalize export state. |

## Verification

All major gates completed after the final patch set:

- `npm run lint` - PASS
- `npm run typecheck` - PASS
- `npm test` - PASS
- `npm run build` - PASS
- `npm run verify:secrets` - PASS
- `npm run verify:repo-hygiene` - PASS
- `npm run verify:xlsx-vendor-integrity` - PASS
- `npm run verify:bundle-budgets` - PASS
- `npm run audit:dependencies` - PASS
- `npm audit --audit-level=high` - PASS
- `npm run test:e2e:a11y` against local built server - PASS for public/auth routes; authenticated routes skipped because local e2e credentials were not set.
- `npm run test:e2e:visual` against local built server - PASS for public/auth routes; authenticated routes skipped because local e2e credentials were not set.

Note: an initial full `npm test` run showed a transient `response-sanitizer.test.ts` subprocess failure without a failing assertion. The file passed in isolation, `npm run test:http` passed, and the subsequent full `npm test` passed.

## Residual Risks

- `skipLibCheck` remains enabled intentionally. Turning it off should be handled as a dedicated dependency-type cleanup branch.
- `react-hooks/exhaustive-deps` remains warning-level. A strict trial reported 20 existing hook dependency findings, so this needs a separate focused React pass.
- Local browser e2e authenticated routes were skipped because no local `SMOKE_TEST_USERNAME` / `SMOKE_TEST_PASSWORD` or equivalent variables were configured for the temporary built server.
