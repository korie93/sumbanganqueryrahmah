# HTTP Middleware Pipeline

`server/internal/local-http-pipeline.ts` is the canonical Express middleware
ordering for the local/production worker process. Preserve this order unless a
change has a dedicated security review and focused tests.

## Current Order

1. `registerLocalHttpSecurityHeaders(app)` sets Helmet/CSP/security headers
   before any route can respond.
2. `registerLocalHttpCompression(app)` enables response compression after
   security headers are registered.
3. `registerLocalHttpBodyParsers(app, limits)` applies the default,
   collection, import, and telemetry body limits before route handlers read
   request bodies.
4. `createCorsMiddleware()` validates browser origins and sets CORS headers.
5. `/uploads` is dark-routed to `404` before observability and application
   routes, preventing direct public receipt access.
6. `createSensitiveApiResponseSanitizerMiddleware()` wraps API JSON responses
   and strips sensitive fields if a handler accidentally returns raw records.
7. `registerLocalHttpObservability(app, tracker)` assigns request accounting
   and completion logging.
8. `createForwardedForTrustProxyWarningMiddleware()` warns when forwarded
   client IP headers arrive without explicit `TRUSTED_PROXIES`.
9. `createGlobalRequestTimeoutMiddleware()` attaches the per-request abort
   signal and timeout boundary.
10. `/api` cache headers set `Cache-Control: no-store` and `Pragma: no-cache`.
11. `createCsrfProtectionMiddleware()` rejects cookie-authenticated unsafe API
    mutations without a valid same-origin CSRF signal.
12. `adaptiveRateLimit` applies IP and authenticated-user API throttles.
13. `systemProtectionMiddleware` applies adaptive runtime pressure protection.
14. `maintenanceGuard` blocks protected routes while maintenance mode is active.
15. Domain route registration happens after this pipeline in
    `server/internal/local-runtime-environment.ts`.

## Rules For Changes

- Do not move CSRF after route registration.
- Do not move API rate limiting after domain route handlers.
- Do not register public static upload serving under `/uploads`.
- Keep request ID and observability ahead of route handlers so error responses
  and logs include correlation data.
- If adding a new middleware, decide whether it must run before body parsing,
  before CSRF, before rate limiting, or after all request guards, then add a
  focused test in `server/http/tests/local-http-pipeline.test.ts`.
