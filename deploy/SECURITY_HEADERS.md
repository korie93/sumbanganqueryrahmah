# SQR Security Headers

SQR keeps browser security headers in the Express/Helmet application layer.
Nginx terminates TLS, throttles edge traffic, buffers large upstream auth/CSP
headers, and caches immutable assets, but it should not duplicate app-owned
browser security headers unless Helmet is intentionally disabled.

Duplicating these headers at Nginx can produce conflicting values. For example,
the app deliberately uses `Referrer-Policy: no-referrer`, while a proxy-level
`strict-origin-when-cross-origin` header would weaken and conflict with that
policy.

## App-Owned Headers

| Header | Expected value/policy | Owner | Purpose |
| --- | --- | --- | --- |
| `Content-Security-Policy` | strict self-origin CSP with Trusted Types and CSP reporting | Express/Helmet | Restricts script, style, frame, image, and object execution paths. |
| `X-Content-Type-Options` | `nosniff` | Express/Helmet | Prevents MIME sniffing for script/style responses. |
| `X-Frame-Options` | `SAMEORIGIN` plus CSP `frame-ancestors 'self'` | Express/Helmet | Allows same-origin/blob preview flows while preventing cross-site framing. |
| `Strict-Transport-Security` | controlled by `HSTS_MAX_AGE_SECONDS`, `includeSubDomains`, and `HSTS_PRELOAD_ENABLED` | Express/Helmet | Enforces HTTPS after the first trusted visit. |
| `Referrer-Policy` | `no-referrer` | Express/Helmet | Prevents referrer leakage across internal workflows. |
| `Permissions-Policy` | disables camera, microphone, geolocation, display capture, payment, USB, and related APIs | Express app | Reduces ambient browser capability exposure. |
| `X-Permitted-Cross-Domain-Policies` | `none` | Express/Helmet | Blocks legacy Flash/Acrobat cross-domain policy loading. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Express/Helmet | Isolates browsing contexts. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Express/Helmet | Restricts cross-origin resource embedding. |
| `Report-To` / `Reporting-Endpoints` | `/api/csp-report` | Express app | Receives CSP violation reports. |

## Nginx Responsibilities

- Preserve upstream security headers without overriding them.
- Keep `proxy_buffer_size`, `proxy_buffers`, and `proxy_busy_buffers_size`
  large enough for CSP, Trusted Types, and auth-cookie responses.
- Keep `/assets/` cache headers scoped to hashed static assets only.
- Keep `client_max_body_size` aligned with application import limits so Express
  can return structured upload errors.
- Keep edge throttles for auth, API, telemetry, and WebSocket routes.

## Validation

Use these checks after deployment:

```sh
bash scripts/post-deploy-health-check.sh https://sqr-system.com
curl -I https://sqr-system.com/
curl -i https://sqr-system.com/api/health/live
npm run test:http
npm run test:scripts
node --test scripts/tests/nginx-production-contract.test.mjs
```

Required response headers should include `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`,
`Referrer-Policy`, `Permissions-Policy`,
`X-Permitted-Cross-Domain-Policies`, `Cross-Origin-Opener-Policy`, and
`Cross-Origin-Resource-Policy`.

If a deployment must move header ownership to Nginx, first mirror the exact
application values above, update `deploy/nginx/sqr.conf.example`, and extend the
Nginx production contract test so conflicting duplicate values cannot ship.
