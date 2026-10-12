# SQR approved brand assets

Source: user-supplied `SQR-Brand-Assets-Final.zip`, 12 October 2026.
Archive SHA256: `59393984a963341dc6c3a592c58d7eca8e8f476c58413cfd941406c11928a966`.
Full-logo SVGs and the 4096×1909 social PNG remain byte-for-byte copies. On 12 October the user superseded the ZIP's Q artwork with new PNG references and explicitly approved proportional icon/favikon exports **without AI redrawing**. The two unique 1254×1254 originals are preserved in `assets/brand/`; the three transparent attachments were identical. PDFs and unused large renders are not shipped.

## Usage

`shared/brand-assets.ts` owns the paths. Use the existing `BrandLogo` component:

```tsx
<BrandLogo variant="full" theme="light" className="auth-v17-logo" priority />
<BrandLogo variant="icon" theme="auto" decorative className="h-8 w-8" />
```

## Changed surfaces

- Shared paths/rendering: `shared/brand-assets.ts`, `client/src/components/BrandLogo.tsx`, `BrandLogo.css`, and `public-shell.css`.
- App/public UI: `NavbarParts.tsx`, `PublicAuthLayout.tsx`, `auth/AuthV17Layout.*`, `pages/LoginParts.tsx`, and `pages/landing-v21/{LandingSections,PreviewViews,landing-v21.css}`.
- Browser metadata/boot: `client/index.html`, `client/public/{site.webmanifest,boot-shell.css}`, `client/src/app/document-metadata.ts`.
- Status/fallback: `SystemStatusView.tsx`, `SystemStatusPage.css`, `scripts/build-system-status.ts`, and generated `deploy/errors/` HTML/logo/CSS.
- Regression protection: branding/component/metadata/landing/static-asset tests, `tests/visual/brand-logo.spec.ts`, two reviewed login baselines, Vite ownership tests, and Collection loading/detail markup tests.

### Rendering behavior

The default is `variant="icon"`, `theme="auto"`. The latest PNG reference takes precedence over the earlier dark-Q-only choice: light surfaces use the transparent Q; dark surfaces use the supplied navy-backed Q. Full logos reserve 665×310 geometry; 128×128 compact exports preserve a 1:1 ratio and support existing 32–60px slots at 2× density. Auto follows the root theme with CSS, without changing saved preferences or mounting another theme controller. Fixed pale landing/auth surfaces use light full logos; landing preview uses transparent Q. No extra CSS frame/background/inset is added. Decorative marks are hidden from assistive technology; semantic logos retain an accessible name.

| Purpose | Public path |
| --- | --- |
| Full logo, pale/dark surface | `/brand/sqr-full-logo-light.svg`, `/brand/sqr-full-logo-dark.svg` |
| Compact icon, light/dark | `/brand/sqr-q-mark-light.png`, `/brand/sqr-q-mark-dark.png` |
| Static fallback favicon | `/brand/favicon.svg`, `/brand/favicon.ico` |
| Browser tab, connected/disconnected | `/brand/favicon-online-v2-32.png`, `/brand/favicon-online-v2.ico`, `/brand/favicon-offline-v2-32.png` |
| Apple touch icon | `/brand/apple-touch-icon-180x180.png` |
| App icons | `/brand/icon-192x192.png`, `/brand/icon-512x512.png` |
| Logo-based social metadata | `/brand/sqr-social-logo-light.png` |

PNG app icons are declared `purpose: "any"`, not `maskable`: no maskable-safe-area artwork was supplied. Boot/status/static fallback icons use the new dark-backed Q, whose own background keeps it readable on either page theme. The browser tab uses the separate transparent pair described below. `scripts/export-brand-icons.mjs` performs offline canvas downsampling only (no crop, recoloring, background removal or generative redraw). `assets/brand/q-mark-exports.json` records approved source hashes and every generated asset hash. Run `node scripts/export-brand-icons.mjs` manually to regenerate, then `npm run build:status`; normal builds verify checked-in exports, not generate them with a browser.

The favicon SVG embeds its 64px PNG export; the independent status SVG embeds a 96px WEBP export at quality 1. These are honest raster-backed SVG containers, not traced vectors. The existing `/_sqr/errors/assets/sqr-logo.svg` URL/MIME/Nginx allowlist stay unchanged, and the independent 32KiB asset budget remains enforced. Full logos continue to use true SVGs. Small Q images are about 12/25KB instead of loading the 0.55/1.43MB originals at runtime.

The old minimal SVG/WebP, old maskable SVG, and separate auth/root touch icons were removed after all application references were migrated. Original prototype fixture assets in browser comparison scripts are historical test inputs, not deployed branding.

`vite.config.ts` keeps the React logo in the existing shared UI chunk and the path constants in public-runtime, ahead of lazy auth grouping. Framework dependencies retain higher priority. This prevents metadata/landing branding from eagerly loading the login implementation. The existing size budgets are unchanged. Repeated Collection loading/details markup was consolidated with identical messages, fields, formatters, order and styles to keep the very tight records bundle under its existing limit; business actions and permissions are untouched.

## Verification and rollout

- `npx tsx --test client/src/components/brand-logo-a11y-contract.test.tsx client/src/app/brand-assets.test.ts`
- `npm run build:status` and `npm run verify:status-assets`
- `npm run build`, `npm run test:client`, `npm run test:scripts`, `npm run typecheck`, `npm run lint`
- `npm run test:visual:built -- --grep "brand migration|landing header" --workers=1`
- `npm run test:auth:v17`, `npm run test:landing:built`, `npm run test:status:browser`
- `npm run verify:bundle-budgets` (no budget increases)
- Inspect login/landing at 320, 390 and 1440px, workspace light/dark (including collapsed navigation), recovery/status pages, and favicon across SPA navigation. Browser tests use local synthetic APIs only.

App deployment alone does not update the separately hosted Nginx fallback files. A later authorized deployment must also synchronize the generated `deploy/errors` assets via the established reviewed error-page deployment procedure. Do not alter Nginx routing, headers or permissions for this branding change.

Independent error documents reuse `/_sqr/errors/assets/sqr-logo.svg` for both the page mark and favicon, so outage pages do not depend on the app server. The two login screenshot baselines were reviewed and updated for the larger supplied full logo; authenticated baseline images are unchanged. Landing touch tests pace native swipe events across animation frames and wait for snapping to settle before the next tap; their assertions remain intact. Verify ICO decoding in a browser test **without** request interception: Playwright aborts paths ending `/favicon.ico` when routing is enabled; that is not evidence of a corrupt ICO. The dedicated brand test covers this.

Favicon URLs have changed, avoiding most stale-cache issues. If a browser still shows the old icon, reload without cache or close/reopen the tab; installed home-screen/PWA icons may require removing and re-adding the shortcut. Do not clear account/session or collection storage just to refresh branding.

Browser tab icons show only the Q on a transparent background following the
user's 13 October correction: blue with the original decorative dots when
connected, grey with dots removed when disconnected. Both use the approved
original transparent Q PNG with proportional mechanical exports, without AI
redrawing. Their versioned `v2` paths avoid the earlier white tile cache. The
connection-aware controller does not replace the workspace, touch, PWA or
independently hosted Nginx artwork above. See
[favicon connectivity](FAVICON_CONNECTIVITY.md) for status semantics, exact asset
provenance, verification and rollout.
