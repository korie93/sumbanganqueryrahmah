# Thirty-account shared-IP simulation

The user approved isolated simulated-account acceptance on 11 September 2026
instead of arranging thirty physical office staff. This supplements the real
production observation in the continuation handoff; it does not certify office
Wi-Fi, production hardware capacity or every production workload.

Latest verified result: [run 34659171201](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34659171201)
passed at harness `477772e925def4a6c219c10cc1864c62ce3b0693`, testing application
`62cbe7aa20390ddd87ece97c41b1424b8c9154a4`. The import-method correction below is
validated in isolation and **deployed to production on12September10:32:59UTC**.
See the [completed rollout and post-checks](SQR_NGINX_IMPORT_READ_ROLLOUT.md).

Run **NAT Shared-IP Simulation** manually from GitHub Actions. There is no
production URL input, deployment step, production secret or local dotenv fallback.
The application checkout is pinned to deployed source
`62cbe7aa20390ddd87ece97c41b1424b8c9154a4`; the harness comes from the dispatched
revision. Changing the application revision requires a reviewed code change.

## Isolation and traffic

The disposable GitHub-hosted Linux job owns PostgreSQL 17 (`sqr_nat_simulation`),
Redis 7, application uploads and a private self-signed Nginx certificate. Only
loopback services are accepted. Nginx uses the verified active admission values:
API 100 requests/second, burst 300, connection cap 240; separate login, WebSocket,
telemetry and import zones. Forwarded addresses are overwritten with the actual
source address. No identities are simulated using forged forwarded headers.

Thirty real accounts log in through the UI, using separate browser contexts,
secure session cookies, CSRF tokens and ordinary password verification. The
fixture creates synthetic source rows, team assignments and encrypted Billing
targets, but never seeds authentication sessions or relaxes permissions.

| Coverage | Participants |
| --- | ---: |
| Normal login, Search, Collection reads, heartbeat, native WebSocket/reconnect | 30 |
| Collection UI save with a synthetic receipt (user/admin) | 20 |
| Billing UI and overview/calendar reads (admin/manager) | 20 |
| Dashboard, with unchanged default permissions (manager) | 10 |

Login starts are paced at 2.1 seconds, UI workflows have bounded concurrency and
mixed read rounds use at most ten active actors. All thirty authenticated sessions
and native WebSockets are retained, then reconnected and held through a heartbeat
interval. This is representative bounded traffic, not an abuse flood or an
assertion that thirty expensive operations execute simultaneously.

## Evidence and interpretation

The workflow uploads only `artifacts/nat-shared-ip/public/`: scrubbed browser
coverage, canonical route/status/latency counts, per-layer Nginx 429 attribution,
application/process and PostgreSQL pressure samples, configuration and SHA.
Passwords, cookies, raw request/response bodies, raw logs, screenshots, traces,
receipt contents and private fixture JSON are excluded. Disposable VM/service
teardown removes the synthetic database and runtime files.

Passing requires all intended role-aware workflows, thirty distinct sessions,
thirty simultaneous native WebSockets/reconnects, one observed source IP,
no unexpected 429/5xx and resource evidence. Deliberate initial `/api/me` 401 probes
are distinguished from failures. WebSocket connection lifetime is excluded from
HTTP response latency.

Known pinned-UI limitation: after login, user/admin clients also request six
Dashboard analytics routes despite their disabled tab. The fixture asserts those
unchanged default permissions. Only exact `Tab 'dashboard' is disabled for role`
403 responses on those six routes are verified and counted separately; manager
Dashboard 403s, other business 4xx, all 429s and all 5xx still fail. This known
extra UI traffic remains in the observed load and report, not hidden or fixed by
granting broader permissions. A NAT pass does not claim this UI behavior is fixed.

Limits of this evidence: a fresh small database, GitHub runner hardware, a fresh
build of the deployed source rather than the identical promoted binary, loopback
development mode with HTTPS browser cookies but non-TLS CI database/Redis, and a
deterministic clean scanner shim. No production security settings are changed.

Local non-mutating checks:

```text
node --check scripts/nat-shared-ip-ci.mjs
node --check scripts/nat-shared-ip-fixture.mjs
node --check scripts/nat-shared-ip-browser.mjs
node --test scripts/tests/nat-shared-ip-contract.test.mjs
```

Do not claim a simulation pass until the manually dispatched job and its actual
coverage/attribution artifacts have both been inspected.

## Import-list edge correction discovered by the simulation

The unchanged active import location failed the fourth run: nineteen accounts
logged in, but the ninth `GET /api/imports` received an edge 429. Its `10r/m`,
burst 5, connection cap 3 budget was being applied to file-list reads as well as
uploads. The failure remains recorded; login pacing is not reduced to hide it.

The candidate configuration now applies the normal API aggregate guard to
`/api/imports`, while a method-derived key applies the original strict import
rate/burst/connection limits to every method except GET/HEAD. No client identity
header is trusted. Nginx supports multiple additive limit directives and excludes
empty keys from each zone's accounting: [request limits](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html#limit_req_zone),
[connection limits](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html#limit_conn_zone).

After normal browser traffic ends, seven unauthenticated empty POST probes must
all be denied, including at least one Nginx write-burst rejection. They create no
imports and are reported separately from normal-traffic 429 counts. New write-zone
names avoid changing an existing live shared-memory zone's key at reload.

This candidate is not a statement that production has already changed: require
successful isolated evidence, exact active-config backups/validation/reload and
post-change verification before recording production parity.

## Verified result, 11 September 2026 23:46–23:51 UTC

The downloaded artifact `10286831518` matched GitHub's SHA256:
`76386610269a9eadf999e0a502a9101ee3a8d1b647daa74c6215b79afd6ee187`.
Both browser and fullstack summaries report success; their coverage was inspected.

- Thirty distinct auth cookies, CSRF tokens and activity sessions; thirty logins.
- All role-aware workflow counts in the table above passed. Every participant
  completed three mixed-read/heartbeat rounds.
- Thirty simultaneous native WebSockets; all thirty reconnected and remained
  open for another 35 seconds.
- 27,609 normal Nginx requests from one actual loopback source: zero edge 429,
  zero upstream 429 and zero HTTP 5xx. All fifty `GET /api/imports` calls returned
  200 (route p95 75 ms).
- Seven separate, unauthenticated empty POST upload probes: six upstream
  denials and one edge burst rejection. No synthetic import was created by them.
- Sixty-three resource samples: one application process throughout, peak RSS
  498,504 KiB, maximum sampled PostgreSQL connections 13 (includes auxiliary
  connections/observer, not a claim that the pool limit is 13), maximum one
  active non-observer query and zero sampled lock waits. `ps` CPU percentages
  are lifetime averages, not instantaneous production-capacity measurements.
- Zero uncaught page errors. The report retains 480 verified default Dashboard
  denials and 121 navigation aborts; this is not a claim of zero non-200 traffic.

The same PNG is reused across synthetic receipts, so duplicate warnings and
settlement eligibility remain enforced. This verifies receipt saves/readback,
not Billing settlement calculations or malware detection. Managers' own target
IDs are checked through API rounds; UI automatically selects its first available
target. Neither limitation invalidates the shared-IP result, and neither should
be described as broader business validation.

[CI 34659165201](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34659165201)
and [CodeQL 34659165193](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34659165193)
also passed the same harness SHA. Do not rerun completed simulations merely
because production access is unavailable; complete the remaining guarded rollout.
