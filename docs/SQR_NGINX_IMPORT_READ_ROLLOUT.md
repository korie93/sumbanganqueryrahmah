# Remaining production change: import list versus upload admission

Status, 12 September 2026: isolated fullstack verification passed, but this
two-file production change has **not** been applied. The previous API/login/WS
corrections and application `62cbe7aa` were deployed successfully. Temporary SSH
authorization expired at 00:00 UTC / 08:00 Malaysia; fresh user-authorized access
or an operator-run change is required. Do not bypass that expiry using an old
session, another login method or a modified helper deadline.

## Evidence and target

The original exact `/api/imports` location applies 10 requests/minute, burst 5
and three connections to GET as well as POST. Simulation run 34618268798 failed
the ninth ordinary list read with a Nginx 429. The corrected configuration passed
[thirty-account run 34659171201](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34659171201),
including fifty successful list reads and retained upload burst rejection. See
the [complete evidence and limits](SQR_NAT_SHARED_IP_SIMULATION.md).

Approved production identity: `deploy@139.180.213.185`, hostname `vultr`, domain
`sqr-system.com`; previously verified ED25519 host fingerprint
`SHA256:jfa6vi4Q2cuIh+HAopt4hsHQ4ieBrlcDduYy1N/Z4kc`.
Recheck identity, active `nginx -T`, current/previous release, health and exact
source hashes after obtaining fresh authorization. No application redeployment,
database mutation, upload deletion or role change is needed.

| Active file | Expected pre-change SHA256 |
| --- | --- |
| `/etc/nginx/conf.d/sqr-telemetry-rate-limit.conf` | `0edf9122dc2656252909f34ba8bfc104ed1414294fd6281cb84af4702be1d010` |
| `/etc/nginx/sites-available/sqr-system` | `f84fa34cd45068dd27b924f5703bedc06b02b848138c1f00b7bcf329ffc48c52` |

If either differs, inspect the new state; do not overwrite intervening edits.
The enabled-site symlink must still resolve to the second file. Both release
manifests must identify clean application SHA
`62cbe7aa20390ddd87ece97c41b1424b8c9154a4` and release
`sqr-1.0.0-62cbe7aa2039-20260910T144152Z` unless a separately reviewed deployment
has superseded it.

## Exact candidate change

First back up **both** files with preserved ownership/mode/timestamps to a new
timestamped directory under `/etc/nginx/backups/`, never a loaded include
directory. Verify both backup hashes before editing. Run baseline `sudo nginx -t`.

Append to the zone file in HTTP context; retain the original import zones so old
workers can drain without changing a live shared-memory zone's key:

```nginx
# Import reads use the ordinary shared-NAT API budget; writes retain strict isolation.
# Keep the original import zones unchanged while old workers drain after reload.
map $request_method $sqr_import_write_key {
    default $binary_remote_addr;
    GET "";
    HEAD "";
}
limit_req_zone $sqr_import_write_key zone=sqr_import_write_per_ip:10m rate=10r/m;
limit_conn_zone $sqr_import_write_key zone=sqr_import_write_conn_per_ip:10m;
```

Run `sudo nginx -t` before proceeding. In the existing exact
`location = /api/imports`, replace only its two admission directives with:

```nginx
limit_req zone=sqr_api_per_ip burst=300 nodelay;
limit_req zone=sqr_import_write_per_ip burst=5 nodelay;
limit_conn sqr_conn_per_ip 240;
limit_conn sqr_import_write_conn_per_ip 3;
```

Preserve both explicit 429 statuses, body limit 100M, proxy headers, buffering
off, 360-second timeouts, certificates and every other location. GET/HEAD retain
the general aggregate API guard. All other methods also retain strict upload
limits. No request-body or user-ID header controls quota identity. Nginx supports
additive directives and excludes empty keys from each zone's accounting:
[request limits](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html),
[connection limits](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html).

Run `sudo nginx -t` again. Reload only after all checks pass:
`sudo systemctl reload nginx`. Verify active configuration, hashes, service
state, public/local readiness and exact application SHA. Compare PM2 PID/restarts,
then ordinary real traffic and edge/upstream attribution. Do not run abuse or
synthetic financial mutations on production. Record the actual backup directory,
reload time, differences and post-change evidence in the handoff.

## Rollback and preflight already performed

At 23:45 UTC, the ignored one-off helper at
`/home/deploy/sqr-nat-preflight-20260910/sqr-nginx-import-read-gate.cjs` passed a
read-only preflight. Local/server helper SHA256:
`bc2b291379397cdd29d3a8f6d30e0acbebd3b250fe57e7409c93ed858f7df3e3`.
Reviewed plan SHA256:
`7fc1a41405deabc8f6c3043ecaca6bc9b1201b54c5e25f0962bdea29d45c97dd`.
It intentionally refuses a new apply after the expired authorization deadline;
do not run or change it until fresh access is explicitly approved and reviewed.

No new import-read backup directory exists because apply never ran. Following a
future apply, rollback must use that run's exact recorded backup directory:
restore `site.conf` to the site first, then `zones.conf` to the zone file, preserving
metadata; refuse unknown intervening hashes. Run `sudo nginx -t`, reload only on
success, and independently verify health/SHA/service. Restoring the old import
location restores the known list-read bottleneck, so rollback is a recovery
option, not the finished fix.

The old scoped key had two identical authorized entries with comment
`sqr-nat-codex-temp-20260910`. Once access is coordinated, remove only those exact
task entries and corresponding local task key pair, preserving all other keys.
The previous root SSH session was closed with `sudo -k` and `exit` after expiry;
it was not used to apply the configuration.
