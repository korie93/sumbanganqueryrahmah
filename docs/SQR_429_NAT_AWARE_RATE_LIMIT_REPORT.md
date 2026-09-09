# SQR 429 NAT-aware rate limiting — engineering and deployment report

Local implementation completed on baseline `252d8d9d` and was published as `7707120f`. Main CI, including mandatory live Redis verification, passed. A subsequent Release Verification failure revealed six scripted logins sharing the strict five-attempt account window; an orchestration-only local follow-up is pending publication/reverification (section 22). Production deployment/reload remains unauthorized and unperformed. See [continuation handoff](../CODEX_CONTINUATION_HANDOFF_SQR_429_NAT_AWARE_RATE_LIMIT_FIX.md) for resumption steps.

## 1. Root cause

Two independent application defects are proven by before/after tests. Global adaptive middleware ran before authentication, so it saw no user. Even when a user was prepopulated it still enforced a low shared-IP quota first. Login separately allowed only five network/browser-fingerprint requests per fifteen minutes, while its account key could be reset by changing IP/browser hints. Frontend retry timing shortened the server's cooldown, adding avoidable pressure.

The supplied active Nginx dump now confirms another production layer: `/api/` shares30requests/minute per IP, burst100 and connection cap80, with explicit429 rejection. This path covers `/api/me` before the app. Source SHA is252d8d9d and the runtime release directory embeds the same revision. Individual historical429 attribution still needs correlated logs, but the active edge producer is identified. See [targeted active-install rollout](SQR_429_ACTIVE_NGINX_ROLLOUT.md).

## 2. All HTTP 429 producers identified

| Producer | Scope / behavior | Treatment |
| --- | --- | --- |
| `internal/apiProtection.ts` | Broad API adaptive user/IP buckets | Corrected NAT identity and bucket architecture |
| `middleware/rate-limit.ts` | Search10/10s; import12/5m; login;2FA5/15m;2FA management5/min; recovery20/10m; auth mutations12/10m; admin30/10m; destructive admin10/10m; adaptive cooldown | Login identity/network corrected; other limits preserved; Redis errors fail closed |
| `internal/aiConcurrencyGate.ts` | Full AI queue or queue wait timeout | Resource protection preserved; Retry-After and actual capacity headers added, no invented reset time |
| `routes/operations-debug-routes.ts` | Debug10/min | Preserved |
| `services/collection/collection-osp-v7-export-guard.ts` | Billing export4/user/min,1 concurrent, bounded tracked identities | Quotas/business behavior preserved; exact window retry metadata reaches HTTP headers without changing body |
| Global error mapping | Serializes thrown429, not a separate counter | Preserved |
| Active Nginx `limit_req` / `limit_conn` | API30/min burst100/conn80; login10/min burst5/conn10; explicit429 | Active producer confirmed; targeted existing-install rollout prepared, not applied |

Runtime request tracking/alerts count429 but do not generate it. `systemProtectionMiddleware` returns503 for database/heavy-route protection. Active Nginx also sets429 on import, WebSocket upgrade/connections and web-vitals telemetry limits. Those independent controls are preserved; no WebSocket429 incident was supplied. WebSocket message controls remain unchanged.

## 3. Middleware order findings

A real HTTP test before implementation observed `req.user === undefined` at adaptive, zero DB reads there, then one authenticated snapshot and one activity update at the route. New order adds signed quota identity immediately after CSRF and before adaptive. It does not set `req.user` or authorize access.

Private WeakMap caches cryptographic verification only for that Request, token and secret. Strict payload parsing, signatures/allowed algorithms and expiry checks are reused from existing authentication. Expiry is rechecked after middleware waits. Full route authentication still performs live revocation, account/session/activity checks, forced-password-change and RBAC. Tests verify one JWT verification, one snapshot, one touch and one refresh/revocation side-effect sequence. A signed-but-revoked token may consume only its own quota; it still cannot pass live authentication.

## 4. Old architecture

Every protected request consumed `ip:<network>:<scope>`, often only8–40 generic requests per10s after runtime reductions. User buckets were unavailable before auth and, even when present, could not override IP rejection. Read and write requests also shared a bucket counter despite differing thresholds.

## 5. New NAT-aware architecture

Anonymous requests retain strict IP quotas. Signed authenticated requests use independent per-user scope/class quotas, followed by a much larger aggregate network ceiling. User-denied traffic does not consume another user's aggregate allowance. Exact POST `/api/login` and `/api/auth/login` delegate to mandatory account and network route guards instead of the tiny generic anonymous quota; other auth routes are not exempted. Session-control exemptions are preserved.

## 6. Authenticated user bucket design

`user-v2:<sha256(stable user ID)>:<scope>:<reads|writes|uploads>`. No body/query/header user ID is trusted. Scope is a bounded server-derived set (generic, analytics, collection, collection metadata, heartbeat, AI, telemetry); no request-path cardinality or rotating-window suffix. Default500 reads/min converts to84/10s;100 writes/min to17/10s;10 uploads/min to2/10s. Safe receipt GETs count as reads. Hashing the full subject avoids truncated identity collisions. Heavy routes retain the tighter adaptive per-user cap.

## 7. Aggregate IP flood guard

`authenticated-ip-v2:<normalized trusted IP/subnet>` combines accepted authenticated traffic across scopes. Default120000/min yields20000 per10s. It is intentionally not multiplied by runtime mode/throttle factor. For reference,100 users each starting ten representative calls is1000 requests, not1000 separate staff quotas. Size this configurable ceiling using measured concurrency and bursts; it is finite and is not a promise to permit every user to saturate every scope simultaneously. Anonymous buckets and authenticated aggregate buckets are separate. IPv6 normalization prevents trivial address rotation within a subnet.

## 8. Login fix

Strict5/account/15m remains. The key uses exactly the login parser's canonical NFKC username and a hashed account subject, independent of IP/User-Agent/language; ignored `identifier` fields cannot alter it. Missing/invalid usernames have a bounded network fallback. Network guard is500/15m by default and keyed only to the normalized Express-resolved IP, not client hints. Both aliases share counters. Account abuse and large network floods still return429. Two-factor, recovery, admin and destructive-action thresholds are unchanged.

## 9. Redis/shared state

Healthy shared stores retain atomic Lua read/increment/expiry, hashed namespace isolation and stable expiring keys. No schema change, local downgrade, Redis flush or namespace-wide delete is used. Configured Redis failure now returns503 with Retry-After5 instead of silently multiplying quotas by worker count. Explicit local-memory fallback helper increments are synchronous/atomic. Multi-worker deterministic store tests cover same-key counts, separate subjects/scopes, fixed expiry, invalid results, outage and recovery. Live Redis execution is still separately tracked; modeled tests are not represented as a real daemon run.

## 10. Trusted proxy / Nginx

`TRUSTED_PROXIES` security behavior is unchanged; tests cover the narrow127.0.0.1/32 boundary and attacker-prepended forwarded headers. Both checked-in and supplied active relevant forwarded header names are correctly spelled. No observed office IP is hardcoded.

The checked-in example had30 API requests/min and20 burst, plus20 concurrent requests per network; login had10/min and5 burst. The corrected configurable deployment example uses API200/s burst2000 and connection1000; login10/s burst100 and connection200. Import admission retains30/min burst20 and its previous concurrency cap in a separate zone; telemetry/WS limits are unchanged. Template literals require manual deployment tuning, not environment interpolation.

Nginx's documented default limit rejection is503, and concurrent HTTP/2 requests count separately for connection limiting. The **actual supplied deployment overrides that default with429** in `/api/` and login locations. Its API burst100/conn80 differs from the original fresh-install example. Active split-file edits, preserving stricter import10/min burst5/conn3 and Certbot configuration, are documented in [the targeted rollout](SQR_429_ACTIVE_NGINX_ROLLOUT.md). Do not install the generic example over the active configuration. [Nginx request limiter](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html), [connection limiter](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html).

Added privacy-conscious example attribution format records method/path/status/upstream status and limiter outcomes plus correlation IDs, not query strings/bodies/cookies/Authorization. Active `nginx -T` and source/runtime output have now been supplied, but no correlated access/error logs, so per-event proportions remain unknown. Producer identification no longer waits on those logs. Do not publish raw production configuration or sensitive log content.

## 11. Runtime protection modes

Anonymous and heavy-route adaptive caps still honor NORMAL/DEGRADED/PROTECTION and throttle factor. Normal authenticated user quotas and aggregate NAT ceiling are stable across modes so pressure cannot collapse a whole office to a single-user IP budget. DB/AI/export circuits, runtime monitoring and explicit heavy-route rejection remain unchanged.

## 12. Frontend polling / retry

Retry-After is a minimum, not a hint: within the bounded automatic wait budget, nonnegative jitter is applied; longer cooldowns return the original error for caller/user handling without early retry. Exponential backoff remains for zero/missing cooldown. Retry count/delay remain bounded and cancellation is preserved. Collection POST, login and heartbeat remain non-retrying. Dashboard/prefetch share query keys, hidden-tab polling is disabled and heartbeat is single-flight; no separate polling loop was proven, so no UI/polling redesign was made.

## 13. Files changed

46 changed/new files total (including this report, active-install rollout and handoff). Production implementation: `server/auth/request-session-identity.ts`, `guards.ts`; `server/internal/apiProtection.ts`, `local-http-pipeline.ts`, `local-runtime-environment.ts`, `aiConcurrencyGate.ts`; `server/middleware/rate-limit.ts`, `redis-rate-limit-store.ts`; `server/lib/logger.ts`; `server/config/runtime.ts`, `runtime-env-schema.ts`, `runtime-config-types.ts`; `client/src/lib/api-client-retry.ts`. Header metadata only: `server/services/collection/collection-osp-v7-export-guard.ts`, `collection-osp-v7-operations.ts`, `server/routes/collection/collection-route-handler-factories.ts`.

Deployment/documentation: `.env.example`, `.github/workflows/ci.yml`, `deploy/examples/sqr.production.env.template`, `deploy/nginx/sqr.conf.example`, `docs/HETZNER_PRODUCTION_DEPLOYMENT.md`, `docs/SQR_429_ACTIVE_NGINX_ROLLOUT.md`, this report and continuation handoff. Remaining22 files are focused/contract regression tests beside these components. `git status --short` is authoritative before commit.

## 14. Configuration changes

| Environment key | Default | Validation | Purpose |
| --- | ---: | --- | --- |
| `SQR_RATE_LIMIT_AUTHENTICATED_IP_REQUESTS_PER_MINUTE` |120000|600..6000000|Aggregate authenticated network ceiling, fixed ten-second conversion|
| `SQR_RATE_LIMIT_LOGIN_IP_ATTEMPTS_PER_15_MINUTES` |500|100..100000|Login network flood budget, separate from account5|

Existing per-user, Redis and proxy settings are retained. New values are validated at startup and documented in `.env.example` and production template. No secret configuration values are committed.

## 15. Tests added / updated

Before/after deterministic NAT tests; actual HTTP pipeline20/50/100 signed users; anonymous/forged/expired/revoked/session/account/role/forced-change checks; one verification/refresh/touch; user read/write/upload and heartbeat isolation; aggregate overflow; IPv6/proxy spoofing;100-login NAT success, account/network abuse; strict sensitive routes; Redis multi-worker/expiry/failure/recovery; Retry-After exact timing and no mutation replay; Nginx contracts and configuration bounds. Artifact names and completed suites are recorded in the handoff.

## 16. 20/50/100-user same-IP results

All deterministic user loads pass in all three runtime modes. Actual HTTP tests pass200/500/1000 representative requests respectively under PROTECTION, throttle0.2 and DB protection enabled. Actual pipeline/auth middleware and JWTs run over counted storage doubles; representative endpoints use stub handlers. These are middleware-integration load tests, not production load tests or full business E2E. One abusive user still429; other users continue. Aggregate flood still429; other networks continue.

## 17. Login NAT results

100 same-IP staff requests succeed through combined real HTTP CSRF/adaptive/system/route guards. Same account attempt six returns429 across aliases, Unicode forms and rotating browser/IP hints. Another account succeeds. Network attempt501 returns429; missing CSRF is403; Redis unavailability is503 without invoking the login handler.

## 18. Typecheck / lint / build

All following commands completed locally with exit0; counts overlap across suites and must not be summed as unique tests.

| Verification | Result | Artifact under `artifacts/` |
| --- | --- | --- |
| Full auth (`node --import tsx --test --test-concurrency=2 server/auth/tests/*.test.ts`) |135 pass,0 skip|`nat-429-auth-regression.log`|
| Full HTTP, before adding optional live Redis test |366 pass,0 skip|`nat-429-http-regression.log`|
| `npm run test:client` |1548 pass (1042+506),0 skip|`nat-429-client-regression.log`|
| `npm run test:scripts`, before adding live Redis CI contract |401 pass (350+51),0 skip|`nat-429-scripts-regression.log`|
| Full route tests, concurrency2 |470 pass,0 skip|`nat-429-routes-regression.log`|
| Full lib/service tests, concurrency2 |600 pass,0 skip|`nat-429-services-regression.log`|
| `npm run test:security` |256 pass (10+246),0 skip|`nat-429-security-regression.log`|
| `npm run test:coverage:gate` |317 pass;86.78% lines,73.57% branches on gate-selected files|`nat-429-coverage.log`|
| Final config/login/AI focused command in CI |69 pass,0 skip|`nat-429-ci-security-focused.log`|
| Final Nginx + required live-Redis CI contracts |13 pass,0 skip|`nat-429-final-deploy-contracts.log`|
| `npm run typecheck`, `npm run lint` |PASS|`nat-429-final-typecheck.log`, `nat-429-final-lint.log`|
| `npm run build`, `npm run verify:bundle-budgets` |PASS; production sourcemaps0|`nat-429-build.log`, `nat-429-bundle-budgets.log`|

Build ID: `sqr-1.0.0-252d8d9d3bac-20260909T130954Z` (dirty source). Repo hygiene, secret scan, changed-file secret guard, server env access contract and diff whitespace check passed. Focused Redis/frontend51, NAT36 and pipeline24+refresh1 also passed as recorded in the handoff.

The live Redis test loads/skips locally without a URL; required mode without a URL deliberately fails (negative test, not a regression). CI provisions an isolated Redis7 service and requires it; no live execution or remote green CI is claimed. No live Nginx process is installed for syntax/load testing locally; configuration contracts passed only.

## 19. Deployment / rollback

No migration. Build and deploy matching backend/frontend together using the normal release workflow; no deployment has been performed. Keep Redis configured and trusted proxy narrow. Before rollout capture deployed SHA, active Nginx config and status/upstream attribution safely. Review **active** server/location blocks for old network request/connection caps and header spelling; copying an unused example does not change production. Apply reviewed Nginx changes only after `nginx -t`; reload through normal operator procedure. Do not enable blanket trust proxy or bypass counters by trusting cookies/user headers at Nginx.

Monitor structured limiter names, subject type/hash, count/limit, mode/throttle and edge upstream status; normal requests do not generate limiter logs. Verify a controlled office login/read/write/heartbeat scenario, then deliberate low-volume test-user overflow in staging. Never flood production. Default account count remains all attempts, including successful logins; do not repeatedly log the same account in during verification.

All workers must run the same revision/config: versioned new quota keys differ from old keys. Do not leave old/new workers indefinitely mixed; use normal bounded rolling replacement/drain. Old adaptive keys expire within their existing window+grace; old route keys within their existing TTL. No manual flush is needed. Roll back matching app assets/backend and any reviewed Nginx changes together if needed; this restores previous small shared-IP behavior, so monitor for renewed NAT failures. Preserve Redis, credentials and database data on rollback.

## 20. Out-of-scope findings

Active Nginx/source/runtime evidence is now supplied; no runtime checksum or per-request historical upstream logs were included. Other expensive-operation guards and WebSocket limits are deliberately preserved, including actual import/WS limits that differ from the fresh-install example. No unrelated dependency upgrades, UI redesign, database migration, Billing calculation, Collection matching or permission changes.

## 21. Scope audit

Final diff reviewed by root with independent auth/Redis/frontend/login audits. No business formula, matching, amount, Target/Balance, private dataset, Settings/RBAC schema or account-management behavior changed. Billing/AI changes only supply metadata/headers for already-rejected429 responses; guard decisions and response bodies are regression-tested unchanged. No migration, dependency upgrade, production IP, `.env`, token or temporary debug log is included. Test artifacts are ignored. CI adds only isolated Redis verification and the focused security tests that were not included in prior globbed suites.

## 22. Final verdict

PENDING RELEASE REVERIFICATION — The [main CI run for `7707120f`](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34369781799) passed, including its mandatory live Redis concurrency step. The active Nginx 429 producer covering `/api/me` is identified and deployment-specific edits are documented. [Release Verification 34371975746](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34371975746) subsequently failed only when its final monitor process attempted the sixth login for the same account within the strict five/15-minute window.

The follow-up shares the backup drill's existing authenticated in-memory HTTP client with the monitor snapshot, retaining both checks and finally cleanup/logout. Standalone monitoring is unchanged; no token files, quota changes, counter resets or skipped failures are introduced. A timeout-retried UI smoke respects the remaining account window before the drill. See handoff section 17 for tests and next steps. The user authorized commit/push of this follow-up on 2026-09-10; confirm publication using Git. Hosted Release Verification still needs a scheduled or separately authorized run on the exact new SHA. No workflow dispatch or production deployment/reload is authorized.
