# Content Security Policy Runbook

SQR owns CSP in the Express/Helmet layer, not in Nginx. Keep proxy security
headers out of `deploy/nginx/sqr.conf.example` unless the app header contract is
changed at the same time.

## Runtime Source Of Truth

- Code: `server/internal/local-http-security.ts`
- CSP report route: `POST /api/csp-report`
- Report group: `sqr-csp-endpoint`
- Contract tests:
  - `server/http/tests/local-http-pipeline.test.ts`
  - `server/routes/tests/telemetry.routes.integration.test.ts`
  - `scripts/tests/nginx-production-contract.test.mjs`

## Current Directives

| Directive | Current value | Purpose |
| --- | --- | --- |
| `default-src` | Helmet default plus app overrides | Baseline fallback. |
| `base-uri` | `'self'` | Prevents injected `<base>` URL changes. |
| `connect-src` | `'self'` | API, WebSocket and telemetry calls stay same-origin. |
| `img-src` | `'self' data: blob:` | Allows app assets, receipt previews and generated blob previews. |
| `frame-src` | `'self' blob:` | Allows same-origin frames and safe blob preview frames. |
| `object-src` | `'none'` | Blocks plugin/object embeds. |
| `script-src` | `'self'` | Blocks inline and third-party scripts. |
| `script-src-attr` | `'none'` | Blocks inline event-handler attributes. |
| `style-src` | `'self'` | Loads app stylesheets only from this origin. |
| `style-src-elem` | `'self'` plus checked hashes | Allows deterministic `react-remove-scroll-bar` style tags only. |
| `style-src-attr` | `'none'` | Blocks inline style attributes. |
| `trusted-types` | `default sqr-ui dompurify` | Limits DOM sinks to approved Trusted Types policies, including DOMPurify's sanitizer policy. |
| `require-trusted-types-for` | `'script'` | Enforces Trusted Types on script-relevant sinks. |
| `report-uri` | `/api/csp-report` | Legacy CSP report endpoint. |
| `report-to` | `sqr-csp-endpoint` | Modern browser reporting group. |

## Adding A New Source

1. Confirm the feature cannot use an existing same-origin asset or backend
   proxy.
2. Prefer a narrow directive change, such as `img-src https://example-cdn`, over
   widening `default-src`.
3. Do not add `unsafe-inline`, `unsafe-eval`, wildcard hosts, or broad schemes
   unless a separate security review approves it.
4. Update `server/internal/local-http-security.ts`.
5. Add or update a contract test that asserts the exact directive behavior.
6. Run:

```bash
npm run verify:csp-hashes
npx tsx --test server/http/tests/local-http-pipeline.test.ts
npx tsx --test server/routes/tests/telemetry.routes.integration.test.ts
```

## Trusted Types Sanitizer Ownership

`client/src/lib/trusted-types.ts`, the AI plain-text sanitizer and the monthly
report sanitizer share the default DOMPurify module instance. DOMPurify owns
its internal native `dompurify` policy; SQR's `default` and `sqr-ui` policies
only return sanitized output. Keep `RETURN_TRUSTED_TYPE: false` when returning
HTML from SQR policy callbacks, which the browser wraps as `TrustedHTML`.
See [DOMPurify's Trusted Types guidance](https://github.com/cure53/DOMPurify#what-about-dompurify-and-trusted-types).

Do not pass a string-returning imitation of a Trusted Types policy to DOMPurify.
Its internal parser needs native trusted values under enforcement; plain strings
can re-enter SQR's default sanitizer and turn legitimate HTML into empty content.
Do not create another DOMPurify instance for these consumers: the existing CSP
allows one policy per name, so a second instance risks a duplicate-policy error.
Do not solve either issue with `allow-duplicates`, a pass-through default policy,
new policy names, or a relaxed CSP. Keep per-call sanitizer configurations; do not
introduce global `setConfig` or hooks that weaken another consumer's allowlist.

Run `npm run test:trusted-types:browser` for the real Chromium regression. It
bundles the application sanitizer modules in memory, serves synthetic fixtures
on ephemeral loopback and tests native enforcing Trusted Types, initialization
order, repeated configuration switching and safe DOM sinks. It uses no backend,
database, credentials or production traffic. CI runs it in the Chrome-enabled
job and uploads `artifacts/trusted-types-browser/` on success or failure.
Report sanitizer output checks are not a claim of end-to-end popup/print testing.

2026-10-23 local verification: all 10 native Chromium sanitizer cases pass,
including an explicit trusted sink before default-policy initialization and a
same-origin iframe default policy. The actual built V17 authentication browser
suite also passes all 38 checks, including login/recovery/reset under strict
script/style CSP and Trusted Types. Targeted HTTP CSP/telemetry/script-URL tests
pass (47 tests); the full client suite passes all 2,293 tests in two command
batches, including the 22 sanitizer/runtime/report unit contracts. Typecheck,
client lint and production build pass, including zero production sourcemaps.
These are local synthetic results, not a claim of a remote CI or production run.

## Style Hash Maintenance

Radix scroll-lock styles are allowed through
`REACT_REMOVE_SCROLL_BAR_STYLE_HASHES`. When a dependency update changes those
styles:

1. Run `npm run verify:csp-hashes`.
2. If it fails, review the generated style text for unexpected content.
3. Update the checked-in hashes only after review.
4. Run the local HTTP pipeline tests before merging.

## Testing CSP Safely

- Test in local or staging with `PUBLIC_APP_URL` and
  `CORS_ALLOWED_ORIGINS` matching the browser origin.
- Open browser devtools and watch for CSP violations while exercising login,
  collection receipt previews, modals, dropdowns, AI chat and backup/report
  exports.
- Inspect `/api/csp-report` telemetry summaries through the internal monitor
  flow. Never log or echo raw report payloads because reports may include URLs.

## Reporting Endpoint

`/api/csp-report` is intentionally CSRF-exempt because browser report delivery
does not reliably include custom CSRF headers. It is still bounded by:

- body limit of 8KB
- CSP report content-type validation
- same-site telemetry guards where applicable
- per-client drop guards to suppress noisy report floods

## CSP And CSRF

CSP and CSRF protect different failure modes:

- CSP reduces the impact of script/style injection and limits outbound browser
  behavior.
- CSRF protects cookie-authenticated unsafe API requests with double-submit
  tokens and same-origin signals.

Do not weaken CSRF because CSP exists, and do not add CSP sources to work around
CSRF failures. For telemetry-only exceptions, keep route-specific guards and
tests in place.
