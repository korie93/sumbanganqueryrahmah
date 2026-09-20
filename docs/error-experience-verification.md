# SQR enterprise error/status experience — local verification report

Verified 20 September 2026. **Local implementation complete; not deployed.**
The user approved implementation, local verification and deployment preparation only.
No commit, push, production connection, Nginx reload or production outage was performed.

## Design audit and final system

The previous 404 used a large centered decorative card and did not distinguish
authenticated recovery actions. Unknown documents returned HTTP 200 and some
unknown Collection paths opened the default Collection view. Maintenance used a
redirect to a successful document, a polling loop and a frequently changing countdown.

The replacement uses the existing SQR minimal logo, system font and light/dark
language. Neutral surfaces, thin borders and restrained blue actions provide a
consistent reading order: brand, icon/status label, one heading, explanation,
primary action, practical next steps and a secondary HTTP code. Semantic tokens
distinguish information (blue), outage (crimson), maintenance/timeout/offline
(gold) and recovery (green); labels and icons also identify each state.

The layout is content-first on phones, with full-width 48px actions. At the
existing 640px tier actions become natural width; at 1024px the explanation and
guidance form two columns, constrained to 1080px. Headings use `clamp()`, body
copy has bounded line length, safe-area tokens come from the existing source,
and `100vh` backs up `100dvh`. There are no fixed content heights, decorative
animations, external fonts, CSS frameworks in the static output or new dependencies.
Focus uses a visible outline. Only short button transitions are used, disabled
under reduced motion. Busy controls retain contrast. Styles are scoped to
`.sqr-status`; the two obsolete page stylesheets were removed (recoverable in Git).

## Architecture and response ownership

| Surface | Implementation and behavior |
| --- | --- |
| React 404 | Actual public/app routing, real authentication-dependent CTA, HTTP404 on direct invalid URLs |
| Static 502/503/504 | Build-time rendering of shared view/copy/CSS; Nginx reads independent files while Node is stopped |
| Maintenance | Existing application maintenance state and bypass policy; HTTP503 at the original document URL; login remains reachable |
| Offline/recovered | Lightweight manual recovery in React and independent static JS, no service worker or competing maintenance toggle |
| APIs | Express unknown API routes get JSON404; existing API responses pass through Nginx unchanged, including ordinary errors and upstream gateway statuses |
| Realtime | No changed upgrade, polling, session or rate-limit settings; proxy-origin failures are non-HTML for reserved/data namespaces |

Nginx interception deliberately stays **off**. Its own connection errors/timeouts
use the static fallback; upstream-owned responses are not replaced. A safe HTML
GET/HEAD document receives the branded document with its original 502/503/504.
API/WS/assets and other non-document requests receive small JSON for those edge
failures. No invented `Retry-After`, error URL, environment, stack, version or
upstream address is displayed. Error responses use `no-store`; normal hashed
application assets retain their existing immutable caching. Static locations
have a local-only CSP, nosniff, framing denial and no-referrer policy.

Maintenance's automatic page exit and page-specific polling were removed.
Existing shell entry detection continues elsewhere; manual recovery owns exit
once the status page is open. Each click has one check in flight, a 3-second
cooldown, an 8-second timeout and cancellation on hidden/unmounted pages. Only
`/api/health/live` with explicit `ready: true`, then `/api/maintenance-status`
with explicit `maintenance: false`, produces the restored state. No automatic
navigation, POST replay, idle polling or business/database readiness polling.
Browser online status is supplementary only. Malformed, oversized, non-JSON,
error and non-ready responses cannot report recovery. Real optional maintenance
ETA is shown as an estimate, without a fabricated countdown.

## Files changed and purpose

Paths below are relative to the repository; generated assets are intentionally checked in.

| File | Purpose |
| --- | --- |
| `shared/system-status.ts` | Shared Malay copy, status codes and semantic tones |
| `shared/app-document-routes.ts` | Shared exact document route set and namespace checks |
| `client/src/components/system-status/SystemStatusView.tsx` | Accessible shared layout; build-time static rendering |
| `client/src/components/system-status/SystemStatusPage.css` | Responsive light/dark semantic styles and interaction states |
| `client/src/components/system-status/recovery-check.ts` | Strict cheap endpoint verification through bounded API JSON reader |
| `client/src/components/system-status/useServiceRecovery.ts` | Manual single-flight/cancelled recovery lifecycle |
| `client/src/components/system-status/recovery-check.test.ts` | Behavioral recovery/error/abort/payload regression tests |
| `client/src/pages/NotFound.tsx` | Real redesigned 404 with auth-aware actions |
| `client/src/pages/Maintenance.tsx` | Existing maintenance details/ETA integrated with manual recovery |
| `client/src/pages/NotFound.css` | Removed unused legacy decorative styles |
| `client/src/pages/Maintenance.css` | Removed unused legacy decorative styles |
| `client/src/App.tsx` | Render authenticated unknown routes as 404 outside the application shell |
| `client/src/app/AppPageRenderer.tsx` | Explicit authenticated not-found rendering fallback |
| `client/src/app/routing.ts` | Reject unsupported document/nested paths |
| `client/src/app/usePublicAppState.ts` | Honor HTTP503 bootstrap, retain session metadata, preserve unknown routes and manual maintenance exit |
| `client/src/app/useAppShellMaintenanceState.ts` | Suspend shell checks/auto-exit only on maintenance page |
| `client/src/app/useAppShellMaintenanceState.test.ts` | Polling policy and manual recovery ownership regression |
| `client/src/app/error-route-state.test.ts` | Route/auth/forced-password and namespace agreement tests |
| `client/src/app/client-timer-cleanup-contract.test.ts` | Verify new bounded timers and cancellation cleanup |
| `client/src/pages/public-auth-modernization-contract.test.ts` | Replace retired countdown assertions with actual shared/manual lifecycle contract |
| `server/internal/frontend-static.ts` | Real document statuses; API JSON404; asset/method/realtime exclusions; safe missing-build last resort |
| `server/internal/runtime-config-manager.ts` | Existing hard-maintenance guard marks HTML503 instead of redirecting to HTTP200 |
| `server/internal/tests/frontend-static.test.ts` | Actual HTTP status, caching, deep-link, namespace and information-disclosure regression |
| `server/internal/tests/maintenance-document.test.ts` | Actual hard/soft maintenance, bypass, login, API and asset checks |
| `server/http/tests/error-document-routing.test.ts` | Include document regressions in existing HTTP/release gate |
| `scripts/build-system-status.ts` | Deterministic independent HTML/CSS/logo generation and drift check |
| `deploy/errors/502.html` | Generated independent service-outage document |
| `deploy/errors/503.html` | Generated independent unavailable document |
| `deploy/errors/504.html` | Generated independent timeout document |
| `deploy/errors/maintenance.html` | Generated independent planned-maintenance document; no new production toggle |
| `deploy/errors/assets/status.css` | Generated shared CSS and canonical safe-area tokens |
| `deploy/errors/assets/status.js` | Defensive framework-free manual recovery and offline handling |
| `deploy/errors/assets/sqr-logo.svg` | Stable copy of existing local SQR logo |
| `deploy/nginx/sqr-error-pages-http.conf.example` | Document-versus-JSON presentation maps |
| `deploy/nginx/sqr-error-pages-server.conf.example` | Internal error handlers and exact independent asset locations |
| `deploy/nginx/sqr-error-pages-response-headers.conf.example` | Security/no-store headers scoped to static error locations |
| `deploy/nginx/sqr.conf.example` | Fresh-install example references the additive include, not a replacement production site |
| `scripts/test-system-status-nginx.mjs` | Isolated real Nginx HTTP/transport/outage/recovery checks |
| `scripts/tests/system-status-nginx-contract.test.mjs` | Scope/status/API/headers/no-rate-change config contracts |
| `scripts/system-status-assets.test.ts` | SSR escaping/accessibility, payload/dependency limits, deterministic assets and actual packaging/checksums |
| `scripts/system-status-browser.mjs` | Viewport/theme/accessibility/recovery/maintenance-hook browser tests |
| `scripts/fixtures/system-status-ui.jsx` | Actual components/hooks in an isolated synthetic-API browser fixture |
| `scripts/system-status-built-browser.ts` | Actual production entry and document middleware, including auth/deep-link/maintenance rendering |
| `scripts/prepare-release-package.mjs` | Include independent assets and scoped Nginx deployment guide/snippets |
| `scripts/tests/shared-boundary-contract.test.mjs` | Classify the two new browser-safe shared modules |
| `package.json` | Generation, drift, browser/proxy commands; enforce static drift check during build |
| `docs/error-experience-nginx.md` | Active-config audit prerequisites, additive installation and rollback procedure |
| `docs/error-experience-verification.md` | This evidence, file inventory and acceptance report |
| `CODEX_CONTINUATION_HANDOFF_SQR_ENTERPRISE_ERROR_PAGES.md` | Portable task state, authority boundaries and continuation instructions |

## Test commands and results

| Command | Result |
| --- | --- |
| `npm run build:status` / `npm run verify:status-assets` | Passed; generated artifacts match shared source |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed client and server/shared |
| Scoped ESLint for new build/browser/proxy scripts | Passed |
| `npm run test:client` | Passed **1,638** tests in two batches (1,095 + 543) |
| `npm run test:scripts` | Passed **448** tests (385 + 63), including real release-package fixture and checksums |
| `npm run test:http` | Passed, including maintenance/document/API and shared-NAT rate-limit regressions |
| `npm run test:ws` | Passed **106** tests |
| `npm run test:status:browser` | Passed **160** checks, **166** screenshot captures, no unexpected/external API requests or page errors |
| `npm run test:status:built` | Passed **17** actual-built-app checks, no page errors or external requests |
| `npm run test:status:nginx` | Passed **114** actual proxy/HTTP checks; local `nginx -t` successful |
| `npm run build` | Passed client + server production build and sourcemap gate |
| `npm run verify:bundle-budgets` | Passed; no heavy runtime added to initial graph |
| JSON parsing, browser storage, breakpoint, repo hygiene and secret verifiers | Passed |
| `git diff --check` | Passed; only repository line-ending notices |

Earlier diagnostic failures were corrected before the passing reruns: obsolete
countdown/style contract assertions, canonical breakpoint/safe-area conventions,
JSDoc/key lint, TypeScript async network-state narrowing and a browser harness
login selector. They were not bypassed by weakening API/security checks.

Evidence is in ignored `artifacts/system-status-browser/results.json`,
`artifacts/system-status-built-browser/results.json`,
`artifacts/system-status-nginx/run-MB63xc/{result.json,nginx-test.txt,nginx.conf}`
and `artifacts/system-status-client-tests.log`. Browser fixtures use synthetic
API/accounts; they do not claim live authentication/database or production proof.
The real Nginx harness stops only its own Node upstream, proves CSS/JS/logo remain
available, checks real timeout504 and local503, preserves upstream API errors,
performs WebSocket101/echo and synthetic polling, then restarts the upstream.

## Manual visual verification

The complete automated matrix covers 320/360/390/430/768/1024/1440 in both themes,
including anonymous/authenticated404, maintenance, offline/restored and every
static gateway state. Axe runs at both width extremes; overflow, CTA bounds,
touch targets, landmarks, heading size and logo geometry run throughout.

Representative screenshots opened and visually inspected by the primary agent:

| Width/state | Screenshot under `artifacts/system-status-browser/` | Finding |
| --- | --- | --- |
| 320 light404 | `react-404-320-light.png` | Comfortable wrapped title, full-width actions, no clipped content |
| 360 light503 | `static-503-360-light.png` | Legible warning treatment, compact vertical rhythm |
| 390 dark504 | `static-504-390-dark.png` | Balanced long heading, distinct warning icon, no clipping |
| 430 light502 | `static-502-430-light.png` | Clear outage hierarchy and actionable guidance |
| 768 light maintenance | `react-maintenance-768-light.png` | Deliberate single-column tablet layout and natural-width actions |
| 1024 dark503 | `static-503-1024-dark.png` | Balanced two-column layout, constrained text and secondary code |
| 1440 light404 | `react-404-1440-light.png` | Aligned columns, readable measure and restrained whitespace |
| 1440 dark maintenance | `react-maintenance-1440-dark.png` | Native dark surfaces, maintenance distinct from outage |
| 1440 dark restored | `static-restored-1440-dark.png` | Clear green icon/text and explicit continuation |
| Keyboard focus | `react-404-keyboard-focus.png` | Visible unclipped focus outline |

The browser agent additionally inspected 320px dark authenticated404, light
offline, dark restored and mobile maintenance. Primary-agent review also opened
the **actual emitted production application** screenshots `anonymous-404.png`,
`user-404.png`, `maintenance-503.png` and `maintenance-restored.png` under
`artifacts/system-status-built-browser/`: stylesheet loading, auth CTA, HTTP503
bootstrap and manual continuation all matched the intended design.

## Payload / compatibility

Raw static HTML: 9,248–9,849 bytes. Shared CSS: 7,651 bytes; defensive JS: 5,279
bytes; logo: 929 bytes. Maximum cold page including all assets: **23,708 bytes
(23.2 KiB), before compression**. No React/Vite runtime, framework, webfont or
external/CDN request is needed by the static fallback. Without JavaScript the
content and safe root navigation remain usable; health verification is enhanced
when JS is available. CSS uses features within the repository's modern browser
support floor and is verified in Chromium (Chrome/Edge engine). Safari/Firefox
were not separately executed, and no unsupported cross-browser claim is made.

## Acceptance audit

All local-applicable criteria were audited against current files/results:

| Spec criteria | Evidence |
| --- | --- |
| 1–4:404/502/503/maintenance/504 | Shared view + independent generated pages; full browser matrix; real built app |
| 5–10:HTTP, no raw edge UI/version, deep links, API, WS, Node-off independence | Actual Express suites + 17 built checks +114 real Nginx checks +106 WS tests |
| 11–13:retry, safe health, recovery | Behavioral unit tests and real browser single-flight/cooldown/offline/abort/timeout/no-poll/manual continuation tests |
| 14–18:responsive layout, typography, spacing, semantics | Seven-width two-theme renders and manual screenshot review above |
| 19–20:keyboard/reduced motion | Real focus traversal/computed outline and emulated reduced-motion checks; axe at extremes |
| 21–23:lightweight scoped CSS/no dependencies | Actual asset inventory, codegen/package tests, unchanged lockfile and static external-request assertion |
| 24–25:no overflow/manual visual review | Full geometry matrix plus opened screenshots for every required width |
| 26:tests/build | Passing commands/results above |
| 27–28:proxy/config/deployment safety | Local isolated Nginx syntax/transport verified; **production inspection/reload excluded by approved local-only authority**, not claimed complete on production |
| 29–30:scope/handoff | Reviewed diff/file inventory; no business/rate/database/schema/env changes; current continuation handoff |

## Production status, rollback and remaining boundaries

No production source/runtime SHA or fresh `sudo nginx -T` was collected. Historical
configuration is not treated as active evidence. Local portable Nginx1.24.0 was
used to test legacy syntax compatibility, not recommended as a production upgrade.
There is no production backup/reload to undo because nothing was deployed.

For a later authorized rollout, follow [the exact target/backup/rollback procedure](error-experience-nginx.md#rollback).
Re-read the active configuration, preserve the split-file site's API/WS/NAT
settings, back up under `/etc/nginx/backups/`, install assets independently at
`/var/www/sqr-errors`, run `sudo nginx -t` **before** reload, verify health, then
record the literal backup path and actual source/runtime SHA. Never replace the
live site wholesale with the fresh-install example. Upstream-owned responses
remain upstream-owned; this does not conceal unrelated backend exceptions.

Full database-backed release readiness, remote CI and production verification
were not run by this local task. No new account/data/migration is required by
this feature. No unresolved local acceptance failure remains; future deployment
requires its own authorization and active-config verification.
