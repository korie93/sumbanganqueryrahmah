# Thirty-account shared-IP simulation

The user approved isolated simulated-account acceptance on 11 September 2026
instead of arranging thirty physical office staff. This supplements the real
production observation in the continuation handoff; it does not certify office
Wi-Fi, production hardware capacity or every production workload.

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
