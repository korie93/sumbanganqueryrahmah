# Login PageSpeed investigation — 31 October 2026

Source baseline: `66a0ab81a37eb2fe6aadc459eb18748690680e99`.
[CI run 41199726748](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/41199726748)
failed only `Run PageSpeed Lighthouse budgets`; build/test, coverage and the
separate CodeQL run passed. This report distinguishes hosted CI from synthetic
local measurements. The user has authorized publication; exact-source hosted
verification remains pending. Publication receipts are retained in the evidence
directory below. Deployment is not included.

## Actual failing gate

`scripts/lib/pagespeed-local.mjs` sets minimum scores to Performance 85,
Accessibility 95, Best Practices 90 and SEO 80. The runner checks all four on
Home, but only the first three on Login. The strict wrapper enables threshold
enforcement and disables retryable soft failure. A low score is not retried;
only `NO_NAVSTART` is a retryable runtime condition.

The downloaded `pagespeed-local-summary.json` contains exactly one failure:
`local-login-mobile-latest`, Performance **84 < 85**. Its `overallStatus:
"success"` means report collection succeeded, not that budgets passed. The
runner correctly exits nonzero after writing `thresholdFailures`.

| Hosted CI mobile | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 86 | 100 | 100 | 100 | 2172 ms | 3501 ms | 133 ms | 0 |
| Login | 84 | 100 | 100 | 69 | 2194 ms | 3824 ms | 100 ms | 0 |

Login intentionally uses `noindex,nofollow,noarchive` in
`client/src/app/document-metadata.ts`. Its SEO 69 is diagnostic and excluded from
the login gate. Indexing an internal sign-in page would not repair this failure.

## Measured critical path

Login LCP is `.auth-v17-art`, the original 62,042-byte V17 illustration. Its
breakdown is 7 ms TTFB, 1393 ms discovery delay, 1870 ms resource transfer and
554 ms render delay. Discoverability, high priority and eager loading already
pass. Login styles finish by 2402 ms and the illustration by 3269 ms, but the
last required API-client module finishes around 3690 ms before login mounts.

The initial HTML starts many requests together. Three already-eager helpers
finish much later despite discovery around 660 ms:

| Existing helper | Decoded JS | Transferred | Completes |
| --- | ---: | ---: | ---: |
| `auth-session` | 5526 B | 6139 B | 2577 ms |
| `lazy-with-preload` | 1052 B | 4431 B | 2714 ms |
| `maintenance-client-policy` | 1624 B | 4629 B | 2736 ms |

These small HTTP/1.1 responses incur repeated security headers and request
queuing. FCP is also delayed by the initial stylesheet path: Lighthouse lists
index CSS, the route error-boundary CSS and boot CSS as render blocking, with
estimated savings of 390 ms. This estimate is not an additive guaranteed saving.
The report does not support blaming a slow database or a login API request:
no credentials have been submitted at first paint. LCP contributes roughly
11.5 of the 15.7 missing performance points; TBT contributes about 0.6.

## Narrow build optimization

`vite.config.ts` groups only those three exact existing eager helper modules
into the existing `public-runtime` chunk. Their source, eager behavior, auth and
maintenance decisions remain unchanged. API clients and protected routes retain
their existing boundaries. Framework and validation group rules keep priority.
No image, CSS, animation, device policy, login submission, timeout, gate or retry
setting is changed.

The real build verifies ownership and lazy route boundaries:

| Initial JavaScript graph | Before | After |
| --- | ---: | ---: |
| Script requests in initial HTML | 9 | 5 |
| Decoded bytes | 336887 | 301009 |
| Gzip bytes, level 6 | 107175 | 96090 |
| All emitted files | 506 | 503 |

All **107 non-JavaScript assets**, excluding regenerated `index.html` and
including CSS and artwork, are byte-identical.
These figures describe the initial graph, not a 35 KB whole-application saving.

## Local strict comparison

Both builds were audited with the actual strict wrapper and runner, official
Chrome for Testing 156.0.8078.80 and the already-cached Lighthouse 13.0.3 CLI.
An offline-only npm bridge executes that exact cached CLI without installing or
downloading packages. The fixture serves the built assets and synthetic public
API responses on isolated loopback, mirrors the security-header values and
cache/compression behavior, and uses no production data or PostgreSQL service.
Mobile devtools throttling, CPU slowdown 4, score thresholds and runtime-only
retry policy are unchanged. Each route used one attempt.

The matched comparison runs use the same bounded sandbox: 2 CPU, 1 GiB hard
memory cap, 960 MiB memory-high, no swap, 256 tasks and 180 seconds. Earlier
fixture failures are retained separately: missing local dotenv files, a harness
entry-facade assertion, and an incomplete audit under tighter memory-high with
an unnecessary bridge process. These are not passing app or score checks. Only
the matched final pair below is used for the local before/after table.

| Synthetic local mobile | Performance before → after | FCP before → after | LCP before → after | TBT before → after | CLS |
| --- | --- | --- | --- | --- | ---: |
| Home | incomplete → 54 | 2734 → 2600 ms | 5628 → 4667 ms | missing → 1018 ms | 0 → 0 |
| Login | 39 → 40 | 4678 → 3429 ms | 7533 → 7344 ms | 943 → 1128 ms | 0 → 0 |

Home's baseline has `NO_TTI_CPU_IDLE_PERIOD` in TBT/interactive/long-task audits;
its missing score must not be treated as zero, a pass or a valid score comparison.
Accessibility and Best Practices are 100 throughout; SEO remains Home 100 and
Login 69. Both strict runs exit **1**. After the change, Home 54 and Login 40
still fail the unchanged 85 gate.

The sandbox records 794/585 `memory.high` events and 567/551 major page faults
before/after. No hard memory/process cap or OOM event occurs, but this does not
establish an absence of measurement pressure. CPU benchmark indices also differ:
Home 1881.5/1890, Login 1664.5/1842; hosted CI is a separate environment. The
observed FCP/LCP reductions and Login TBT increase are single-sample results,
not proof of a repeatable causal improvement or regression. The TBT increase is
explicitly unresolved; do not claim every device's measured performance improved.

## Validation and remaining work

**143 focused source/graph tests**, changed-file lint and strict changed-root
TypeScript (2 roots, 339 resolved files) pass. The production frontend build,
byte budget, sourcemap gate and **16 native browser cases** pass, with receipts
recorded in `FINAL_VALIDATION.json` in the evidence directory.
The browser checks cover original login controls/artwork, noindex, native preload
reuse, strict CSP/Trusted Types, desktop/tablet/phone light/dark layouts, SPA
login/Home navigation and constrained-device signals with full motion.

UI and interaction regressions have not been observed in these checks. Per-device
performance is not fully certified: simulated device signals and layout tests
do not substitute for real low-, medium- and high-spec hardware measurements.
The complete repository typecheck and entire visual suite remain for hosted CI.

Publish only with user authorization, then rerun hosted CI on the exact change.
Inspect both complete Lighthouse reports and the summary rather than assuming
the deterministic byte/request saving guarantees Performance >=85. If Login
still fails, use that environment's remaining dependency/render/CPU attribution
to choose the next narrow optimization. Keep intentional login noindex, supplied
imagery, all animation, security headers and the existing thresholds intact.

Evidence is retained outside the repository at
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ci-login-pagespeed-20261031/`.
The original 2,289,872-byte CI archive has SHA-256
`005f343640c438144bdfb88308689b446d3f6b3e52b3e0bfb3305b33aa8deb8f`.
Executable/test source manifest:
`a8a160ec563f1990b422096911c31b64dea9730b3cc5d08a147df44a37e5e7e9`.
