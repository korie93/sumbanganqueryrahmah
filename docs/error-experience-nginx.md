# SQR enterprise error pages: additive Nginx integration

## Scope and current evidence

This change is prepared and tested **locally only**. It does not deploy, reload,
stop, or connect to production. The active production configuration must be read
again, with fresh authorization, before any production change.

The historical 12 September 2026 records identify the site as
`/etc/nginx/sites-available/sqr-system`, linked from `sites-enabled/sqr-system`,
with separate API, WebSocket and telemetry snippets. Those records are not a
current `nginx -T`. The previously supplied local `nginx-active-sanitized.txt` was
not present during this audit. See the [NAT rollout](SQR_429_ACTIVE_NGINX_ROLLOUT.md)
and [later import-read correction](SQR_NGINX_IMPORT_READ_ROLLOUT.md).

**Never replace that split-file site with `deploy/nginx/sqr.conf.example`.** The
example is for a fresh installation; its rate-limit values differ from the
installation-specific values. This change adds no rate-limit settings and does
not change certificates, proxy headers, upload access, auth, or business logic.

## Response ownership

| Response | Owner and behavior |
| --- | --- |
| Healthy application/deep link | Existing Express/React routing; unchanged by Nginx |
| Application 404 | Application renders its branded 404 with HTTP 404 |
| Planned application maintenance | Existing maintenance state; branded application HTML 503 is passed through unchanged |
| Application API errors, including 502/503/504 | Original body, status and headers pass through; no HTML conversion |
| Nginx-origin 502/503/504, HTML GET/HEAD document | Matching standalone static page, original status preserved |
| Nginx-origin 502/503/504, API/realtime/assets/other request | Small compatible JSON error, original status preserved |
| WebSocket and polling while healthy | Original upgrade/transport settings and response unchanged |

`proxy_intercept_errors off` is intentional **everywhere**. Nginx-origin errors
still use `error_page`; upstream-owned responses are never intercepted. This
also protects uncommon API aliases and non-API JSON endpoints from body changes.
The application owns planned maintenance and uses the shared status design;
there is no new Nginx maintenance flag, bypass, operator endpoint or forced ETA.

The standalone `maintenance.html` artifact and its internal-only handler are
available for isolated verification. No shipped rule activates edge maintenance.
Do not add a production switch without separately reviewing its auth, API and
recovery behavior.

HTML selection requires GET/HEAD, an HTML Accept header, a document/iframe (or
legacy absent) fetch destination and a non-reserved route. API, internal, WS,
Socket.IO, telemetry, asset and upload prefixes are explicitly excluded even if
the caller sends `Accept: text/html`. These selectors affect presentation only;
they are not trusted identities, permission checks, or rate-limit keys.

## Files and installation layout

| Repository artifact | Independently installed target |
| --- | --- |
| `deploy/nginx/sqr-error-pages-http.conf.example` | `/etc/nginx/conf.d/sqr-error-pages-http.conf` (HTTP context, once) |
| `deploy/nginx/sqr-error-pages-server.conf.example` | `/etc/nginx/snippets/sqr-error-pages-server.conf` (server context) |
| `deploy/nginx/sqr-error-pages-response-headers.conf.example` | `/etc/nginx/snippets/sqr-error-pages-response-headers.conf` (static locations only) |
| `deploy/errors/` | `/var/www/sqr-errors/` (not an app symlink) |

HTML handlers are exact and `internal`, for example `/_sqr/errors/502.html`.
Only three exact public assets are served:

- `/_sqr/errors/assets/status.css`
- `/_sqr/errors/assets/status.js`
- `/_sqr/errors/assets/sqr-logo.svg`

All other paths below that prefix return a bounded JSON 404. No directory listing,
uploads, build source, map file, configuration or filesystem path is exposed.
The static directory must remain readable after Node/PM2 stops or an application
release symlink changes. Install root-owned files with worker read/traverse access,
typically directories 0755 and files 0644; do not grant the application write access.

The static locations alone add `Cache-Control: no-store`, `nosniff`, a no-referrer
policy, framing denial and a restrictive CSP allowing only local assets and
same-origin recovery requests. They do not duplicate Helmet headers on proxied
responses. The existing site must retain `server_tokens off`; the normal open
source Nginx Server header may identify `nginx`, but contains no version and the
error body has no Nginx branding. No invented `Retry-After` is added.

## Approved deployment procedure (not executed by this task)

1. Obtain production deployment authorization. Reconfirm host identity, actual
   source/runtime SHA, clean approved release, current health and enabled-site
   symlink target. Privately inspect `sudo nginx -T`; share only sanitized excerpts.
   Confirm no existing handler, map, location or include uses the new names.
2. Record `sudo nginx -t`, all relevant active files and their SHA256 hashes.
   Confirm where `conf.d/*.conf` is included in HTTP context and whether a more
   specific `error_page` overrides server inheritance. Keep the existing API,
   auth, import, telemetry, `/ws`, assets and ACME locations in their current order.
3. Create a **new**, timestamped backup directory outside loaded Nginx include
   directories, e.g. `/etc/nginx/backups/sqr-error-pages-YYYYMMDDTHHMMSSZ`. Record
   its exact generated path. Preserve ownership/modes/timestamps for the resolved
   site file and every already-existing target in the installation table. Record
   which targets did not exist; do not assume they were absent. Back up any existing
   `/var/www/sqr-errors` tree separately before replacing reviewed error assets.
4. Verify the approved release artifact/inventory and stage the reviewed assets
   and three snippets. Confirm every HTML/CSS/JS/logo file exists and is readable
   as the Nginx worker. Install the HTTP map once, normally via the existing HTTP
   `conf.d/*.conf` include. Do not include it a second time from the site.
5. Add just this line in the **existing HTTPS server block**, preserving all other
   directives and location bodies:

   ```nginx
   include /etc/nginx/snippets/sqr-error-pages-server.conf;
   ```

   Inspect any inherited/local `proxy_intercept_errors on` or `error_page` rule:
   the intended effective state is interception off for every proxied location,
   with only the 502/503/504 handlers added. Do not silently override an unknown
   installation-specific policy; stop and review it first.
6. Review the exact diff and target hashes. Run `sudo nginx -t` after each config
   change and again immediately before reload. If any check fails, **do not reload**.
   Only after successful validation, `sudo systemctl reload nginx`, then verify
   service activity, new-worker health, public/local readiness and runtime SHA.
7. Verify normal HTML, application 404, API unauthorized JSON, auth cookies,
   WebSocket upgrade and the error assets. Do not stop production, force database
   failure or change real maintenance state just to manufacture 502/504 evidence.
   Use the isolated proxy runner for deliberate outage/timeout tests. If a staging
   environment exists, perform the same checks there before production promotion.
8. Record the actual backup path, file hashes, config test output, reload result,
   service health, runtime SHA and browser checks in the continuation handoff.

### Rollback

Use the **literal backup path recorded in step 3**, not a regenerated timestamp
or the example placeholder. First verify target paths and post-install hashes;
stop if later changes would be overwritten. Restore the backed-up resolved site
file and any pre-existing snippet/map/static targets with their metadata. Remove
only newly created targets recorded as absent, after confirming their exact paths
and hashes; keep the backup recoverable. Do not delete `/var/www`, `/etc/nginx`, an
application checkout, a release tree, uploads, or any glob-selected collection.

Run `sudo nginx -t` before reload. On success reload and re-check normal app/API/
WebSocket health and SHA. If validation fails, leave running workers alone and
review the restored files. Application rollback remains a separate immutable
release operation; restoring these error-page files requires no database migration.

## Local proxy verification

```sh
node --test scripts/tests/system-status-nginx-contract.test.mjs scripts/tests/nginx-production-contract.test.mjs
node scripts/test-system-status-nginx.mjs
```

The second command uses `SQR_NGINX_EXECUTABLE` when set, otherwise `nginx` on PATH.
On Windows it also recognizes the explicitly downloaded, ignored test binary
`artifacts/system-status-nginx-tools/nginx-1.24.0/nginx.exe`. It never downloads
software itself. A portable binary must come from the [official distribution](https://nginx.org/en/download.html)
and be verified against its detached signature and the corresponding
[official public key](https://nginx.org/en/pgp_keys.html). A known-good signature
does not by itself establish independent trust in the signing identity.

The compatibility run used official Nginx 1.24.0 only as a loopback-only test tool,
matching the documented legacy production version; this is **not** advice to
install that older version in production. ZIP SHA256:
`69a36bfd2a61d7a736fafd392708bd0fb6cf15d741f8028fe6d8bb5ebd670eb9`.
Detached signature verification succeeded using the official key with fingerprint
`13C82A63B603576156E30A4EA0EA981B66B0D967`.

The runner starts its own synthetic upstream and Nginx on loopback ephemeral
ports, validates the actual snippets with `nginx -t`, records response assertions,
stops its own upstream to prove static fallback independence, restarts it to prove
recovery, and quits only its own Nginx using its unique PID/config directory.
Artifacts are under `artifacts/system-status-nginx/run-*/`. No `.env`, database,
user account, production service or credentials are loaded. The controlled
one-second timeout and synthetic failure locations exist only in this harness;
they never change production proxy timeouts or admission thresholds.

It checks real HTTP GET/HEAD statuses, content types, cache/CSP behavior, HTML
versus JSON routing, all ordinary API statuses and upstream 502/503/504, static
assets with Node stopped, real WebSocket 101 + echo and an unchanged polling
transport response. This proves proxy behavior, not live production integration
or the app's authenticated realtime session protocol; those have separate tests.
The fixture is explicitly synthetic and the saved result labels that boundary.

### Semantics references

Nginx documents that [`error_page`](https://nginx.org/en/docs/http/ngx_http_core_module.html#error_page)
preserves the original status unless explicitly replaced, and that internal
locations restrict direct access. The [`proxy_intercept_errors`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_intercept_errors)
setting controls replacement of upstream-owned responses; leaving it off is
deliberate here. [Windows Nginx](https://nginx.org/en/docs/windows.html) runs as
a console application and uses forward-slash paths, so the harness creates a
private prefix and does not install a system service.
