# Lighthouse CI Budget

SQR uses the existing `perf:pagespeed:local:strict` runner as the Lighthouse CI
gate. It invokes a pinned Lighthouse package through `npx --package`, so the
repo does not need to keep `@lhci/cli` in `devDependencies`.

## CI Flow

The `smoke-ui` job in `.github/workflows/ci.yml`:

1. Builds the app.
2. Starts `dist-local/server/cluster-local.js`.
3. Runs visual and accessibility contracts.
4. Runs the authenticated UI smoke flow before the slower Lighthouse budget gate
   so login/session regressions fail with direct smoke artifacts instead of being
   hidden by the overall job timeout.
5. Resolves the Playwright Chromium executable and passes it to Lighthouse via
   `PAGESPEED_CHROME_PATH`, avoiding runner-specific Chrome discovery failures.
6. Runs `npm run perf:pagespeed:local:strict` against the already-running local
   server with `PAGESPEED_REUSE_SERVER=true`.
7. Uploads `artifacts/pagespeed` as a GitHub Actions artifact.

## Score Thresholds

Strict mode enables `PAGESPEED_ENFORCE_THRESHOLDS=true` and fails when a usable
Lighthouse report is below:

| Category | Minimum score |
| --- | ---: |
| Performance | 85 |
| Accessibility | 95 |
| Best Practices | 90 |
| SEO | 80 |

SEO is enforced for the public, indexable home route. Login and other noindex
work surfaces still produce SEO reports for visibility, but strict mode does not
fail them for intentional crawler directives.

Override only for a deliberate baseline update:

```bash
PAGESPEED_MIN_PERFORMANCE_SCORE=88 \
PAGESPEED_MIN_ACCESSIBILITY_SCORE=96 \
PAGESPEED_MIN_BEST_PRACTICES_SCORE=92 \
PAGESPEED_MIN_SEO_SCORE=82 \
npm run perf:pagespeed:local:strict
```

## Login Resource Discovery

The V17 login illustration is a CSS background in a lazy-loaded auth layout.
CI run `36722159642` passed the UI, auth, visual and accessibility checks, but
failed the login performance budget (71): the 62 KB illustration was requested
only after the login/shared-module waterfall, about 5.5 seconds into navigation.
Its LCP was 6.5 seconds; this was not a login API failure or an image-size issue.

The production build advertises the emitted login module, its static dependency
graph, associated styles and exact hashed illustration URL as inert metadata.
The existing external boot script activates those resource hints only for an
anonymous, exact `/login` navigation. Session hints, stored users, banned and
maintenance states, and denied storage access skip the optimization. Other
routes do not activate the login hints. Styles are preloaded, not applied;
modules are fetched, not executed; routing and authentication remain unchanged.
The image uses a non-CORS preload to match the CSS background request and avoid
downloading it twice. Dynamic/private feature imports are not traversed.

Preloading alone is insufficient when many tiny icon/helper chunks still queue
behind HTTP/1.1 connection limits. An exact allowlist of existing login helpers
and icons is grouped into one lazy `public-auth-runtime` chunk. Existing vendor
and entry groups retain higher priority to prevent that group absorbing shared
icon core or validation and becoming eager on every route. See Rolldown's
[code-splitting priorities](https://rolldown.rs/reference/OutputOptions.codeSplitting).

Regression coverage checks build metadata, route/session isolation and early,
single-fetch image discovery while the lazy login module is held back. Keep
the score thresholds and login's deliberate noindex policy unchanged when
investigating this class of failure.

### Verification of the login discovery fix (2026-09-30)

Local Lighthouse 13.0.3 / Chrome 153 measurements used the production build
served from an isolated, compressed loopback fixture, without dotenv, a real
database, or production requests. The same mobile preset and existing
route-specific score thresholds were used; no CI gate or retry policy changed.

| Login build | Performance | LCP |
| --- | ---: | ---: |
| Before fix | 73 | 6.1 s |
| Preloads alone (insufficient) | 74 | 5.3 s |
| Final lazy helper grouping + preloads | 88 | 3.6 s |
| Final confirmation | 89 | 3.5 s |

The final login reports also scored accessibility 100 and best practices 96.
The unchanged landing measured 84 then 87 (LCP 2.8/2.7 s; TBT 450/360 ms), so
retain both results as local rendering variance rather than claiming every
local performance run passed. GitHub's next full run remains the release gate.

Other verification: production build, bundle budgets, TypeScript (including
the Vite plugin separately), client lint, secret scan, 611 client tests,
569 script tests (one existing skip), 36 V17 browser checks, 22 landing checks,
and all 17 existing visual tests passed without updating snapshots.
Script tests needed a clean test environment to exclude an unrelated local
`LOG_FORMAT` value. Browser functional checks used the explicit installed
Chrome executable as CI does; the default local Chromium suppressed a
carousel click after a synthetic swipe, so no carousel code/assertions were
changed to accommodate that browser-specific result.

### Follow-up: CSS-blocked discovery and small-request overhead (2026-10-01)

CI run [36736021825](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/36736021825)
on `7530abd4` passed functional, visual and accessibility checks but still failed
login's performance budget: 82, LCP 4.2 s, versus home 96. The image preload was
working. However, the deferred boot script waited for entry CSS before starting
the hints, and ten login JS plus three CSS requests still queued before render.
Full security headers added roughly 3 KB to each small response; the earlier
isolated measurements above did not include those headers.

The external boot script is now async, after the app root and all build metadata,
with a matching head preload. It can discover resources while entry CSS is still
loading. If React has already populated the root, late boot is a no-op, preserving
the app's language, metadata and navigation. Session/maintenance/route guards,
external-only executable scripts and CSP remain unchanged.

The existing lazy auth runtime also groups the exact shared `AuthV17Layout`,
`PublicAuthControls` and `ExpandableMessage` modules. `lib/utils.ts` joins its
existing `ui` dependencies. The emitted login closure now adds five JS and two
CSS requests instead of ten JS and three CSS requests. The Login facade remains
lazy; APIs, private pages and the initial entry keep their existing boundaries.
No illustration, layout, authentication logic, security header or score threshold
was changed.

Local comparisons use Lighthouse 13.0.3 / Chrome 153, the same mobile preset and
compression, and the actual `registerLocalHttpSecurityHeaders` middleware. Its
runtime configuration was stubbed in an isolated loopback fixture, without
dotenv, a database or production traffic. All measurements are retained under
the ignored `artifacts/login-lcp-fix/` directory:

| Login build with security headers | Performance | LCP |
| --- | ---: | ---: |
| Previous committed build | 85 | 3.9 s |
| Async boot alone (insufficient margin) | 85 | 3.9 s |
| Async boot + shared presentation grouping | 90 | 3.3 s |
| Final confirmation | 90 | 3.3 s |

Both grouped-login reports scored accessibility and best practices 100, with
CLS 0. Home also passed: performance 86, accessibility 96, best practices 100,
SEO 100, LCP 2.9 s. Its accessibility finding concerned two existing low-contrast
mini-record labels; the home and entry stylesheet hashes matched the failed CI
run, and no auth CSS or modules entered home's static dependency graph. The
intentional login noindex policy remains unchanged. Local fixture results are
not a substitute for the next full GitHub CI run.

Verification passed: production build and sourcemap gate, bundle/entry-shell
contracts, TypeScript (including build configuration separately), client lint,
secret scan, 614 client tests, 569 script tests (one existing skip), 38 V17 auth
browser checks, 22 landing checks and all 17 visual tests without snapshot
updates. Browser checks explicitly hold entry CSS to prove early discovery,
then hold boot itself to prove late execution preserves an English auth view
and reuses the head-preloaded script. Script tests use the same clean isolated
environment described above. No production deployment was performed.

## Local Usage

Create `.env.smoke.local` or export the same PostgreSQL variables used by smoke
tests, then run:

```bash
npm run perf:pagespeed:local:strict
```

The runner automatically uses `PAGESPEED_CHROME_PATH`, `CHROME_PATH`, or the
Chromium executable installed by Playwright. When a Chrome path is available it
pre-launches Chrome on a local debugging port and runs Lighthouse with `--port`;
this avoids runner-specific Chrome launcher discovery and startup races. To
force a specific browser:

```bash
PAGESPEED_CHROME_PATH="$(node -e 'console.log(require("playwright").chromium.executablePath())')" \
npm run perf:pagespeed:local:strict
```

Set `PAGESPEED_PRELAUNCH_CHROME=false` only when diagnosing Lighthouse's own
Chrome launcher. Chrome startup logs are written to `artifacts/pagespeed/pagespeed-chrome.log`.

For diagnostics that should write artifacts without enforcing score thresholds:

```bash
npm run perf:pagespeed:local
```

Reports are written to `artifacts/pagespeed` by default:

- `pagespeed-local-summary.json`
- `pagespeed-local-summary.md`
- per-route Lighthouse JSON reports
- server log when the runner starts the app itself

## Baseline Changes

Only change thresholds after reviewing:

1. CI artifact reports for the affected route.
2. Web Vitals telemetry from the same build.
3. Whether the regression is code, data, infrastructure, or a test environment
   limitation.

Document accepted baseline changes in the pull request and avoid lowering the
accessibility threshold unless an accessibility owner approves it.
