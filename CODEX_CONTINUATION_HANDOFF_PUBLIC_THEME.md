# Public theme continuity and landing startup — 2026-11-01

## Scope and status

Implement the approved landing → login → authenticated workspace theme continuity,
remove the old landing content shown briefly during startup, and use the supplied
night illustration only on dark login, preserving the light layout. Implementation and focused functional QA are
complete. **Local strict PageSpeed remains below its original performance gate.**
Do not describe this as a fully green release verification.

Base/production commit: `98f2769965283f516888681667988641fc7b0af6`.
Commit/push was subsequently authorized after local QA. Check Git history and
remote state for publication status; production deployment is a separate task.

## Implementation

- Keep the existing canonical `theme` preference and existing workspace controls.
  `client/src/components/useTheme.ts` is unchanged (normalized SHA-256
  `1da25c86ec8ad0a6b0927e0a0df787ea92b007b300d74088d6e6ceea5dd2424a`).
- `landing-theme-migration.ts` retires `sqr-landing-next-theme`. A valid canonical
  preference wins; remove a legacy preference only after a valid canonical value
  exists or its migration succeeds. Startup resolves the theme before React mounts.
- `useLandingNextMotion.ts` publishes a choice synchronously through the existing
  `applyTheme`, follows OS changes until an explicit preference, and cleans up its
  listeners. Existing motion/visibility behavior is preserved.
- `AuthV17Layout` applies the theme to login. Recovery/activation retain their
  existing light surfaces. Light retains its original illustration. Dark login
  uses the supplied `1000327789.png`, exported at its original 1359×1157 dimensions
  to `sqr-illustration-dark.webp` (89,032 bytes; no crop, redraw or recoloring).
  Dark CSS no longer inverts the light image: filter is none and blend is normal.
  The dark panel matches the supplied night background, with edge masking.
- The image source is a CSS variable; both themes share the exact frame, sizing,
  position and responsive rules. Browser measurements at 320/722/1440px verify the
  panel, artwork, form and controls remain within 1px between themes.
- Build-owned image hints identify both exact assets. The boot script preloads
  only the chosen theme using canonical → legacy → OS preference; each cold route
  is tested with an opposite OS preference and rejects downloading the other image.
  Existing auth build verification and startup tests handle the two metadata tags.
- Both HTML boot shell and React landing fallback use the real transparent Q and
  a compact black loading surface. The previous landing headline/cards are removed.
- Landing/fallback dark tokens are scoped locally to avoid global dark CSS changing
  their established palette.
- Vite gives the exact `components/useTheme.ts` module existing public-runtime
  ownership. Without this rule its shared auth ownership eagerly fetched UI/auth
  code and CSS on the landing route. Native startup tests now prove that isolation.
- Only the intentional login-dark visual baseline was replaced after reviewing its
  real browser capture. The existing light baseline and snapshot tolerances remain.

## Verified locally

All target runtime execution used the existing isolated WSL/bwrap sandbox,
read-only inputs, synthetic loopback APIs, finite resources and no external network.
No dependency download, production account access or production data modification.

- 102 selected unit/script tests pass, including migration, Vite ownership and
  theme-specific preload/source validation.
- Lint and semantic TypeScript checks for changed files pass. Entry `main.tsx` is
  covered by the actual production frontend build; full-project typecheck remains
  assigned to CI because of the previously established local memory limit.
- Production frontend build and existing bundle budgets pass.
- Latest artwork QA: 8 continuity/OTP/loader/geometry cases, 3 native startup
  cases and 2 light/dark snapshot cases pass. The light snapshot is unchanged.
  The dark snapshot was updated only after reviewing the supplied image alongside
  real light/dark screenshots; tolerances remain unchanged.
- Dark login checks include invalid fields, OTP/error states, text contrast and
  horizontal bounds at 320px and 1440px. Login/logout, reload and the existing
  authenticated theme button are exercised through real compiled React routes.
- Earlier theme iteration also passed 4 OS/storage fallback and 2 low-spec motion
  cases. The subsequent artwork/preload change does not modify motion code; those
  earlier runs are not described as reruns against the final artwork build.
- Visual QA is recorded in `design-qa.md`. Its pass is scoped to artwork/layout,
  not the outstanding full CI/release verification.

## PageSpeed result and remaining verification

Before the final supplied-artwork replacement, the actual strict wrapper/CLI was
run with cached Lighthouse 13.0.3, Chrome 156,
real current security/static middleware and the original gates: Performance 85,
Accessibility 95, Best Practices 90, SEO 80. No gate or audit was disabled.
The before build came from the verified exact deployed `98f27699` release archive.

| Mobile audit | Before | After, first run | After, repeat |
| --- | --- | --- | --- |
| Home performance | 57 | 60 | 57 |
| Login performance | 48 | 41 | 50 |
| Home FCP / LCP / TBT | 2.2s / 4.7s / 870ms | 2.5s / 4.6s / 730ms | 2.6s / 4.7s / 820ms |
| Login FCP / LCP / TBT | 3.3s / 6.3s / 750ms | 3.3s / 6.9s / 1250ms | 3.4s / 5.6s / 800ms |

All runs: accessibility 100, best practices 100, CLS 0; Home SEO 100 and Login SEO
69. Login intentionally remains `noindex,nofollow,noarchive`; its existing SEO gate
exemption is unchanged. The exact failed thresholds are Home/Login performance.
LCP remains the radar image on Home and the illustration on Login. Both are
discoverable from the initial HTML, eager and high priority; native startup tests
also verify preload reuse and absence of the auth/UI graph from Home.

These runs share a 2-CPU, 1-GiB, no-swap sandbox with the server, browser and audit.
Memory-high events and substantial kernel/reclaim activity were observed on both
before and after runs. These observations and variable scores do not establish a
new performance regression, or certify that performance is unaffected. Run the
unchanged strict job in CI before claiming release readiness. The final repeat
also confirmed zero CSP/client-error reports and the radar style approval on both
200 and legitimate 304 responses.

Full project typecheck, full server build and full repository/CI suites are not
claimed as locally completed. Browser-denied storage keeps the controls usable;
cross-route/reload persistence follows the unchanged workspace OS fallback when
the browser will not store a preference.

## Local evidence for continuation

Evidence root:
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/`.

- Latest artwork build/snapshot receipts: `public-theme-20261101-v10/`.
- Latest application source manifest SHA-256:
  `95563eaa9f185e8ad70c63779a92170b368406c23736e2d0e99dba5a26e920bd`.
  Documentation is updated after the application snapshot.
- Unit/lint/types/8 browser geometry and lifecycle cases: `public-theme-20261101-v9/`.
  Its complete frontend archive is byte-identical to v10:
  `947e6542ed3f053a72f75faac6450b338f44fa866f61c25a53b6ea24cc5c51a9`.
- Native startup receipt: `public-theme-20261101-v8/`; final startup rerun, if
  present, is in v10. Earlier theme receipts remain in v7.
- Source image export and combined comparison board: `login-dark-artwork-20261101/`.
  Source PNG SHA-256 `5ea23c764d8cf9a885587b3b1326a6b3ea476abc62d644a54956e116e0e61a09`;
  exported WebP SHA-256 `de95c1d3036176fdecc43af86513b821a377b946efae8d26b66de086217b5e24`.
- Motion receipt: `public-theme-20261101-v6/`.
- Raw strict reports/receipts: `public-theme-20261101-v5-strict/`;
  before `receipt-adaptive-lifecycle-40b473e945ea`, first after
  `receipt-adaptive-lifecycle-d823f870c2e5`, repeat after
  `receipt-adaptive-lifecycle-b3ceefa90d13`.
- The first strict harness additionally rejected a valid 304 artwork response;
  the repeat accepts 200/304 and verifies the CSP style approval. Its performance
  failures remain real and were not hidden.

Publication/deployment must follow a subsequent user request. Keep the existing
theme controls, animations, source illustration and original CI gates intact.
