# SQR shared-NAT: active Nginx findings and targeted rollout

Current checkpoint: 2026-09-10 15:02 UTC. Privacy-conscious diagnostics were reloaded at approximately 12:48 UTC; the five admission changes below were backed up and applied at 13:29:31 UTC (21:29:31 Malaysia time). Search/WebSocket commit `62cbe7aa20390ddd87ece97c41b1424b8c9154a4` is now deployed from its production-approved immutable artifact. Local/public readiness, exact SHA, Redis PONG and post-restart checks passed. Actual 30-person office acceptance remains outstanding. [Continuation handoff](../CODEX_CONTINUATION_HANDOFF_SQR_429_NAT_AWARE_RATE_LIMIT_FIX.md) sections 20–21 hold the latest release evidence; the baseline below is historical.

## Verified production baseline

SSH succeeds as `deploy` on the confirmed host with strict pinned host-key verification. The source checkout is clean `main` at `6cbada4599dd0665e9b47634bbfd9195555af46c`; local/public readiness pass and the version endpoint matches that SHA. [Release Verification 34413870959](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34413870959) passed for this release.

| Runtime item | Inspected value |
| --- | --- |
| Current release | `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-6cbada4599dd-20260909T225140Z` |
| Previous release | `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-252d8d9d3bac-20260909T051334Z` |
| PM2 | `sqr` online; script `current/dist-local/server/cluster-local.js`, cwd `current`; one Node process in fork mode |
| Host | 2 vCPU; 3910 MiB RAM, about 2002 MiB available |
| Quiet-time process use | Node RSS about 239 MB; CPU about 1.5% |
| Nginx | 2 workers, 768 connections each; service LimitNOFILE 524288 |
| Application controls | Loopback listener `127.0.0.1:5000`; `TRUSTED_PROXIES=127.0.0.1/32`; one worker; PostgreSQL pool 10; Redis rate-limit store |

These are quiet-time observations, not demonstrated load capacity. Preserve existing Node/private CA environment settings; never print credentials or use production Redis for integration tests.

The HTTPS site's `/api/` location comes from `/etc/nginx/snippets/sqr-api-throttle.conf`. It covers me/settings/analytics/heartbeat/Collection/Billing and Search except more-specific locations. `sites-enabled/sqr-system` resolves to `/etc/nginx/sites-available/sqr-system`.

The inspected pre-admission-change API limit is 30/minute, burst 100 and connection cap 80; both login aliases have 10/minute, burst 5 and cap 10. They explicitly reject with 429. Burst does not raise sustained refill, so the office shares only 0.5 API requests/second before authentication. [Nginx request limiting](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).

Count-only inspection found 1,334 debug 429 entries between 16:18:00 and 18:59:11 +0800 on 2026-09-10. All had `upstream_status=-` and one hashed source; the error log contained 1,334 `sqr_api_per_ip` rejections. Endpoints included six analytics routes, visibility, maintenance, heartbeat, app-config, Collection and Search. This attributes the inspected events to the edge API bucket. It does not provide the successful-traffic denominator or prove every historical 429 had that cause. Keep the source IP private; no office allowlist is needed.

## Diagnostics already deployed

The 12:48 UTC deployment backed up these two files under `/etc/nginx/backups/sqr-nat-diagnostics-20260910T124820Z`:

- `/etc/nginx/conf.d/sqr-429-debug-format.conf` as `sqr-429-debug-format.conf`.
- `/etc/nginx/sites-available/sqr-system` as `sqr-system`.

The diagnostic format records method + URI without query strings, upstream status/timings and limiter outcomes. The existing conditional 429 log remains enabled. A `sqr_log_nat_traffic` map and site-scoped `/var/log/nginx/sqr-nat-access.log` now supply ordinary API, `/ws` and legacy telemetry attribution. This corrects the earlier conditional-only site's missing successful-traffic denominator. Do not log cookies, Authorization, bodies or query strings.

Validation passed after each edit and reload; public readiness passed. The new log is 0640 `www-data:adm` and the existing Nginx rotation covers it daily with 14 compressed rotations. An earlier 12:47:51 UTC attempt restored its baseline after a conservative empty-log assertion; its separate backup is `sqr-nat-diagnostics-20260910T124751Z`. No invalid configuration was reloaded or log contents removed.

At this checkpoint the new log contains health-probe traffic only. No active 30-person office interval or production latency/capacity acceptance has been observed.

## Deployed admission changes: five active files

The initial API ceiling is 100 requests/second, burst 300, connections 240. It is a monitored aggregate flood guard, not evidence that this 2-vCPU host and 10-connection database pool can sustain 100 expensive requests/second. The earlier 200/second, burst 2000, cap 1000 proposal and generic example are not this installation's rollout values.

Source-derived polling gives approximately 14 Dashboard calls/minute/user: 30 active Dashboard users average 7 requests/second. Maintenance adds about 2/second for that group and heartbeat about 0.5/second, before navigation, reads and writes. Thirty users making ten startup calls produce 300 requests; spreading that over ten seconds averages 30/second. These estimates justify leaving bounded room above ordinary modeled traffic. They are not measurements of current office behavior. `nodelay` may admit burst traffic immediately, so monitor latency, CPU/RAM, connections and database pressure. [Nginx burst semantics](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).

| Control | Inspected baseline | Selected initial policy |
| --- | --- | --- |
| API | 30/minute; burst 100; connections 80 | 100/second; burst 300; connections 240 |
| Both login aliases | 10/minute; burst 5; connections 10 | 5/second; burst 100; connections 40 in a separate auth zone |
| WebSocket | 30 upgrades/minute; burst 20; connections 20 | 10 upgrades/second; burst 100; connections 200 in the existing WS zone |
| Web-vitals telemetry | 60/minute; burst 20; connections 10 | 5/second; burst 100; connections 20 in a separate telemetry zone |
| Imports | 10/minute; burst 5; connections 3 | Unchanged; body 100M and timeout 360s retained |

Nginx connection counts are keyed by their configured zone: API/login/telemetry previously reused `sqr_conn_per_ip`, so the smaller auth/telemetry caps could reject while other API requests were active. Dedicated auth and telemetry connection zones separate those counts. Each concurrent HTTP/2 request counts separately for connection limiting. [Nginx connection limiting](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html).

The reviewed deployment changed only these five active files, preserving 429 directives, upstreams, timeouts, Certbot settings, private upload protection and all unrelated locations:

1. `/etc/nginx/conf.d/sqr-telemetry-rate-limit.conf`: existing request zones now use API `sqr_api_per_ip` 100r/s, auth `sqr_auth_per_ip` 5r/s, WS `sqr_ws_upgrade_per_ip` 10r/s and telemetry `sqr_telemetry_per_ip` 5r/s. Keys and existing sizes are preserved. New connection zones `sqr_auth_conn_per_ip:10m` and `sqr_telemetry_conn_per_ip:10m` each use `$binary_remote_addr`; the API, import and WS zones remain.
2. `/etc/nginx/snippets/sqr-api-throttle.conf`: API burst 300 with `nodelay`, `limit_conn sqr_conn_per_ip 240`.
3. `/etc/nginx/sites-available/sqr-system`: both exact locations `/api/login` and `/api/auth/login` use auth burst 100 with `nodelay` and `limit_conn sqr_auth_conn_per_ip 40`. The diagnostic access-log line remains.
4. `/etc/nginx/snippets/sqr-ws-throttle.conf`: WS burst 100 with `nodelay`, `limit_conn sqr_ws_conn_per_ip 200`, and `proxy_set_header X-Forwarded-For $remote_addr;`. This single-edge installation overwrites client-supplied XFF because the WS consumer currently selects its first address. The application listener remains loopback-only and proxy trust narrow.
5. `/etc/nginx/snippets/sqr-web-vitals-telemetry.conf`: telemetry burst 100 with `nodelay`, `limit_conn sqr_telemetry_conn_per_ip 20`; both existing endpoint locations and body/proxy controls remain.

The exact admission backup is `/etc/nginx/backups/sqr-nat-edge-20260910T132931Z`, containing `zones.conf`, `api.conf`, `site.conf`, `ws.conf` and `telemetry.conf`. A dry-run diff was reviewed. Initial validation, validation after each of the five edits and final `nginx -t` all passed; reload and service-active checks passed. Local/public readiness passed afterward, Redis answered PONG, and unauthenticated `/api/me` remained401. This initially changed edge admission only; the subsequent application promotion is recorded below.

Do not install `deploy/nginx/sqr.conf.example` over this split-file deployment. Its thresholds and import restrictions differ, and wholesale replacement risks duplicate definitions or loss of installation-specific settings. Neither Nginx worker counts nor connection/file-descriptor limits are changed by this patch.

## Application corrections accompanying the edge rollout

The prior production `6cbada45` includes the principal authenticated adaptive/login quota correction and Retry-After fix. Newly deployed `62cbe7aa` adds these follow-ups:

- Search/import-read/source-match rate limiting uses a hash of the server-authenticated user ID instead of one IP bucket; the limit remains 10 requests/10 seconds. Anonymous fallback remains normalized IP, and the configured Redis store still fails closed.
- The WebSocket manager's aggregate defaults become 200 connections/IP and 600 upgrade attempts/IP/minute. Strict buckets remain 30/minute for anonymous failures, signed activity and authenticated database user; per-user active connections remain 5 and the process-wide cap remains 1000. Signed-activity checks and bounded pending reservations precede asynchronous authentication; user identity is selected only after active-session and revocation checks. Live upgrade buckets are not evicted to make room for rotating attacker keys.
- These WebSocket quotas remain local process state. The verified production topology has one worker; this change does not introduce a new Redis-backed WS quota store or prove multi-worker aggregate enforcement. Revisit WS coordination before increasing worker count.
- Telemetry intentionally retains application sampling/drop guards: web-vitals 60/IP/minute for browser-provenance traffic (stricter anonymous handling remains), client errors 20/IP/minute. Excess samples may receive empty 204 responses. Higher edge admission removes a small shared transport bucket; it does not promise 100% telemetry capture.

Search and WS were deployed through the exact-SHA approved immutable artifact after CI, required isolated live Redis, Release Verification and production approval passed. Current: `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-62cbe7aa2039-20260910T144152Z`; previous: `/home/deploy/apps/sqr-runtime/releases/sqr-1.0.0-6cbada4599dd-20260909T225140Z`. The original checkout remains at `6cbada45`; a source pull is not required to activate this immutable release.

## Exact five-file admission backup and rollback

Run on the verified host in Bash. Before editing, confirm all five files are regular files and the enabled site resolves to the known target. The directory is outside wildcard-loaded includes; `mkdir` fails on timestamp collision so an old backup cannot be overwritten. Record the generated directory literally and retain it for rollback.

~~~bash
set -euo pipefail
sudo nginx -t
test "$(readlink -f /etc/nginx/sites-enabled/sqr-system)" = /etc/nginx/sites-available/sqr-system
for SQR_NGINX_TARGET in \
    /etc/nginx/conf.d/sqr-telemetry-rate-limit.conf \
    /etc/nginx/snippets/sqr-api-throttle.conf \
    /etc/nginx/sites-available/sqr-system \
    /etc/nginx/snippets/sqr-ws-throttle.conf \
    /etc/nginx/snippets/sqr-web-vitals-telemetry.conf
do
    sudo test -f "$SQR_NGINX_TARGET"
    sudo test ! -L "$SQR_NGINX_TARGET"
done
SQR_NGINX_BACKUP_DIR="/etc/nginx/backups/sqr-nat-edge-$(date -u +%Y%m%dT%H%M%SZ)"
sudo mkdir -p -- /etc/nginx/backups
sudo mkdir -m 700 -- "$SQR_NGINX_BACKUP_DIR"
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/conf.d/sqr-telemetry-rate-limit.conf "$SQR_NGINX_BACKUP_DIR/zones.conf"
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/snippets/sqr-api-throttle.conf "$SQR_NGINX_BACKUP_DIR/api.conf"
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/sites-available/sqr-system "$SQR_NGINX_BACKUP_DIR/site.conf"
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/snippets/sqr-ws-throttle.conf "$SQR_NGINX_BACKUP_DIR/ws.conf"
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/snippets/sqr-web-vitals-telemetry.conf "$SQR_NGINX_BACKUP_DIR/telemetry.conf"
printf 'Admission backup: %s\n' "$SQR_NGINX_BACKUP_DIR"
~~~

Stop before editing if any check/copy fails. Review the exact diff, run `sudo nginx -t` after each file edit, then run it again immediately before `sudo systemctl reload nginx`. Never reload invalid configuration. New zone declarations must exist before locations reference them.

For rollback, use the recorded exact admission directory, verify its contents and metadata, and confirm no later changes would be overwritten. Do not regenerate its timestamp. Restore only these five targets; this preserves the already-deployed diagnostics captured in `site.conf`.

~~~bash
set -euo pipefail
SQR_NGINX_BACKUP_DIR=/etc/nginx/backups/sqr-nat-edge-20260910T132931Z
[[ "$SQR_NGINX_BACKUP_DIR" =~ ^/etc/nginx/backups/sqr-nat-edge-[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
test "$(readlink -f /etc/nginx/sites-enabled/sqr-system)" = /etc/nginx/sites-available/sqr-system
for SQR_NGINX_BACKUP_FILE in zones.conf api.conf site.conf ws.conf telemetry.conf
do
    sudo test -f "$SQR_NGINX_BACKUP_DIR/$SQR_NGINX_BACKUP_FILE"
    sudo test ! -L "$SQR_NGINX_BACKUP_DIR/$SQR_NGINX_BACKUP_FILE"
done
sudo cp --preserve=mode,ownership,timestamps -- "$SQR_NGINX_BACKUP_DIR/zones.conf" /etc/nginx/conf.d/sqr-telemetry-rate-limit.conf
sudo cp --preserve=mode,ownership,timestamps -- "$SQR_NGINX_BACKUP_DIR/api.conf" /etc/nginx/snippets/sqr-api-throttle.conf
sudo cp --preserve=mode,ownership,timestamps -- "$SQR_NGINX_BACKUP_DIR/site.conf" /etc/nginx/sites-available/sqr-system
sudo cp --preserve=mode,ownership,timestamps -- "$SQR_NGINX_BACKUP_DIR/ws.conf" /etc/nginx/snippets/sqr-ws-throttle.conf
sudo cp --preserve=mode,ownership,timestamps -- "$SQR_NGINX_BACKUP_DIR/telemetry.conf" /etc/nginx/snippets/sqr-web-vitals-telemetry.conf
if sudo nginx -t; then
    sudo systemctl reload nginx
else
    printf 'STOP: restored configuration did not validate; do not reload.\n' >&2
    exit 1
fi
~~~

Restoring these old admission values reinstates the small shared-IP limits and old WS forwarding. Expect renewed NAT failures; retain attribution logs. Do not flush Redis or modify database data.

### Separate diagnostics rollback

The diagnostics backup predates admission changes and includes the site file. Only use this separate rollback when those exact pre-diagnostics targets are intended; first unwind or reconcile any later site edits. Applying it alone after the admission rollout would also revert the site's auth changes.

~~~bash
set -euo pipefail
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-diagnostics-20260910T124820Z/sqr-429-debug-format.conf /etc/nginx/conf.d/sqr-429-debug-format.conf
sudo cp --preserve=mode,ownership,timestamps -- /etc/nginx/backups/sqr-nat-diagnostics-20260910T124820Z/sqr-system /etc/nginx/sites-available/sqr-system
if sudo nginx -t; then
    sudo systemctl reload nginx
else
    printf 'STOP: diagnostics rollback did not validate; do not reload.\n' >&2
    exit 1
fi
~~~

### Application rollback

Before any application promotion record the actual `current` and `previous` symlink targets. The baseline paths above are inspected evidence, but must be refreshed if another release intervenes. Use the immutable rollback script only when the inspected previous release is the intended target:

~~~bash
NODE_EXTRA_CA_CERTS=/home/deploy/apps/sumbanganqueryrahmah/.runtime/redis-ca.crt \
SQR_RELEASE_ROOT=/home/deploy/apps/sqr-runtime \
bash /home/deploy/apps/sqr-runtime/current/deploy/immutable/rollback-release.sh
curl --max-time 10 -fsS http://127.0.0.1:5000/api/health/ready
curl --max-time 10 -fsS http://127.0.0.1:5000/api/health/version
SQR_EXPECTED_RELEASE_SHA=6cbada4599dd0665e9b47634bbfd9195555af46c \
bash /home/deploy/apps/sqr-runtime/current/scripts/post-deploy-health-check.sh https://sqr-system.com
~~~

Preserve existing Node/private CA settings and run normal local/public readiness and provenance checks. The rollback script verifies SHA/readiness and does not reverse database migrations. This Search/WS correction requires no migration or dependency change.

## Acceptance and remaining gates

Record the admission backup directory, file diff/checksums, reload time, approved app SHA, actual current/previous release paths, filtered PM2 status and local/public health after each change. Begin with a small group, then observe a defined 30-person office interval using each person's own account. Verify Dashboard, Search, heartbeat, Collection/Billing and simultaneous WebSockets, including ordinary reconnects.

Capture total requests and 429 counts by endpoint and edge/upstream origin, Nginx limiter zones, application limiter diagnostics, upstream latency and host/database pressure. Count telemetry transport acceptance separately from intentionally dropped samples. Test abuse limits in isolated tests/staging; do not flood production, brute-force real accounts or manufacture production collections. Zero sampled errors with no office traffic is not acceptance evidence.

The extended 30-user Redis case passed in [CI 34483780833](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34483780833) on `62cbe7aa`; CodeQL also passed. [Dispatched Release Verification 34483782447](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34483782447) and production approval passed on attempt 2 after one evidence-backed retry of a pending Search request under CI database pressure. No test or limiter was weakened. Local follow-up checks passed: Search/routes100, HTTP NAT36 (20/30/50/100), WS106, scripts410, typecheck, full lint, build and bundle budgets. Counts overlap.

Deployment exited 0 at about 14:59 UTC. Archive and internal inventory checksums passed, `sourceDirty=false`, existing uploads were preserved (copied0/preserved1342), migration checks passed and PM2 was saved. Independent local/public readiness and SHA checks passed; Redis PONG and readiness remained healthy after its 60-second monitor interval. At 15:02 UTC PM2 had no unstable restarts; Nginx syntax/service checks passed and the origin remained loopback-only. The attribution log had 10 agent probes (8 HTTP200,2 expected401), all edge controls PASSED; the 429/error logs had no entries newer than 18:59 Malaysia before rollout. This quiet probe sample is not office acceptance.

Disk is 99% used with about 1.70 GB available after installation. No old releases or user files were removed. Plan operator-approved storage maintenance or expansion before further deployments. Arrange the real 30-staff interval and collect the evidence above before declaring the NAT goal complete. Preserve the temporary scoped SSH authorization until verification is finished or revoke it with the user; it expires 2026-09-12 00:00 UTC and must not become permanent access.
