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
