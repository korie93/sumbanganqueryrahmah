# SQR 429 NAT-aware fix — continuation handoff

Status: NAT patch `7707120f` is published and its main CI, including live Redis, passed. Release Verification then exposed an orchestration-only sixth-login failure; the follow-up is described in section 17 and awaits hosted reverification. The user authorized commit/push of this follow-up on 2026-09-10. Workflow dispatch and production deployment/reload remain outside that authorization. Full 22-part report: [SQR 429 report](docs/SQR_429_NAT_AWARE_RATE_LIMIT_REPORT.md). Deployment-specific instructions: [active Nginx rollout](docs/SQR_429_ACTIVE_NGINX_ROLLOUT.md).

## 1. Permanent goal

Fix frequent production 429 through verified per-user authenticated quotas, NAT-safe aggregate flood protection, strict anonymous/account/2FA/recovery/admin limits and shared Redis state. Audit every 429 producer, prove middleware ordering, test 20/50/100 shared-IP users, preserve all business/security rules, complete quality gates and deployment/rollback report. Uploaded source: `C:\Users\Administrator\Downloads\CODEX_GPT_6_ASTRA_ULTRA_SQR_429_NAT_AWARE_RATE_LIMIT_PRODUCTION_FIX.md` (user explicitly authorized implementation).

## 2. Production symptom

Many unrelated endpoints return 429 behind a shared office NAT. Do not hardcode any observed production IP. On 2026-09-09 the user supplied active `nginx -T` in `C:\Users\Administrator\Downloads\nginx-active-sanitized.txt` and source/runtime output in `C:\Users\Administrator\.codex\attachments\31806995-695d-4180-9665-593640c39370\pasted-text.txt`. Both have been fully reviewed. Active `/api/` has a shared-IP 30/minute rate, burst 100, connection cap 80 and explicit request/connection status 429. This includes `/api/me` before its app exemption. Login aliases share 10/minute, burst 5 and connection cap 10, also explicit 429. The active edge producer is identified; no need to request these same artifacts again. Correlated logs were not supplied, so individual historical events cannot be assigned conclusively to a layer.

Server checkout is clean `main` at `252d8d9d3bacf3bb4ef6ac839856d0122fa6c85a`. PM2 is online from `sqr-runtime/current`, resolving to `sqr-1.0.0-252d8d9d3bac-20260909T051334Z`. Release naming corroborates the baseline revision, not binary checksum attestation. The local NAT fix is not deployed. No production access or mutation has occurred.

## 3. Repository state

Branch `main`, implementation baseline `252d8d9d3bacf3bb4ef6ac839856d0122fa6c85a`. The original 46-file NAT patch was committed/pushed as `7707120fd6ebc6c5a94a6d6112bd09efbb88ce51`; working tree was clean before the nine-file release follow-up in section 17. Run `git status`, `git log -1` and inspect the matching CI run for authoritative publication/verification state; do not infer deployment from a Git push.

## 4. Root causes

- Real pipeline test proved `req.user` undefined at adaptive; full route authentication runs later.
- Adaptive always enforced small shared-IP quota even if user existed. Baseline NAT tests failed for 20/50/100 users in every mode (`artifacts/nat-429-before.log`).
- Login network quota was 5/15 minutes; sixth distinct account blocked. Account quota also included mutable IP/browser fingerprint.
- Frontend Retry-After was capped downward and negatively jittered; six deterministic regressions failed before fix.
- Checked-in Nginx example separately limited normal API to 30/min+20 burst and login 10/min+5 burst, with default 503 rejection. Supplied active config instead uses API 30/min+100 burst/80 connections and explicit 429; login 10/min+5 burst/10 connections is also explicit 429. Active split files and forwarded headers were reviewed. Preserve deployment-specific import/telemetry/WS controls and Certbot settings; do not replace the installation with the generic template.
- Redis express store silently fell back to independent worker-local quotas on errors. Corrected to fail closed, essential because login delegates the tiny adaptive pre-auth quota to its mandatory route guards.
- Other producers: route-specific express limiters/cooldowns, AI queue gate, operations-debug limiter and Billing export guard. System protection emits 503 only; monitoring merely counts 429.

## 5–6. Before / after

Before: CSRF → small adaptive IP quota (+ user only when prepopulated) → system guard → route authentication.

After: CSRF → request-local verified signed JWT quota identity (never sets `req.user`) → user scope/class quota → stable aggregate NAT flood guard → system guard → authoritative live route authentication. Same cryptographic verification reused once; revocation, DB/session/account/role checks, activity updates and refresh remain live and nonduplicated. Invalid JWT remains anonymous. A revoked but signed subject never grants access; full route auth rejects it.

User buckets use SHA-256 stable IDs, fixed scope + reads/writes/uploads. Read quota 84/10s, writes17/10s, uploads2/10s defaults. Receipt GET is a read, not an upload. Heavy routes retain tighter adaptive caps and circuit/concurrency gates. Blocked user attempts do not consume another user's aggregate allowance. Heartbeat is separate. Anonymous scopes remain strict. Exact POST login aliases use required account/network route limits; other auth paths are not exempted.

## 7. Files / ownership

- `server/internal/apiProtection.ts`, config types/schema/runtime, env examples, adaptive/NAT/config tests: root; implemented, focused tests pass.
- `server/auth/request-session-identity.ts`, guards, pipeline/runtime wiring, identity/pipeline/proxy tests: nat_auth_pipeline; complete, tests pass.
- `server/middleware/rate-limit.ts`, its tests, logger safe allowlist/tests: nat_route_limiters; complete, focused tests pass.
- `client/src/lib/api-client-retry.ts`, new retry tests, queryClient mutation tests: nat_frontend_redis_audit; complete.
- Redis store + Redis tests: nat_frontend_redis_audit; complete, deterministic tests pass.
- `deploy/nginx/sqr.conf.example`, mirrored Hetzner docs, nginx contract: root; adjusted normal API/login only, kept import/telemetry/WS controls; 12 contracts pass.
- Completed follow-ups: live Redis opt-in integration/required CI gate plus contract; header-only Retry-After metadata for existing AI/Billing429 and debug header tests. Root added CI execution of middleware/login/internal-AI/config tests not covered by prior test globs. Active evidence review added `docs/SQR_429_ACTIVE_NGINX_ROLLOUT.md` with targeted edits to the three existing server files. All 46 current files belong to this task; no running agents/processes required to resume.

## 8. Configuration

- `SQR_RATE_LIMIT_AUTHENTICATED_IP_REQUESTS_PER_MINUTE=120000` (600..6000000), fixed 20000/10s combined authenticated network guard, not reduced by runtime mode.
- `SQR_RATE_LIMIT_LOGIN_IP_ATTEMPTS_PER_15_MINUTES=500` (100..100000), strict account5/15m unchanged.
- Default aggregate capacity accommodates measured 100-user startup load with headroom; configurable numeric thresholds, no office-count inference/hardcoded IP.
- Nginx example API200r/s burst2000/conn1000; login10r/s burst100/conn200. Explicit values require deployment tuning, NOT env interpolation. The fresh-install example keeps its prior import30r/m burst20/conn20. The actual deployment is stricter: preserve import10r/m burst5/conn3, WS30r/m burst20/conn20 and telemetry60r/m burst20/conn10. Follow the active-install guide, not wholesale template replacement.
- Narrow trusted proxies unchanged. No database migration.

## 9. Redis

Healthy production stores preserve atomic Lua increments, stable hashed namespaced keys and expiry. Configured Redis failures now produce safe503 + Retry-After5 instead of granting memory quotas. Deterministic shared-backend tests verify four-worker counts, isolation, expiry and failure recovery. No live Redis daemon/CLI/Docker/WSL is installed locally, but the mandatory live Redis concurrency step passed in [CI run 34369781799](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34369781799/job/102527724116) on the exact published NAT SHA. This external blocker is resolved. No Redis flush or production mutation performed.

## 10. Frontend

Retry-After is minimum; delays longer than bounded client budget return original response without automatic retry. Within budget, nonnegative jitter and exponential backoff. Writes/login/heartbeat remain non-retrying. Dashboard/prefetch share query keys; hidden polling disabled, heartbeat single-flight. No proven polling loop beyond Retry-After bug; no UI redesign.

## 11. Tests so far

- `artifacts/nat-429-adaptive.log`: 36 pass, all modes20/50/100, user read/write/upload isolation, anonymous/flood/expiry/heavy gates.
- `artifacts/nat-auth-pipeline-focused.log`: 24 pass; real HTTP pipeline + real auth guards over counted storage doubles, 200/500/1000 responses for20/50/100 users across10 representative endpoint paths. Endpoint handlers are stubs, not business E2E.
- `artifacts/nat-auth-pipeline-refresh.log`:1 pass, JWT verify/revocation/DB/touch/refresh each once.
- `artifacts/nat-429-frontend-redis-focused.log`:51 pass, zero skips; focused lint pass.
- Route/logger/authlogin focused agent verification45 pass (agent output; gather unified log before final).
- `artifacts/nat-429-nginx-contract.log`:12 pass.
- `artifacts/nat-429-auth-regression.log`:135 pass.
- `artifacts/nat-429-typecheck.log`:pass; `artifacts/nat-429-lint.log`:pass (before follow-up header/CI edits).
- FullHTTP finished366pass0skip (`nat-429-http-regression.log`), before optional liveRedis test addition.
- Fullclient1548pass0skip (`nat-429-client-regression.log`); fullscripts401pass0skip before one new CI contract (`nat-429-scripts-regression.log`).
- Fullroutes470pass0skip (`nat-429-routes-regression.log`); fulllib/services600pass0skip (`nat-429-services-regression.log`).
- Security256pass0skip (`nat-429-security-regression.log`); coverage gate317pass,86.78%lines/73.57%branches (`nat-429-coverage.log`).
- FinalCI security focused69pass (`nat-429-ci-security-focused.log`); finalNginx/liveCI contracts13pass (`nat-429-final-deploy-contracts.log`).
- Finaltypecheck/lint pass (`nat-429-final-typecheck.log`, `nat-429-final-lint.log`). Secret/hygiene/server-env/diff guards pass.
- After the 2026-09-09 active-evidence documentation update, the Nginx/live-CI contracts were rerun: 13 passed, 0 skipped. Changed-file secret guard and `git diff --check` also passed. No application code changed in that evidence-review turn.
- New liveRedis test: optional withoutURL skips; REQUIREDwithoutURL deliberately fails explicitassert (`nat-live-redis-required-guard.log`). Configured realRedis still unexecuted. CI provisionsRedis7 and mandates run. Do not pass these test-only SQR_*flags to fullsuite/app; isolated test consumes them before runtime imports.

## 12. Build

Current build PASS: `sqr-1.0.0-252d8d9d3bac-20260909T130954Z` dirtysource; production sourcemaps0 and bundlebudgets pass. Logs `artifacts/nat-429-build.log`, `nat-429-bundle-budgets.log`. All command sessions have completed; do not poll old handles.

## 13. Exact next actions

1. Read this handoff/report, inspect actual git state. Do not repeat completed suites unless code changes.
2. Active Nginx and source/runtime evidence are already reviewed; the edge producer covering `/api/me` is identified. Follow `docs/SQR_429_ACTIVE_NGINX_ROLLOUT.md` for the exact three active files and preserved controls. No further producer-identification blocker remains; optional correlated logs can attribute individual historical events.
3. Live Redis passed for `7707120f`; do not keep treating it as unexecuted. Section 17's follow-up is locally verified and commit/push is authorized. Inspect the new CI run, then a scheduled or separately authorized Release Verification for that exact new SHA. Never use production Redis for integration tests.
4. Validate reviewed active Nginx changes with `nginx -t` in its actual environment before any separately authorized reload/deploy. No local liveNginx available, only contracts passed.
5. Resolve any evidence-backed remaining defect in scope, rerun affected gates, update report/handoff/goal. Do not declare COMPLETE until required live Redis verification passes. Clearly distinguish local implementation verification from operator-side deployment and production validation.

## 14. Do not repeat

Do not redo initial root-cause audit or baseline reproductions. Do not reset/discard work, deploy/reload production, log `.env` or credentials, install global OS tooling without need, load-test production, disable Redis/security, or change Billing formulas/Collection/RBAC. Commit/push of the section 17 follow-up is now authorized, without workflow dispatch or production action. No force push. Use apply_patch; node PATH `C:\Program Files\nodejs`; heavy suites sequential on this low-memory Windows host.

## 15. Scope lock

Rate-limit identity/quota behavior, 429 response handling, directly proven retry bug, deployment example alignment and verification only. No database schema/business changes. AI/Billing follow-up permits response headers only, not calculation/eligibility/export behavior.

## 16. Definition of done

- [x] Repository 429 producers and auth ordering identified; before-fix reproduced.
- [x] User-aware NAT architecture, anonymous/network/account limits and runtime interactions tested.
- [x] No duplicate auth side effects, spoofing/security regressions,20/50/100 real HTTP middleware tests.
- [x] Redis shared contract/failure handling, strict2FA/recovery/admin and frontend retry tests.
- [x] Config validation and Nginx example contracts.
- [x] Live Redis verification / required CI test passed for `7707120f`.
- [x] All available relevant regressions and final typecheck/lint/build complete.
- [x] Final22-part report and diff/secret audit, with explicit external blockers.
- [x] Active edge 429 producer covering `/api/me` identified from actual deployment evidence; historical per-request attribution remains unproven without correlated logs.
- [ ] Release orchestration follow-up published and Release Verification rerun successfully.

Do not mark COMPLETE while unchecked requirements remain.

## 17. Release Verification follow-up (2026-09-10 local time)

[Run 34371975746](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34371975746/job/102535195576) failed on `7707120f` at the final `monitor:stale-conflicts` login: HTTP 429 `AUTH_RATE_LIMITED`, retryAfterMs 900000. All earlier gates, UI smoke, SQL performance probes and backup drill passed. Local evidence: ignored `artifacts/release-34371975746-job.log`, lines 6584 onward.

The same account logged in six times within roughly three minutes: preflight, visual, accessibility, UI smoke, backup drill, monitor. The strict five/account/15-minute guard intentionally counts successful attempts too. Main CI lacks the final drill/monitor pair and passed, including live Redis and CodeQL. Do not relax account/IP quotas, change fingerprints, reset counters or suppress monitor failures.

Local fix extracts snapshot collection into `scripts/lib/stale-conflict-monitor.mjs`. Standalone monitor retains login/loop/logout. Optional `DRILL_MONITOR_OUTPUT_FILE` makes the drill call the same snapshot helper with its existing in-memory authenticated request before backup cleanup/logout; failures still fail the gate. Release passes the mandatory artifact path to the drill and no longer starts a sixth login process. Normal flow uses five logins. If UI smoke needed its one timeout retry, readiness waits out the remaining account window (anchored conservatively after preflight) before the drill. No token sharing through files, arguments or environment. Snapshot now precedes deletion of the temporary drill backup, so that deletion is not included in its counters. The release snapshot deliberately targets the same app/account as the drill; separate MONITOR overrides remain for standalone use.

Regression coverage: CLI fixture with a five-login cap, authenticated cookies and CSRF; required snapshot failure preserves nonzero exit plus cleanup/logout; optional feature off; standalone monitor behavior; unavailable-role diagnostics; release wiring and retry-window contracts. Completed checks:

- `npm run test:scripts`: 409 passed (358 JavaScript + 51 TypeScript), 0 failed/skipped; `artifacts/release-34371975746-scripts-regression.log`.
- `node --import tsx --test server/middleware/tests/rate-limit.test.ts`: 30 passed, 0 failed/skipped; `artifacts/release-34371975746-account-limit-regression.log`.
- Syntax checks for all four changed/new runtime scripts, repository hygiene, secret scan, changed-file secret guard and `git diff --check`: passed. Independent read-only implementation review found no blocking issues.

This follow-up has nine changed/new files and no backend/frontend runtime changes. Do not rerun the entire prior NAT implementation suites unless code changes. Commit/push is authorized; use Git and matching workflow results to confirm its publication state. Hosted Release Verification still needs a scheduled or separately authorized run on the exact new SHA; it has not yet verified this follow-up. No production action performed.
