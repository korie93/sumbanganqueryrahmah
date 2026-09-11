# SQR 429 NAT-aware fix — continuation handoff

Latest status (2026-09-11): user explicitly agreed ("saya setuju", then "sambung") to isolated30account simulation replacing the original30physicalstaff acceptance requirement. Section24 supersedes the pending physical-staff coordination instructions below; do not claim simulated success before an actual fullstack run. Deployed application remains `62cbe7aa20390ddd87ece97c41b1424b8c9154a4`; completed release/production and disk cleanup evidence is in sections21–22. Real daytime observation:2365requests on the formerly rejected network,0edge/upstream429 and0HTTP5xx, with only5distinctaccounts across the day's recorded networks; other403/499 and latency caveats remain in section23. Full report: [SQR 429 report](docs/SQR_429_NAT_AWARE_RATE_LIMIT_REPORT.md). Deployment instructions: [active Nginx rollout](docs/SQR_429_ACTIVE_NGINX_ROLLOUT.md).

## 1. Permanent goal

Fix frequent production 429 through verified per-user authenticated quotas, NAT-safe aggregate flood protection, strict anonymous/account/2FA/recovery/admin limits and shared Redis state. Audit every 429 producer, prove middleware ordering, test 20/50/100 shared-IP users, preserve all business/security rules, complete quality gates and deployment/rollback report. Uploaded source: `C:\Users\Administrator\Downloads\CODEX_GPT_6_ASTRA_ULTRA_SQR_429_NAT_AWARE_RATE_LIMIT_PRODUCTION_FIX.md` (user explicitly authorized implementation).

Expanded source approved on 2026-09-10: `C:\Users\Administrator\Downloads\CODEX_GPT_6_ASTRA_ULTRA_SQR_429_NGINX_SQR_API_PER_IP_CONFIRMED_ROOT_CAUSE_FIX.md`. The goal now explicitly includes 30 users, actual Nginx backups/validation/reload, exact verified production SHA, resource-aware edge sizing, rollback and real shared-NAT office evidence. Do not mark complete on local tests or Git push alone.

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

Do not redo initial root-cause audit or baseline reproductions. Do not reset/discard work, log `.env` or credentials, install global OS tooling without need, flood production, disable Redis/security, or change Billing formulas/Collection/RBAC. The expanded production scope is authorized, but require verified access/target, safe backups, successful gates and resource-aware settings before remote changes. Do not bypass SSH host-key verification or GitHub production approval. No force push. Use apply_patch; node PATH `C:\Program Files\nodejs`; heavy suites sequential on this low-memory Windows host.

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
- [x] Release orchestration follow-up `6cbada45` published; Release Verification 34413870959 succeeded.
- [x] Additional authenticated Search and WebSocket corrections published, verified and deployed as `62cbe7aa`.
- [x] Active Nginx correction backed up, syntax-validated and reloaded on the confirmed server.
- [ ] Real 30-person shared-NAT workflows, including WebSocket behavior, verified with edge/upstream logs and resource observations.

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

## 18. Confirmed Nginx production follow-up (current)

- User-supplied access-log excerpts show `status=429 upstream_status=-` without an upstream address/time. Error-log excerpts identify `excess: 100.xxx by zone "sqr_api_per_ip"`, matching the active 30/minute, burst 100 bucket. This identifies the sampled rejection mechanism; it does not measure all successful traffic or server capacity. Keep the office IP in the original private attachment, not a hardcoded allowlist.
- Local branch/starting HEAD: `main`, `6cbada4599dd0665e9b47634bbfd9195555af46c`, initially clean. [CI 34412882822](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34412882822), CodeQL and [Release Verification 34413870959](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34413870959) passed. The production-approval job passed and artifact `production-release-6cbada4599dd0665e9b47634bbfd9195555af46c` (id 10128508855) exists.
- Read-only production `/api/health/version` on 2026-09-10 returned status ok, SHA `6cbada4599dd0665e9b47634bbfd9195555af46c`, release ID `sqr-1.0.0-6cbada4599dd-20260909T225140Z`, builtAt `2026-09-09T22:51:40.131Z`. The agent did not deploy it. Present PM2 paths/status and Redis/DB health are not independently inspected. Do not redeploy the identical app merely for an Nginx change.
- New Search regression: route-level `searchRateLimiter` still used one IP bucket after authentication. Thirty users each making one search produced 10 successes and 20 `SEARCH_RATE_LIMITED` 429s before correction. The minimal fix uses SHA-256 of server-assigned `req.user.userId`; fallback is normalized IP. Cap remains 10/10 seconds, shared store/fail-closed behavior unchanged. All search/import-read/source-match consumers were traced after full auth and authorization. This fix is not in the production `6cbada45` release yet.
- Changes: three NAT test files now include 20/30/50/100; Search key and four regressions in `server/middleware/rate-limit.ts` and its test; new `deploy/nginx/sqr-429-debug-format.conf.example`; Nginx diagnostic contract test; updated runbook/report/handoff. Existing business/DB/frontend rules and heavy import limits are untouched.
- New focused results: 36 adaptive/real-HTTP pipeline tests passed, including 300 requests from 30 users (fixture storage/stub endpoint handlers, not production load testing). Middleware tests: 34 passed including Search red/green, abuse isolation, anonymous spoof resistance, IPv6, login/2FA/recovery/admin and Redis failures. Nginx/live-CI contracts: 14 passed. Newly extended 30-user live Redis case has not run locally; earlier matrices passed real CI Redis.
- Final local gates passed: 100 middleware/Search/import-read/permission-matrix tests (`artifacts/nginx-confirmed-route-regressions.log`), 410 script tests (359 JS + 51 TS; `artifacts/nginx-confirmed-scripts-regressions.log`), typecheck, full client/server lint, build and bundle budgets (`artifacts/nginx-confirmed-{typecheck,lint,build,bundle-budgets}.log`). Test counts overlap the focused suites above; do not sum them as unique tests. Build `sqr-1.0.0-6cbada4599dd-20260910T090545Z` has dirty local source and zero production source maps: it is verification output, not an approved immutable deployment artifact. All command sessions completed; no heavy-suite rerun is needed unless relevant code changes.
- The active diagnostic format's `$request` includes query strings. The new example retains `sqr_429_debug`, its conditional 429 logging, upstream fields and adds limiter outcomes while logging method + `$uri` + protocol instead. Back up and replace the existing HTTP include, not append duplicate declarations. No production logging was changed.
- Capacity caveats: candidate API 200/s, burst 2000/conn 1000 are model ceilings, not proven server capacity. Thirty users x ten startup calls = 300; over ten seconds this is 30/s. Validate ordinary rates, bursts, p95 latency, CPU/RAM, worker/fd/socket limits first. Snapshot `worker_connections 768` and PM2 heap 600 MB do not prove sufficient capacity. WS cap 20/IP cannot support 30 simultaneous single-tab sockets. API/login/telemetry also share one connection zone. These require live inspection and bounded settings; no WS/telemetry values changed yet.
- Access blocker: Windows OpenSSH exists, but `C:\Users\Administrator\.ssh` contains no configured credentials/config, no system SSH host configuration was found, and `ssh-add -l` reports no agent. No SSH session, remote write, Nginx test/reload or production load test was attempted. User was asked for host/alias, port, username and a secure access method or operator-assisted terminal execution; never request pasted passwords/private keys.
- Next: publish/build a verified release for the Search correction; establish exact SSH target/key/host fingerprint or operator-assisted execution. Inspect current/previous runtime paths, filtered PM2 fields, active Nginx configuration and resource/traffic evidence. Follow the active-install guide for collision-safe out-of-include backups, reviewed edits, per-file `nginx -t`, final reload and explicit rollback (validation failures exit nonzero). Deploy only an approved exact-SHA immutable artifact when needed; do not bypass public/local health or provenance checks. Observe real office use and distinguish edge from upstream 429 before claiming completion.

No production file has been changed by this session. There are no post-change office counts to report yet. Production backup paths and exact old/current runtime targets must be recorded on the actual server before changing them; do not invent them from a release name.

Continuation access recheck (2026-09-10): the same missing-access blocker persisted across three goal turns. The user SSH directory/config and system SSH config remain absent, and `ssh-add -l` still reports no agent. No new host/port/user or operator-terminal response was supplied. The ten task-owned modified/new files remain uncommitted; no remote action was attempted. The goal is blocked, not complete. Resume from this section once secure production access or operator-assisted execution is available; do not repeat the completed local suites without relevant code changes.

Target-discovery update (historical; see confirmed access status below): the user subsequently supplied the production IP, account `deploy`, hostname `vultr` and SSH port 22. A fresh DNS lookup confirms `sqr-system.com` resolves to the supplied IP; public version remains `6cbada4599dd0665e9b47634bbfd9195555af46c`. The SSH service is reachable. Windows OpenSSH 9.5 keyscan failed its KEX negotiation; the already-installed Git OpenSSH keyscan succeeded without authentication. It observed an ED25519 fingerprint `SHA256:jfa6vi4Q2cuIh+HAopt4hsHQ4ieBrlcDduYy1N/Z4kc`. At this stage it was only an untrusted network observation. The private-key path supplied belongs to Termux and is not a local Windows key. No password/passphrase was sent to the server, written into files or copied into this handoff. Credentials disclosed in the conversation should be rotated securely; do not reproduce them or change them without coordinating access recovery with the user.

Confirmed access status (latest): the user supplied trusted server-terminal output for `/etc/ssh/ssh_host_ed25519_key.pub`, matching `SHA256:jfa6vi4Q2cuIh+HAopt4hsHQ4ieBrlcDduYy1N/Z4kc`. Root compared a fresh scanned public key against that fingerprint and pinned it in `C:\Users\Administrator\.ssh\known_hosts_sqr`, outside the repository. A single strict-host-checked SSH attempt for `deploy` was rejected with `Permission denied (publickey)` before any password prompt or remote command. Do not enable password authentication or ask for the Termux private key.

A temporary ED25519 client key was generated at `C:\Users\Administrator\.ssh\sqr_nat_codex_20260910_ed25519` (public sibling `.pub`); private-file ACL inheritance was removed and the resulting ACL was verified to allow only the current Windows identity, SYSTEM and Administrators. The private key stays on this machine, outside Git; do not print, commit or copy it into chat. Public fingerprint: `SHA256:Wl/5WuggEA51UT6iWbiE7gyqEjo1Jllq997EYKEyvtU`. The user is being asked to append this public authorization line to `/home/deploy/.ssh/authorized_keys`, preserving existing keys:

```text
restrict,pty,expiry-time="20260912000000Z" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPy6TetcqNgU04Zukf5pbZCuugSbfVw4g+J59te1LvO8 sqr-nat-codex-temp-20260910
```

This allows the required shell/PTY but disables agent/port/X11 forwarding and user rc; authorization expires on 2026-09-12 at 00:00 UTC (08:00 Malaysia), per OpenSSH authorized-key options. Do not assume installation from intent: wait for the user's confirmation, then use Git OpenSSH with the explicit private identity, `IdentitiesOnly=yes`, `StrictHostKeyChecking=yes`, `HostKeyAlgorithms=ssh-ed25519` and `UserKnownHostsFile=C:/Users/Administrator/.ssh/known_hosts_sqr`. No authenticated session, production file change, Nginx test/reload or deployment has happened yet. Remove only this temporary authorization line and local key after the task/access need ends, preserving the user's existing keys.

Independent fresh release preflight confirms local HEAD and remote main remain `6cbada45`, with CI, CodeQL and Release Verification successful; all ten follow-up files remain uncommitted. The existing approved artifact predates the Search fix. After publication, check both exact-SHA CI (including required live Redis with 30 users) and a workflow-dispatched Release Verification; scheduled verification does not publish deployment artifacts, and Release Verification alone does not prove the live Redis CI gate. Use only the successful production-approved `production-release-<new-SHA>` artifact and its SHA-512 sidecar, with expected-SHA and public-health deployment gates. No workflow changes are needed.

Public-key access recheck: one noninteractive login probe with the explicit temporary identity, strict pinned host verification and remote command `id -un` returned `Permission denied (publickey)`. No remote command ran. A subsequent local-only `ssh -G` check confirmed the intended account/host/port, identity path, `IdentitiesOnly=yes`, batch mode and pinned known-hosts path; the private key still exists. No user installation confirmation/error output has arrived. This access blocker has persisted across three goal turns, so the goal is blocked pending key installation or operator-assisted access. Do not repeatedly probe SSH or infer installation from an automatic goal continuation. No production changes have occurred.

## 19. Authenticated production work (authoritative current state)

The user confirmed two identical temporary public-key lines in authorized_keys. SSH then succeeded as `deploy` on `vultr`; host verification remains strict with the verified ED25519 pin. Sudo was authenticated interactively with echo disabled at the password prompt; no credential was saved to repository, scripts or handoff. No SSH/password policy was weakened. Temporary-key duplicates will be removed only when access is no longer needed. SSH session 54438 later disappeared; its handle was confirmed missing, not merely timed out. Replacement session 21143 is a live sudo-capable shell at this checkpoint; revalidate before using it. Send individual newline-terminated commands rather than assuming pasted multi-command input all ran.

Live preflight evidence:

- Production source checkout is clean `main` at `6cbada4599dd0665e9b47634bbfd9195555af46c`.
- Current runtime: `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-6cbada4599dd-20260909T225140Z`; previous: `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-252d8d9d3bac-20260909T051334Z`.
- PM2 `sqr` online, PID 66801, script `/home/deploy/apps/sqr-runtime/current/dist-local/server/cluster-local.js`, cwd `/home/deploy/apps/sqr-runtime/current`, fork mode, one Node process; observed RSS about 239 MB, CPU 1.4–1.8%, historical restart count 72 (not evidence of a current restart loop).
- 2 vCPU, 3910 MiB RAM, about 2002 MiB available, 80 MiB swap used, load 0.07/0.05/0.00. Nginx 2 workers with 768 connections each, service LimitNOFILE 524288. These quiet-time observations are not load-capacity proof.
- Node listens only on `127.0.0.1:5000`. Selected nonsecret runtime fields confirm `TRUSTED_PROXIES=127.0.0.1/32`, `SQR_MAX_WORKERS=1`, `PG_MAX_CONNECTIONS=10`, `SQR_RATE_LIMIT_STORE=redis`. Existing Node CA path is `/home/deploy/apps/sumbanganqueryrahmah/.runtime/redis-ca.crt`; preserve it. Local/public readiness return `{status:ok,ready:true}`; version matches current SHA. Redis credentials were not printed and no integration tests use production Redis.
- `nginx -T` confirms old API/auth/WS/telemetry quotas and exact includes, plus `sites-enabled/sqr-system` resolving to `sites-available/sqr-system`. All baseline `nginx -t` calls passed.
- Count-only parsing found 1334 debug 429 entries, all `upstream_status=-`, all one hashed source, from 16:18:00 through 18:59:11 +0800. Error log has 1334 `sqr_api_per_ip` rejections. Endpoints include six analytics routes, tab visibility, maintenance, heartbeat, app-config, Collection and Search. The HTTPS site's conditional-only access_log overrides inherited access logging, so existing ordinary access.log is not a complete SQR successful-traffic denominator.

Production changes performed (diagnostics only):

1. Backed up `/etc/nginx/conf.d/sqr-429-debug-format.conf` and `/etc/nginx/sites-available/sqr-system` under `/etc/nginx/backups/sqr-nat-diagnostics-20260910T124820Z`.
2. Replaced the diagnostic format with the repo example (method + URI without query strings, upstream and limiter attribution). Added `sqr_log_nat_traffic` map for API, `/ws` and legacy telemetry, and a site-scoped `/var/log/nginx/sqr-nat-access.log` using that format. Existing 429 log remains enabled.
3. Validated after each file edit and reloaded successfully, then public readiness passed. API/login/WS/telemetry admission values remain unchanged. Log file permission is 0640 www-data:adm; existing `/etc/logrotate.d/nginx` covers `*.log`, daily, 14 rotations with compression.
4. The initial attempt at 12:47:51 UTC safely restored both files and reloaded the baseline after its assertion detected the empty log that `nginx -t` itself created. Corrected the one-off script to preserve log contents rather than assert absence. That earlier backup also remains under `sqr-nat-diagnostics-20260910T124751Z`. No invalid configuration was reloaded and no log contents were removed.
5. Final debug-file SHA256 `375db68a9968508737dc7454809026aa8418981432b6141e75367fa85f34ed37`; site SHA256 `1728f3536f8fb1431fa853bf0054afe79377f3516f93f9d2698e1979c0d5788a`.

Exact diagnostics rollback (only if these remain the intended targets; later admission changes require their own backups):

```bash
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-diagnostics-20260910T124820Z/sqr-429-debug-format.conf /etc/nginx/conf.d/sqr-429-debug-format.conf
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-diagnostics-20260910T124820Z/sqr-system /etc/nginx/sites-available/sqr-system
sudo nginx -t && sudo systemctl reload nginx
```

The one-off deployment helper and source example are staged under `/home/deploy/sqr-nat-preflight-20260910/`; local helper `artifacts/sqr-nat-diagnostics-stage.py` is ignored. Do not blindly rerun it (it deliberately requires the old site marker). No application deployment/commit/push has occurred yet. The example/contract changed; 13 Nginx tests passed afterward.

New required WebSocket fix: production wiring leaves app defaults at 20 connections/IP and 30 upgrades/IP/minute, independently blocking 30 staff even if Nginx changes. Agent `ws_nat_fix` owns focused `server/ws` implementation/tests: aggregate cap200, aggregate600 upgrades/IP/minute, strict anonymous30/IP, signed-activity30/minute before async auth, DB-user30/minute after active/revocation checks, per-user5 unchanged and bounded pending activity reservations. Root must review and verify before publication. Existing WS forwarding accepts first XFF; live Nginx appends client input, so the single-edge WS snippet must overwrite XFF with `$remote_addr` while retaining loopback-only origin and narrow trusted proxy.

Next: finish WS review/tests; choose resource-aware edge bounds using code-derived baseline plus live observations; back up each additional exact active file, validate after every change, reload only valid config. Publish/verify/deploy a new approved Search+WS SHA with both CI/live Redis and Release Verification gates. Current new access log has only a health probe, so no office or latency/capacity success is claimed. User was asked to arrange real 30-person office use and a verification window. Preserve full acceptance scope; do not mark complete until actual shared-NAT behavior and remaining abuse controls are proven.

### Edge rollout and final local gates (latest checkpoint)

The five admission files were changed at **2026-09-10 13:29:31 UTC / 21:29:31 Malaysia** after an exact-string, count-checked dry-run diff. Backup: `/etc/nginx/backups/sqr-nat-edge-20260910T132931Z` (zones.conf, api.conf, site.conf, ws.conf, telemetry.conf). Every edit passed `nginx -t`, final validation/reload/is-active passed, and public/local readiness stayed healthy. Application version is still `6cbada45`, not the uncommitted Search/WS patch. Active values: API100/s burst300 cap240; auth5/s burst100 cap40 in separate auth connection zone; WS10/s burst100 cap200 with XFF overwritten to `$remote_addr`; telemetry5/s burst100 cap20 in separate telemetry connection zone. Imports10/min burst5 cap3, certs, proxy timeouts, Redis/auth/business controls are unchanged. `sqr-nat-edge-stage.py` is an ignored, exact-state one-off helper under local artifacts and remote preflight folder; do not blindly rerun it.

The ceilings are a monitored starting policy, not measured capacity. Code-derived 30-user Dashboard load is about7/s, plus maintenance up to2/s and activity heartbeat around0.5/s. The100/s API ceiling accommodates a model of100users x10startup calls over10seconds; burst300 is3seconds of excess refill, not a guaranteed1000simultaneousburst. Connection counts are defense ceilings, not performance guarantees. Global sockets, otherIPs, keepalives, slow queries and worker imbalance still matter. At21:30MY the added access log contained only health/version probes (200, upstream5–6ms), noofficeusage. Serverload0.03/0.02/0.00, RAMavailable1992MiB. User's30staffacceptancewindowstillunprovided.

Final local verification: typecheck, fullclient/serverlint, all106WS tests, build and bundlebudgets passed. Build `sqr-1.0.0-6cbada4599dd-20260910T132936Z` is dirtysourceverificationonly, zero source maps. Logs `artifacts/nat-live-followup-{typecheck,lint,ws,build}.log`. The missing-user negative test fixture needed an explicit `unknown` assertion for TypeScript; no runtimebehavior changed. Nginx/liveRedisCI contracts14passed after diagnosticsupdate. EarlierSearch/routes100 andscripts410passed. Tests overlap; do notsumunique. Remainingapplicationgates: commit/push exactSHA, newCI/liveRedis, dispatchedReleaseVerification and approvedartifactdeployment. No need repeatheavycompletedchecks absentchanges.

Edge rollback restores only the five matched admission backups, preserving the earlier diagnostics improvement:

```bash
set -euo pipefail
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-edge-20260910T132931Z/zones.conf /etc/nginx/conf.d/sqr-telemetry-rate-limit.conf
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-edge-20260910T132931Z/api.conf /etc/nginx/snippets/sqr-api-throttle.conf
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-edge-20260910T132931Z/site.conf /etc/nginx/sites-available/sqr-system
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-edge-20260910T132931Z/ws.conf /etc/nginx/snippets/sqr-ws-throttle.conf
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-edge-20260910T132931Z/telemetry.conf /etc/nginx/snippets/sqr-web-vitals-telemetry.conf
sudo nginx -t
sudo systemctl reload nginx
```

SSH shell21143 and typecheck47277 were later confirmed missing; no restart was inferred merelyfromtimeout. Latest liveSSH shell76414 remains available atthischeckpoint; combinedtypecheck/lint/WS/buildsession89871 completedexit0. Revalidatehandleswhenresuming. Do not poll obsoletehandles. No secretsstored inGit/scripts; temporarykeyremovalremainsrequiredaftertaskaccessends.

## 20. Published application / release gate checkpoint (2026-09-10 14:36 UTC)

- Published on `main`: `62cbe7aa20390ddd87ece97c41b1424b8c9154a4`, `fix(rate-limit): isolate search and websocket NAT quotas` (15 task-owned files). Runtime Search/WS fixes are not deployed yet.
- [CI 34483780833](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34483780833) passed, including required live Redis with the added 30-user case, WebSocket tests, UI smoke, visual/accessibility and coverage. [CodeQL 34483780905](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34483780905) passed.
- [Dispatched Release Verification 34483782447](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34483782447), attempt 1, failed UI smoke at `scripts/ui-smoke.mjs:1551` waiting 15 seconds for `Collection direkodkan` after General Search. Manual settlement mutation, amounts and audit verification had passed. Browser was still `Searching...`, with no failed requests/console errors recorded. Trace shows one search aborted and its replacement pending without a response. Server logs show preceding PostgreSQL pool pressure/queued requests. This supports transient CI search latency, not a proven rate-limit regression or established root cause. Wrapper correctly did not retry exit 1 (only watchdog exit 124 is automatically retried); no test/limit was weakened.
- Same-SHA [scheduled Release Verification 34484489762](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34484489762) also passed, but scheduled runs do not publish approved deployment artifacts. Given that pass plus CI's browser pass, one bounded rerun of the dispatched run was submitted at 14:36 UTC. If the pending search repeats, investigate before another retry. Never bypass the production environment approval.
- Failed-run logs: ignored `artifacts/github-run-34483782447-logs/`; verified diagnostic archive `artifacts/diagnostics-10155047266.zip` and extracted sibling. Keep these for investigation; they are not release artifacts and must not be committed.
- Disk preflight at 14:37 UTC: 2,145,771,520 bytes available (98% used); current and previous immutable releases are about 419 MiB each. Recheck before installing the new archive and preserve operational headroom. Do not delete user data, old releases or unrelated caches without explicit approval.
- Required deployment environment: existing production `.env` and `.runtime` under `/home/deploy/apps/sumbanganqueryrahmah`, release root `/home/deploy/apps/sqr-runtime`, public base URL `https://sqr-system.com`, exact expected SHA above, and `NODE_EXTRA_CA_CERTS=/home/deploy/apps/sumbanganqueryrahmah/.runtime/redis-ca.crt` in the invoking environment. Use the verified immutable deployment script with approved archive/checksum, not a dirty local build or direct checkout replacement.
- Independent deployment review confirmed no dependency/migration/deployment-script changes between the old and new SHA. The active server's deploy script SHA256 matches the repository LF bytes: `670a6fb07400237d9beadd036264d6ae893bf42a63c35df3f7a3221c516d5270`. Preserve the mandatory public readiness gate: the existing local `verify_release` function is called inside `if !`, which can mask intermediate command failures if the final version check succeeds. Automatic rollback suppresses PM2 errors too. Independently verify local/public readiness, exact SHA and PM2 after success or rollback, and recheck after the default 60-second Redis monitor interval. Existing local health curls lack deadlines; observe deployment rather than launching it unattended. These are operational cautions, not changes made in this NAT patch.
- SSH shell 76414 was still working at this checkpoint, but its sudo timestamp expired. Reauthenticate only through the hidden interactive prompt when needed. Local artifact-download process 34530 is finished and its handle is gone; do not poll it. Read current run state rather than treating prior snapshots as current.
- The new production access log still contained only agent probes at the last observation. No real 30-staff success/429 rate, p95 latency, reconnect behavior or business workflow acceptance can be claimed. The user has been asked for an office verification window. Keep the goal incomplete until this acceptance is recorded.

## 21. Approved application deployed; actual office acceptance pending

Authoritative checkpoint: 2026-09-10 15:02 UTC / 23:02 Malaysia. The preceding goal work made concrete progress: the bounded release rerun passed, its approved artifact was verified and production promotion completed. No further code changes are needed based on the current evidence. Remaining real-office evidence is an external coordination requirement, not something fixture tests can substitute for.

### Release and integrity evidence

- [Dispatched run34483782447](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34483782447) attempt2 completed successfully, readiness job102914471506 and production approval job102917664717 both success. No environment approval bypass and no weakened test/limiter.
- Production artifact10157746180: `production-release-62cbe7aa20390ddd87ece97c41b1424b8c9154a4`,5394993bytes; GitHub/download SHA256 `7e72d10639f93608097aea9c32c1ec5c307f46d6ce74d7e2dc5b1d0e3ceea5f7`.
- Archive `sqr-release-62cbe7aa20390ddd87ece97c41b1424b8c9154a4.tar.gz`,5394347bytes; SHA512 `8a9a5063a9a0628397cb394f768eccb7ac267f63ebc8698cbf8af336f74d3cc10ea9de3eab14215f023d41025b890cfe9ae577af64338b6a3a8a2690e63e6937`. Verified locally and after SCP, then by the deploy script along with inventory/manifest checks.
- Manifest: schema1, version1.0.0, fullSHA62cbe7aa20390ddd87ece97c41b1424b8c9154a4, sourceDirty=false, builtAt2026-09-10T14:41:52.679Z, releaseId`sqr-1.0.0-62cbe7aa2039-20260910T144152Z`.
- Ignored local files: `artifacts/production-release-62cbe7aa20390ddd87ece97c41b1424b8c9154a4.zip`, extracted archive/checksum in `artifacts/approved-release-62cbe7aa/`. Server archive/checksum are in `/home/deploy/release-inbox/`. Never deploy diagnostics or a dirty local build.

### Production execution and verification

The existing verified immutable deploy script ran with all required environment values recorded in section20 (including existing Node CA, public gate and full expectedSHA). Exit0. `npm ci --omit=dev` installed589packages with0reported vulnerabilities; migration check passed; uploads copied0/preserved1342. No old release, user upload, credential or database row was deleted. PM2 process list was saved.

- Current: `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-62cbe7aa2039-20260910T144152Z`.
- Previous: `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-6cbada4599dd-20260909T225140Z`.
- Original source checkout remains6cbada45; immutable runtime is independently promoted, so no source pull is required for this deployment.
- PM2 `sqr` PID79803 online, startup14:58:52UTC, restartcounter73 (baseline72; this is the expected deployment restart), unstableRestarts0, RSS300765184bytes, CPU1.6%. Script/cwd still use `/home/deploy/apps/sqr-runtime/current`; existing Node CA confirmed in PM2 environment.
- One initial local connection attempt during restart failed and its built-in retry recovered. Independent local/public ready `{status:ok,ready:true}` and version/fullSHA passed at14:59UTC; Redis rate-limit endpoint PING=PONG and local readiness again at15:00UTC, after the default60second monitor interval. Public postdeploy root/securityheaders/live/ready/SHA passed. Its malformed login returned401; optional burst probe was deliberately not run against production.
- Post-restart log sample: no error/fatal events; warnings were HSTS preload disabled, JSON parse failure (also observed before this release), and the expected malformed-login401. Sensitive diagnostic context remained redacted. Do not enable HSTS preload or change unrelated parsing behavior merely to remove warnings.
- Final Nginx syntax and service-active checks passed at15:02UTC. Node still listens only127.0.0.1:5000. Attribution log totals10agentprobes,8HTTP200/2expected401, matching upstreamstatuses; edge_rate/edge_connection PASSED for all10. Conditional429 and Nginxerrorlogs unchanged since18:59:11Malaysia, before this rollout. This is not a30-person office denominator or load test.
- Disk1701093376bytesfree (99%used) after installation. RAMavailable1994MiB, swapused189MiB, load0.23/0.16/0.09. No further deployment or unrelated pruning should be inferred from this task; coordinate storage maintenance/expansion. The broad recursive read-only disk survey was stopped withCtrl-C when slow; no deletion occurred.

### Exact next actions / access cleanup

1. Obtain a specific real-office interval with30staff using their own accounts behind the sharedIP. Begin with a small group, then30; record Malaysia start/end times and participating count. Observe ordinary login, Dashboard, Search, heartbeat, existing normal Collection/Billing work and simultaneous WebSocket connections/reconnects. Do not create fake financial records or perform abuse floods on production.
2. Correlate API/ws totals, endpoint/status, edge/upstream429 and limiter outcomes, request/upstream p95 latency, PM2 CPU/RAM/restarts and database pressure for that actual interval. Existing tests prove20/30/50/100quota behavior but not production business/load acceptance. Distinguish intended individual-sensitive quotas and telemetry sampling from shared-network collisions.
3. Current rollback target is the exact6cbada45 path above. Use `deploy/immutable/rollback-release.sh` only if this remains `previous`, preserve `NODE_EXTRA_CA_CERTS`, and independently verify local/public readiness/fullSHA/PM2 after rollback. Nginx five-file admission and separate diagnostics backup/rollback remain recorded in section19 and the active rollout guide. Restoring old admission reinstates the known shared-NAT bottleneck.
4. SSH PTY76414 was alive at this checkpoint; revalidate before use. The scoped temporary key remains available for the outstanding verification and expires2026-09-12T00:00:00Z (08:00Malaysia). It has two identical authorization lines supplied by the user. After task access ends, remove only the exact task public-key lines/comment `sqr-nat-codex-temp-20260910`, preserving all other authorizations, then remove the corresponding local task key pair. Do not remove it prematurely while it is the only verified continuation access. Never reproduce private material or pasted credentials; coordinate secure credential rotation with the user.
5. The goal remains incomplete. If no real-office window is provided, report that precise external blocker; only mark blocked after the required repeated-turn audit, and never mark complete from this quiet sample. No need to rerun completed suites or redeploy identical code just to await office traffic.

## 22. User-authorized disk cleanup completed (2026-09-11 Malaysia)

The user explicitly requested server disk reclamation without affecting receipts/PDF, Excel, saved Collection or system data. Read-only inspection found45immutable releases, about56.7GB in protected PostgreSQL storage,0.294GB npm cache and1.3GB journals. Database/WAL/tablespaces, Redis persistence, logs/journals, backups, uploads, quarantine, import jobs, release archives, `.env` and `.runtime` were not cleanup targets.

Only `node_modules` directories in27historical releases built before2026-09-01UTC were removed. All18September releases retain complete dependency trees, including current62cbe7aa and previous6cbada45. All45releases retain their source/build files, manifests, package/lockfiles, vendor tarballs and data symlinks. Old July/August releases are no longer immediately runnable: reinstall their locked production dependencies before any deliberate reuse, subject to registry/toolchain availability. No entire release or user-data directory was deleted.

The reviewed plan was pinned by SHA256 `96ffedd44282938dd8f26cb2f97e68529426b8f605b00939c84f437cdfc8db5f`; canonical paths, manifests, cutoff, current/previous exclusions, mounted subtrees and process/saved PM2/systemd/cron references were checked. The existing deploy.lock was held through fresh preflight, protected snapshot, deletion and verification, then released. Root was used only for read-only process/config inspection; deletion ran as deploy with reduced CPU/I/O priority. No service restart, migration, SQL mutation, Redis flush or system configuration change was issued.

After the session interruption, oldSSH89128 was confirmed unavailable and a new strict-host-checked session8034 was established. The prior baseline was retained, a fresh preflight/snapshot completed and the target plan revalidated before deletion. The actual cleanup at about22:55–22:57UTC exited0. Filesystem available bytes increased from1681596416 to12630695936: net10949099520bytes (about10.95GB) reclaimed. Final df showed87%used and12630683648bytesavailable. This supersedes section21's99%/1.70GB snapshot.

Protected snapshot verification:26290file/symlink entries,0changed/missing,0added; all27target dependency trees absent and all18retained dependency trees present. SHA256 checks covered protected regular files; symlinks were compared as links without following arbitrary destinations. Coverage included actual shared uploads/var, legacy checkout uploads, original `.env`/`.runtime` and all non-node_modules release files. PostgreSQL was excluded from deletion entirely; no claim is made that a live database is byte-identical while running.

Post-cleanup PM2 remainedPID79803,online,restarts73,unstableRestarts0; local/public readiness and full deployedSHA passed. Redis rate-limit PING=PONG; Nginx syntax and service-active checks passed. No code redeployment was needed.

Audit artifacts remain in private server directory `/home/deploy/sqr-disk-cleanup-20260910/`: reviewed plan, before snapshots, exact removed-target list and protected-verification result. Task helpers are ignored locally under `artifacts/sqr-disk-cleanup-*.cjs`. Do not blindly rerun them: completed targets are absent and validation intentionally fails. The temporary SSH key still serves the pending office verification and expires2026-09-12T00:00UTC; remove only that task authorization/key pair when access ends. The30staffNATacceptance requirement remains incomplete and must not be replaced by disk/health success.

## 23. Real daytime observation and simulation scope (2026-09-11)

This goal continuation produced new evidence rather than repeating quiet probes. The real production Nginx log contains traffic for11September Malaysia, unlike the previous10probe-only snapshot. A read-only helper joins source addresses internally against the one historically edge-rejected source from the prior debug log, emits no addresses, and normalizes route UUIDs. No production load generator, seeded account, fake Collection, migration or permission change was run.

- All logged networks on11September:2463requests,0edge429,0upstream429,0HTTP5xx. Of these,2365requests match the historically rejected source, from08:53:40 to18:29:19+0800. This source correlation does not independently certify how many physical office devices or people participated.
- That network:1713HTTP200,73HTTP204,26WebSocket101,7HTTP400,6HTTP401,493HTTP403 and47HTTP499. All2365edge rate checks PASSED. HTTP200non-WebSocket request latency median27ms,p95245ms; this excludes failures/aborted requests and is not an all-traffic latency guarantee.
- Ordinary successful work includes2POSTCollection200,972heartbeat200,16login200,10GeneralSearch200,91savedBillingtargetGET200,82calendarGET200 and1Billingclient-resultsPUT200. Counts are requests, not distinct staff or simultaneous capacity.26completedWebSocket101entries do not mean26concurrentusers.
- The six Dashboard analytics routes each returned82HTTP403. Structured app logs confirm492`authorization_failure` events withreason`tab_disabled`, matching their existing Dashboard permission guards. Do not relax permissions or label these429. Why the client kept requesting disabled analytics has not been fully diagnosed. One additional login403 exists. There are also47client-cancelled499requests on the correlated source, including6GeneralSearch requests; successfulGeneralSearch p95 was6000ms over10samples. No claim is made that all application workflows are error-free.
- A bounded SQL aggregate ran in an explicit READ ONLY transaction with3sstatement timeout and session timezoneUTC; no names, IDs, sourceaddresses or credentials were returned. For Malaysia11September (`2026-09-10T16:00Z` through`2026-09-11T16:00Z`), overlapping activity records show17sessions,5distinctaccounts,2networks. These are retained activity rows, not simultaneous browser counts. An earlier aggregate without explicitUTC yielded30sessions/7accounts due to session timezone conversion; that preliminary result is superseded and must not be cited as the day's count.
- Production still served62cbe7aa; local readinessok, PM2PID79803online,restarts73,unstableRestarts0,216752128bytesRSS,CPU1.5%; quiet-time load0.06/0.05/0.04 anddisk87%. This later snapshot is not resource telemetry during the daytime traffic peak.
- Sanitized aggregate artifact: ignored local `artifacts/nat-observation-20260911.json` and private server `/home/deploy/sqr-nat-preflight-20260910/nat-observation-20260911.json`. Read-only helper `sqr-nat-day-observation.cjs` is staged in the same task directory. No raw Nginx logs, IPs, querystrings, auth tokens or session data were exported. The temporary key still expires2026-09-12T00:00UTC; do not extend it without user coordination.

Simulation inspection: `scripts/load-smoke.mjs` creates concurrent fetch workers to one URL, not distinct authenticated users; raising its concurrency to30 is not a30stafftest. `ui-smoke.mjs` uses one browser identity and performs real synthetic imports/Collection/Billing/backup mutations and cleanup. The local wrappers inherit `.env` and enable seeding; they do not establish isolation. Do not point them at production or an unverified database. Local PostgreSQL17is available, but no localNginx/Redis executable was found; no new staging service was installed or started in this turn.

A fullstack simulation requires an explicitly isolated app/Nginx/PostgreSQL/Redis/upload environment at the deployed revision,30different test accounts/cookie+CSRF browser contexts behind one actual sourceIP, bounded mixed flows and per-layer attribution/resource measurement. The existing20/30/50/100HTTP/Redis/WSfixtures remain useful but do not replace this fullstack test. The subsequent user approval in section24 replaces this section's request for an acceptance choice. Do not declare complete from the5account observation or a single-account load smoke.

## 24. User-approved isolated thirty-account acceptance (implementation checkpoint)

The user explicitly replied "saya setuju" and then "sambung" to substituting30independent simulated accounts in an isolated fullstack environment for gathering30physicaloffice staff. The persistent goal tool's original text cannot be edited by the agent; preserve it and record this explicit later user-approved change here. Completed production deployment and real daytime observations still form required evidence, not something synthetic tests replace retroactively.

New manual workflow `.github/workflows/nat-shared-ip-simulation.yml` checks out harness main separately from pinned deployed application62cbe7aa. `scripts/nat-shared-ip-ci.mjs` owns a disposable GitHub-hosted Linux environment, dedicated PostgreSQL/Redis, loopbackHTTPSNginx and isolated uploads; scripts refuse ordinary local/production invocation and inherited service overrides. No production endpoint, credential, deployment or financial mutation is part of the simulation. Buildmanifest must report exactSHA andclean source. ApponlyRedisstore andoneworker/pool10 remain.

`nat-shared-ip-fixture.mjs` creates30active realpassword accounts,20nicknames,10teams,30synthetic source rows and10assigned encryptedBillingtargets in an empty isolated database. `nat-shared-ip-browser.mjs` uses30independent nativebrowsercontexts, normalUIlogin/cookies/CSRF and nativeWebSockets. Role-aware coverage preserves defaultpermissions: all30Search/Collectionreads/heartbeat/WS,20user/adminCollectionUIreceipt saves,20admin/managerBillingreads,10managerDashboardreads. Bounded pacing/concurrency is explicit; it does not certify30simultaneousexpensiveSQLoperations or productionhardwarecapacity.

Artifacts include only scrubbed public summaries and Nginxconfiguration; fixturemetadata/privateapp logs/certkeys remain excluded. ActualrootSHA62build is a fresh source build, not the identical promotedbinary. CIloopbackdevelopmentmode withHTTPSsecurecookies, nonTLSloopbackDB/Redis, smallsyntheticdata and deterministiccleanscanner are limitations recorded in [simulation guide](docs/SQR_NAT_SHARED_IP_SIMULATION.md).

Local syntax checks and4new contracttests passed. Independent review confirmed fixturecryptographic/indexdomains/RBAC and found Nginxparity fixes (canonicalweb-vitals route and30/360stimeouts), which were incorporated. The browser uses the systemChrome path, runs in pinnedappcwd, and accepts nullmanagernicknamefields. Fullstackexecution/coverage/artifacts are NOT yet verified at this checkpoint. Next: complete localscriptssuite/secretguard, commit/push task-owned harness, dispatch only NAT Shared-IP Simulation, inspect actualrun and scrubbedartifacts, fix real harness defects without weakening acceptance/security, then record proof. No productionredeployment is needed for harness-onlychanges.

Two subagents stopped due to accountusage limits after writing their files; root remains responsible for integration/review. No agent's completion message is evidence of an actual30browserpass. Existing temporarySSHauthorization expires2026-09-12T00:00UTC; noextension is authorized. Remove only exacttaskkeylines/localpair once productionaccess ends, preserving allotherkeys. Keep the goal incomplete until the explicitly updated requirements are actually verified.
