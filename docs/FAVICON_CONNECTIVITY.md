# Browser tab connectivity favicon

The browser tab uses the exact supplied online/offline images from
`SQR_Favicon_Online_Offline_GMAIL_SAFE.zip`. Online is the blue Q with its original
decorative dots; offline is the grey Q without dots. The package's white tile is
intentional. `assets/brand/favicon-status-provenance.json` records the ZIP SHA256,
entry names and hashes. Existing workspace, login, status-page, touch and PWA
artwork remains independent of the tab icon.

## Runtime and endpoint

`client/src/main.tsx` installs one page-lifetime controller from
`client/src/app/favicon-status.ts`. It survives React Strict Mode and SPA route
changes; metadata updates no longer write tab icons. HMR disposes the controller.

- `GET /api/health/connectivity` is public and returns an empty `204` with
  `X-SQR-Connectivity: ok` and `Cache-Control: no-store, no-cache, must-revalidate`.
  A failed startup returns empty `503` without the success marker. No database
  query, session renewal or account lookup is performed by the route.
- The client requires `204`, the exact marker, a `no-store` directive and no
  redirect. HTML fallback, login redirect, missing marker, cacheable lookalike,
  other status codes, DNS/TLS/network failures and timeout cannot establish online.
- Visible tabs check immediately and every 20 seconds after the previous check
  finishes. Each request has a 5-second timeout. One failed check is confirmed
  after 2 seconds before showing grey; a device `offline` event shows grey
  immediately. An `online` event triggers a fresh check before restoring blue.
- Hidden tabs and `pagehide` cancel pending requests and suspend polling;
  visibility return and `pageshow` resume with a fresh check. Late responses from
  cancelled requests cannot overwrite the current state. Timers do not overlap.
- The 32px offline PNG is embedded in the initial JavaScript bundle using Vite's
  `?inline` asset import. The grey icon requires no image request after failure.
  Original online URLs, MIME types and sizes are restored on recovery. No new
  icon links are appended; the touch icon and manifest are not modified.
- New `favicon-online-v1-*` static names avoid the previous icon cache. There is
  no cache-busting URL on every poll. Requests use same-origin relative URLs,
  `cache: no-store`, `redirect: error` and `credentials: omit`.
- The existing API proxy forwards this endpoint; API responses already have
  no-store headers. No service worker is registered in this repository. If one is
  introduced later, this endpoint must remain network-only.
- Existing application CSP already permits PNG data URLs in `img-src`; its
  directives have not been changed. Independently served Nginx error documents
  retain their existing static favicon and restrictive CSP.

Connectivity probes have their own bounded anonymous IP bucket, 120 requests per
10 seconds, separate from ordinary API traffic. Only exact GET/HEAD requests to
this endpoint qualify. Normalized IP keys, Redis protection and failure handling
remain enforced. This permits synchronized probes from an office sharing an IP
without consuming its ordinary API allowance.

Blue means the application process can respond to this lightweight endpoint.
It does not promise database, upstream-provider or collection mutation success.
Dynamic status applies to an already loaded page with JavaScript running; this
feature does not add an offline shell or a new service worker. Browsers may delay
painting a tab icon, especially while a tab is suspended.

## Verification and manual QA

```sh
npm run typecheck
npm run lint
npm run test:client
npx tsx --test server/routes/tests/system.routes.integration.test.ts server/http/tests/apiProtection.test.ts
npm run build
npm run verify:bundle-budgets
npm run test:visual:built -- --grep "favicon status|brand migration" --workers=1
```

Browser scenarios use a loopback static production-build server and synthetic
API fixtures. They cover backend 503, HTML fallback, missing marker/no-store,
redirect, network failure, repeated recovery, actual browser offline, navigation,
reload, embedded PNG decoding under the relevant application CSP, and supplied
16/32/48px assets against light/dark backgrounds. Unit tests additionally cover
actual timeout scheduling, cancellation races, hidden tabs, page lifecycle,
duplicate installation and listener/timer cleanup. Backend tests exercise
startup/degraded/failed states and independent bounded office-IP quotas.

For manual QA, open an SQR tab, then use Chrome DevTools Network → Offline. The
icon should turn grey. Return Online: the icon should return blue after the
endpoint succeeds. To simulate a backend outage without stopping production,
use DevTools request blocking for `*/api/health/connectivity*`; the visible tab
turns grey after the next probe and confirmation. Remove the block to recover on
the next poll, or hide and show the tab to trigger a fresh check. Do not submit
real collection mutations while simulating an outage.

## Deployment and rollback

Follow `docs/IMMUTABLE_RELEASES.md`: commit/push the completed change, wait for CI
and Release Verification, and deploy the approved production-release artifact
with its SHA512 sidecar and exact expected SHA. Do not deploy a dirty local build.
No database migration or Nginx configuration/static-asset update is required.

After deployment, verify `GET /api/health/connectivity` has the exact `204`, marker
and no-store contract, `health/version` matches the approved commit, and the
versioned online PNG/ICO paths return the expected image types. Use local or
staging failure simulations; keep production available.

Rollback uses the retained immutable previous release:

```sh
export SQR_RELEASE_ROOT=/home/deploy/apps/sqr-runtime
export NODE_EXTRA_CA_CERTS=/home/deploy/apps/sumbanganqueryrahmah/.runtime/redis-ca.crt
bash /home/deploy/apps/sqr-runtime/current/deploy/immutable/rollback-release.sh
curl -fsS https://sqr-system.com/api/health/version
```

Reload an existing tab after rollback to obtain the previous client runtime.

## Implementation checkpoint — 12 October 2026

- TypeScript and client/server ESLint: PASS.
- Complete client test suite: PASS, both batches, no skipped tests.
- System routes and API protection suites: 48 PASS.
- Existing authenticated NAT and recovery-NAT suites: 31 PASS.
- Complete script test suite: PASS in an isolated test environment. The first
  attempt inherited unsupported `LOG_FORMAT`; the successful run omitted it and
  disabled local dotenv loading, without editing `.env`.
- Production build, static status consistency, CSP hashes and sourcemap gate:
  PASS. Existing bundle limits remain unchanged; main JS is approximately
  17.4 KiB gzip against 20 KiB, and records JS is 18,311 bytes against 18,432.
- Final built Chromium run: 14 PASS, covering the new favicon scenarios,
  original brand/PWA asset decoding, workspace theme switching and unchanged
  light/dark login screenshot baselines. The supplied size previews were visually
  inspected; the 16/32/48px grey icons have no decorative dots.
- Repository hygiene, secret scan, exact asset SHA256 provenance and diff check:
  PASS. A separate read-only review found no remaining lifecycle/race issue.

Implementation and local verification are complete. Commit and push were
requested on 13 October 2026. The local build has dirty-source metadata and must
not be used as a production release artifact. Production deployment is a separate
step using an approved CI artifact after CI and Release Verification succeed.
