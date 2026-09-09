# SQR shared-NAT: active Nginx findings and targeted rollout

Prepared from the user's `nginx-active-sanitized.txt` and source/runtime output received on 2026-09-09. Commit/push of the application patch is now authorized for CI verification. Production instructions below remain operator-only: no reload or deployment has been authorized or performed.

## Confirmed findings

The active HTTPS SQR virtual host includes `/etc/nginx/snippets/sqr-api-throttle.conf`. Its `location /api/` handles `/api/me`, settings, analytics, heartbeat, collection and Billing OSP routes, except more-specific login/import/telemetry locations.

| Active policy | Current shared-IP value | Definition |
| --- | --- | --- |
| API request rate | 30/minute | `/etc/nginx/conf.d/sqr-telemetry-rate-limit.conf` |
| API excess burst / connection cap | 100 / 80 | `/etc/nginx/snippets/sqr-api-throttle.conf` |
| Both login aliases | 10/minute, burst 5, connections 10 | zone in conf.d; locations in `/etc/nginx/sites-enabled/sqr-system` |

General API and login locations explicitly set `limit_req_status 429` and `limit_conn_status 429`. Nginx is therefore a confirmed active 429-producing layer before `/api/me`, despite the app's exemption for that exact GET route. Burst 100 does not increase the sustained 30/minute refill rate. All staff behind one IP share these network quotas. [Nginx request limiting](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html), [connection limiting](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html).

In the supplied server snapshot, source checkout is clean on `main` at `252d8d9d3bacf3bb4ef6ac839856d0122fa6c85a`. PM2 is online under `sqr-runtime/current`; that symlink resolves to release `sqr-1.0.0-252d8d9d3bac-20260909T051334Z`. This supports the baseline release identity but is not binary checksum attestation. Package-lock dependency versions do not identify an application build. The NAT fix is not deployed; publishing it to Git does not replace this runtime release.

Relevant active forwarded header names are correctly spelled; upstream is 127.0.0.1:5000. Preserve `TRUSTED_PROXIES=127.0.0.1/32`. No correlated upstream/access logs were included: the active producer/path mapping is proven, but the proportion of historical 429s from each layer is unknown.

## Three targeted edits after release approval

First deploy the matching tested application fix through the normal immutable-release process, after mandatory live Redis CI passes. Pulling source alone does not replace PM2's current release. Nginx-only tuning leaves the old adaptive/login application bottlenecks intact.

Back up the three affected files and any resolved symlink targets. Resolve the virtual-host target with `readlink -f /etc/nginx/sites-enabled/sqr-system`; edit that existing target. If values changed since the supplied snapshot, review the new diff first.

### 1. Existing zone definitions

In `/etc/nginx/conf.d/sqr-telemetry-rate-limit.conf`, replace only existing API/auth zone lines:

```nginx
limit_req_zone $binary_remote_addr zone=sqr_api_per_ip:10m rate=200r/s;
limit_req_zone $binary_remote_addr zone=sqr_auth_per_ip:10m rate=10r/s;
```

Update the old 30/min comment to describe an aggregate flood guard. Do not append duplicate zones or change their keys/sizes.

### 2. Existing API snippet

In `/etc/nginx/snippets/sqr-api-throttle.conf`, change only these admission values:

```nginx
limit_req zone=sqr_api_per_ip burst=2000 nodelay;
limit_conn sqr_conn_per_ip 1000;
```

Keep 429 status directives, proxy headers/upstream and timeouts unchanged. These tunable ceilings give headroom for the 100-user/10-startup-call verification model; they are not proof this server sustains arbitrary 200 expensive requests/second. User quotas and DB/AI/import/export protections remain authoritative.

### 3. Both existing exact login locations

In the resolved SQR virtual-host file, change these values inside **both** `location = /api/login` and `location = /api/auth/login`:

```nginx
limit_req zone=sqr_auth_per_ip burst=100 nodelay;
limit_conn sqr_conn_per_ip 200;
```

Keep paths, 429 directives and proxy settings unchanged. The updated app still enforces 5/account/15 minutes and 500/network/15 minutes by default.

## Preserve deployment-specific protections

Do **not** replace this installation wholesale with `deploy/nginx/sqr.conf.example`. That fresh-install example differs from the active split-file layout: duplicate zones/locations break validation, and replacement can remove Certbot settings or relax existing import restrictions.

Keep these active values unchanged:

- Imports 10/minute, burst 5, separate connection cap 3, body 100M and 360s timeout.
- WebSocket upgrades 30/minute, burst 20, separate active connection cap 20. These can independently produce upgrade 429, but no such incident was supplied; not changed by this API fix.
- Telemetry 60/minute, burst 20, connection cap 10; preserve exact endpoint controls.
- Certbot certificates/SSL includes, redirects, other virtual hosts, Redis, trusted proxies and private upload protection.

API/login admission ceilings do not change worker/socket capacity. Monitor pressure during controlled rollout; do not change worker limits or load-test production as part of this patch.

## Validation, attribution and rollback

After reviewing the diff, the operator must run `sudo nginx -t`. Reload only if validation passes and deployment is authorized: `sudo systemctl reload nginx`. Neither command has been executed by the agent.

Verify the newly resolved runtime release, then normal reads/login/heartbeat and one collection save from a small group before wider rollout. Monitor app and edge counters separately. The fresh-install example provides a privacy-conscious `sqr_rate_attribution` log format: if adopting it, put its declaration once in http context and the access-log directive only in the existing SQR HTTPS server. Never log cookies, Authorization, bodies or query strings. Upstream status, limiter outcomes and request IDs distinguish future edge 429 from upstream 429. Existing default access logs may not have upstream status.

If validation fails, restore only reviewed backups and validate again; do not reload invalid config. For an authorized rollback, restore the matched previous app release and these three Nginx files using normal deployment procedures. This reinstates small NAT limits, so renewed 429 pressure is expected. Never flush production Redis or modify database data for rollback.

## Remaining verification

Live Redis integration must still pass against an isolated test instance or mandatory CI Redis service, never production Redis. Active Nginx syntax/reload and post-deployment behavior remain operator-side verification, not locally proven results.

Local checks after this evidence review: all 13 Nginx/live-Redis-CI contract tests passed (0 skipped), the changed-file secret guard passed, and `git diff --check` passed. These static contracts do not substitute for live Redis integration or `nginx -t` on the actual installation.
