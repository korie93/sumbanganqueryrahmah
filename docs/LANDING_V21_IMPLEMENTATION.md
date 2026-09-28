# SQR landing V21 implementation

Verified locally on 2026-09-28. Scope: the approved English V21 public landing
page from `sqr-landing-v21-en.zip`, integrated into the existing React/Vite app.
No commit, push, deployment or production-data operation was performed.

## Architecture and routing

- Anonymous `/` loads the V21 landing through the existing lazy route.
- Every Sign In link has a real `/login` href and uses the existing navigation
  callback for ordinary clicks. Modified clicks retain native browser behavior.
- `/login`, account recovery, 2FA, session handling, RBAC and authenticated routes
  retain their existing logic. Authenticated `/` still enters the internal app;
  users are not forced through the public landing.
- Semantic React sections replace the old landing components. The interactive
  preview and carousel own their state and clean up timers, observers/listeners
  and scheduled frames. No live records or APIs power the preview.
- No backend, database, Nginx, dependency versions or secrets were changed.

## Files changed

Under `client/src/pages/`:

- `Landing.tsx`: composes V21 content inside the existing lazy route.
- `LandingRouteFallback.tsx`, `LandingRouteFallback.css`: small meaningful English
  loading shell, without eagerly importing the full landing page.
- `landing-v21/LandingSections.tsx`: approved navigation, hero, workflow, core
  functions, security, About, CTA and footer markup/copy.
- `landing-v21/PreviewViews.tsx`, `ProductPreview.tsx`, `RelativeDate.tsx`:
  three synthetic preview panels, keyboard tabs, rotation and persistent pause.
- `landing-v21/LandingLink.tsx`: native links plus scoped anchor/focus navigation.
- `landing-v21/TestimonialCarousel.tsx`, `testimonials.ts`: five approved comments,
  touch/keyboard/arrow/dot navigation and end-of-track selection handling.
- `landing-v21/useLandingMotion.ts`: reduced motion, visibility, offscreen,
  hardware/save-data and existing low-spec preference handling.
- `landing-v21/landing-v21.css`: isolated source styling and small integration fixes.
- `landing-v21/landing-v21-contract.test.ts`: CSS/keyframe isolation, bounded
  dependencies, no live-data calls and resource-cleanup regression tests.
- `landing-entry-performance-contract.test.ts`,
  `public-auth-modernization-contract.test.ts`: updated boot and landing contracts.
- Removed superseded `Landing.css`, `LandingDeferredSections.tsx`,
  `LandingHeroInsightStrip.tsx`, `LandingHeroShell.tsx`, `LandingProductPreview.tsx`.
  Their previous versions remain recoverable from Git.

Other frontend files:

- `client/index.html`: English metadata, canonical/social tags and inert
  SoftwareApplication JSON-LD.
- `client/public/boot-shell.js`, `boot-shell.css`: English/light landing boot only;
  direct public-auth routes keep their existing Malay boot copy.
- `client/src/app/document-metadata.ts`, `document-metadata.test.ts`: route-aware
  language/metadata and schema cleanup/restoration without Trusted Types sinks.
- `client/src/app/client-timer-cleanup-contract.test.ts`,
  `public-auth-memory-contract.test.ts`: updated lifecycle and public-entry contracts.
- `tailwind.public.config.cjs`: bounded scanning of new landing components.

Verification/configuration:

- `scripts/landing-v21-built-browser.mjs`: read-only loopback production-build
  browser suite, synthetic API responses, blocked external requests and screenshots.
- `package.json`, `.github/workflows/ci.yml`: `test:landing:built` command and CI step
  with artifact upload, after the existing production build.
- `scripts/lib/client-breakpoint-contract.mjs`,
  `scripts/tests/client-breakpoint-contract.test.mjs`: retain approved 390/900/1040px
  widths only for the exact isolated V21 stylesheet; internal tiers remain unchanged.
- `scripts/lib/client-entry-shell-contract.mjs`,
  `scripts/tests/client-entry-shell-contract.test.mjs`: permit only the strictly
  validated inert application schema, not executable inline scripts/styles.
- `scripts/tests/tailwind-public-config.test.mjs`: cover new landing files.
- `tests/visual/app.visual.spec.ts`: new brand and Sign In link expectations.
- This report.

## Assets, styling and accessibility

The ZIP contains the approved HTML but its assets directory is empty. With user
approval, existing deployed assets are reused: `/brand/sqr-logo-minimal.webp` for
Open Graph/Twitter and `/apple-touch-icon.png` for Apple Touch Icon. Both return
200 from the production build. Twitter remains `summary`; no missing OG cover is
referenced. Live production URLs were not tested or changed in this task.

All V21 CSS selectors and animation names are namespaced. The approved light
design remains independent of a saved dark theme, without changing that saved
preference. The original CSS cascade is retained for visual fidelity. Small fixes:

- stable anchor layout instead of offscreen intrinsic-size placeholders;
- readable numbered-card contrast and visible focus states;
- 32px carousel-dot hit areas with the approved smaller visual dots;
- reliable explicit selection when desktop end cards share a clamped scroll position;
- persistent Pause and content visibility when global low-spec removes animations.

No new packages, fonts, remote resources or animation libraries were added.

## Verification results

| Command / check | Result |
| --- | --- |
| `npm run build` | PASS, production assets/server emitted, no production source maps |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, frontend and backend |
| `npm test` with isolated test environment | PASS: 4,493 passed, 64 conditional skips, zero failures |
| `npm run test:visual:built -- --workers=1` | PASS: all 16 existing tests; no baseline updates |
| `npm run test:landing:built` | PASS: 19 checks, zero page errors or failed/off-origin assets |
| `npx tsx --test client/src/pages/landing-v21/landing-v21-contract.test.ts` | PASS: 5 tests |
| `node --test scripts/tests/client-breakpoint-contract.test.mjs scripts/tests/client-entry-shell-contract.test.mjs scripts/tests/tailwind-public-config.test.mjs` | PASS: 16 focused tests |
| `npm run verify:bundle-budgets` | PASS, all existing budgets unchanged |
| `npm run verify:client-entry-shell-contract` | PASS |
| `npm run verify:client-breakpoint-contract` | PASS |
| `npm run verify:design-token-color-compatibility` | PASS |
| `npm run verify:repo-hygiene` and `git diff --check` | PASS |

The initial unrestricted-environment `npm test` attempt encountered an existing
local `LOG_FORMAT` configuration rejection. The passing run used `NODE_ENV=test`,
`DOTENV_CONFIG_PATH` set to a checked-nonexistent artifact path, removed inherited
`LOG_FORMAT` for that child shell only, and test-only PostgreSQL identity at
`127.0.0.1:1`. No `.env` was edited. Windows sandbox Node initialization errors
required approved local execution for builds/tsx tests. Conditional integration
tests requiring external/disposable services remain skipped, not counted as passes.

Browser validation uses built assets and synthetic fixtures, not production
accounts. It covers 320/360/375/390/412/430/768/1440px widths, every preview panel,
no horizontal page overflow, keyboard navigation, persistent pause/rotation,
offscreen/document visibility events, reduced motion, hardware and explicit
low-spec modes, saved dark-theme isolation, anchors, carousel end/dot states and
real touch-event swiping. Desktop and mobile axe WCAG 2/2.1 AA scans report no
violations. A separate context enforces strict script/style CSP and Trusted Types
through preview interactions and the landing/login/schema round-trip.

A direct rendered-reference comparison at 390px and 1440px also confirmed
matching font families/sizes and bounding dimensions for the brand, hero heading,
hero paragraph, eyebrow, product preview, core-function card and testimonial card.

Existing visual baselines verify login, dashboard, Save Collection and settings
in both themes, plus table/monitor/search/import interactions and Billing readiness.
Actual production login/database flows were not exercised.

Screenshots and logs are in ignored `artifacts/landing-v21-browser/`,
`artifacts/landing-v21-reference/` and `artifacts/landing-v21-*.log`. Reference
extraction and diagnostic helpers are not production source or shipped assets.

## Final status

No known landing-specific failures remain in the checks above. Production build
is successful. This is local implementation verification, not a claim that live
CI, deployment or all real-service integrations have been executed.

IMPLEMENTATION COMPLETE — VERIFIED

## CI performance follow-up — verification pending

The implementation verification above predates the first pushed CI run. CI run
[`36369860028`](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/36369860028)
for commit `2e5403be` failed only the PageSpeed Lighthouse budget step: the mobile
home page scored **82**, below the unchanged minimum of **85**. Its reported
metrics were FCP **2,081 ms**, LCP **4,108 ms**, TBT **124 ms** and CLS **0**. The
build/test, coverage, visual, accessibility and UI smoke checks passed.

The Lighthouse report identified the hero heading as the LCP element. Landing
JavaScript and CSS were discovered late in the initial loading sequence; the
heading also depended on its entrance animation becoming visible. The scoped
follow-up addresses those delays:

- The hero heading and introductory paragraph are immediately visible, without
  waiting for an entrance animation. Other landing motion retains its existing
  controls and reduced-motion/low-spec handling.
- A build-only Vite plugin emits inert metadata for the landing chunk, its CSS
  and direct static helper dependencies not already referenced by the generated
  HTML. Only validated same-origin `/assets/` JavaScript/CSS paths are accepted.
- The deferred boot script receives high fetch priority and consumes those hints
  only on the exact anonymous `/` path. It creates high-priority module/style
  preloads; it does not execute the landing module or apply the stylesheet. The
  existing lazy route still owns rendering and stylesheet activation.
- Anonymous CORS settings match Vite's eventual requests, allowing the browser
  to reuse the preloaded responses rather than requiring a different request mode.
- Authentication-hint cookies, stored users, banned-session flags and maintenance
  metadata suppress this optional preloading. Denied cookie or storage access
  falls back to normal lazy loading without preventing the boot shell from painting.
- An exact allowlist combines existing public-entry helpers and four error-boundary
  icons into `public-runtime`; the initial static JavaScript graph shrinks from
  16 files to five. Private pages, the rest of the icon library and heavy features
  remain separately loaded. Main-entry and other bundle budgets are unchanged.
- Motion preferences are read on first client render instead of initially applying
  low-spec classes and immediately removing them. Identical preference updates
  reuse the existing state; live preference/visibility listeners retain cleanup.

This follow-up does not change backend, database, authentication or route
decisions, and does not relax CI budgets or skip the failing performance check.

Follow-up verification (2026-09-28, uncommitted fix):

| Check | Result |
| --- | --- |
| Production build / source-map gate | PASS |
| Typecheck / frontend and backend lint | PASS |
| Complete client tests | 1,726 passed, zero failures |
| Script/config tests | 544 passed, one conditional skip, zero failures |
| Built landing, Chrome 153 (matching CI major) | 22 checks passed |
| Existing built visual suite | 16 passed; no snapshot updates |
| Existing bundle budgets / repository hygiene / secret scan / diff whitespace | PASS |

Three sequential Lighthouse 13.0.3 mobile `perf` runs of the final frontend on
Windows Chrome 153, using native headless launch and an isolated compressed
loopback server, scored **84, 89, 88** (median **88**). LCP was **2.8, 2.6, 2.7 s**;
FCP **1.6 s**, CLS **0**, accessibility **96**, best practices **96** and SEO **100**
in all three. Two runs passed all existing home thresholds; the first remained
one point below the performance minimum. This is measured variability, not a
claim of a guaranteed score. No threshold or CI retry policy was changed.

The final mobile login sample scored **97** performance, **100** accessibility,
**96** best practices, LCP/FCP **1.5 s**, TBT **0 ms**, CLS **0**. SEO was **66**
because login is intentionally non-indexable; the existing CI login policy
excludes SEO from its score gate. Its applicable thresholds pass unchanged.

Local preliminary probes included slower Chromium 148 runs and a failed native
Chrome launch inside the Windows sandbox; final measurements used approved
native Chrome execution. An initial Chromium 148 browser run also failed a touch
carousel selection; the complete 22-check suite passed on CI-major Chrome 153.
No assertion or snapshot was relaxed in response.

These are local synthetic checks, not production/database traffic. A fresh
GitHub CI result is still required after commit/push. This implementation
verification did not rerun remote workflows or deploy. Raw local measurement reports and logs
are under ignored `artifacts/landing-v21-reference/` (the `native-motion-*`
reports are the three final home samples).
