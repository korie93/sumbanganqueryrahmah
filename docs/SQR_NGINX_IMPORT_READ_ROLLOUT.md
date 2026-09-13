# Production rollout: import list versus upload admission

Status, 12 September 2026: **applied and verified** at10:32:59UTC.
Both original files were backed up under
`/etc/nginx/backups/sqr-import-read-20260912T103259Z`; syntax checks after each
edit, reload, active service and independent new-worker checks passed. Nginx
master972 remained; new workers7349/7350 started at18:32:59Malaysia.

The separate pre-existing502 was first recovered with explicit user approval at
10:31:28UTC by correcting only the PostgreSQL hostname's loopback mapping and its
cloud-init template. TLS, database settings and application SHA stayed unchanged.
See [hostname recovery and rollback](SQR_POST_REBOOT_HOSTNAME_RECOVERY.md).
Through10:36:28UTC, local/public readiness and full deployedSHA passed, PostgreSQL
verifiedTLS/SELECT1 and Redis verifiedTLS/PONG passed, PM2PID7092 remained stable
at240restarts. The post-Nginx sample contains10operator probes:8HTTP200 and2
expected unauthenticated401, with0edge429/upstream429/5xx. This is a quiet
post-change check, not new office-load evidence. The separately verified30-account
simulation and real11September office observations retain their documented scope.

Current SHA256 values: zones `3a00d469ef2b06fa99d26290a2dc7028dc450fabaa7e27297a8ee2a1c437fbe3`;
site `40b8bae9b3a3a68be2a01d96a627bd3a44d61936971df30f3ef40a053d32c1b9`.
The installation procedure below records the reviewed transformation; **do not
reapply it** to the already-corrected files.

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

## Actual backup and rollback

After the explicit eight-hour access renewal, the ignored helper at
`/home/deploy/sqr-nat-preflight-20260910/sqr-nginx-import-read-gate.cjs` had only its
deadline changed to2026-09-12T17:29:13Z. Reviewed local/server helper SHA256:
`e15c4dd1d5a77bf9e7b523b46d490994e1ca5a1adafa8a2ad27a52a35e796a21`.
Fresh healthy-baseline preflight and apply used plan SHA256:
`7fc1a41405deabc8f6c3043ecaca6bc9b1201b54c5e25f0962bdea29d45c97dd`.
Rollback requires separately authorized access and the exact actual backup
directory `/etc/nginx/backups/sqr-import-read-20260912T103259Z`:
restore `site.conf` to the site first, then `zones.conf` to the zone file, preserving
metadata; refuse unknown intervening hashes. Run `sudo nginx -t`, reload only on
success, and independently verify health/SHA/service. Restoring the old import
location restores the known list-read bottleneck, so rollback is a recovery
option, not the finished fix.

The helper's rollback form is `sudo node /home/deploy/sqr-nat-preflight-20260910/sqr-nginx-import-read-gate.cjs --rollback /etc/nginx/backups/sqr-import-read-20260912T103259Z`.
It verifies the unchanged reviewed application, known original/candidate hashes
and backups before restoring; inspect it before use. Audit JSON is root-private
inside that backup directory. Both scoped SSH entries were removed at10:36:34UTC,
the privileged session closed, a new key login was rejected, and the local task
key pair was deleted. The other authorized key was preserved.
