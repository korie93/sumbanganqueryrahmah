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

Compact Q marks use the transparent landing artwork in both themes. The theme selects the full wordmark SVG when requested. The compact icon reserves a square slot and exposes a single accessible image.

The main desktop sidebar toggle (1024px and above) uses the original transparent
blue Q with dots, displayed at 24px inside a 36px button. It uses the landing artwork in both surface themes. This is static
brand artwork, independent of the connection-aware tab favicon. The existing
Expand/Collapse labels, keyboard behavior, focus and sidebar state remain intact.
The mobile/tablet hamburger and drawer, other sidebar action glyphs and ordinary
workspace logos are unchanged. Built-browser coverage is selected with
`--grep "desktop Q menu toggle"`.

| Purpose | Public path |
| --- | --- |
| Full logo, pale/dark surface | `/brand/sqr-full-logo-light.svg`, `/brand/sqr-full-logo-dark.svg` |
| Compact icon in both themes | `/brand/sidebar-q-static.png` |
| Static fallback favicon | `/brand/favicon.svg`, `/brand/favicon.ico` |
| Browser tab and search, connected/disconnected | `/brand/sidebar-q-static.png`, `/brand/favicon-online-v2.ico`, `/brand/favicon-offline-v2-32.png` |
| Apple touch icon | `/brand/apple-touch-icon-180x180.png` |
| App icons | `/brand/icon-192x192.png`, `/brand/icon-512x512.png` |
| Logo-based social metadata | `/brand/sqr-social-logo-light.png` |

App icons use the manifest purpose `any`. The homepage advertises the transparent 128×128 landing Q in its initial HTML. Google can also select the shortcut ICO or Apple touch icon. All three URLs serve the same blue artwork. After deployment, Search picks up the change when it recrawls the homepage and icon. [Google Search favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search)

The status and installed-app exports use the original transparent PNG and the landing crop. Run `node scripts/export-brand-icons.mjs` to regenerate the compatible public URLs and provenance, then `npm run build:status` for the Nginx copy.

The favicon SVG embeds its 64px PNG export; the independent status SVG embeds a 96px WEBP export at quality 1. These are honest raster-backed SVG containers, not traced vectors. The existing `/_sqr/errors/assets/sqr-logo.svg` URL/MIME/Nginx allowlist stay unchanged, and the independent 32KiB asset budget remains enforced. Full logos continue to use true SVGs.

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

The collapsed sidebar animates layers from the same original artwork. See [desktop sidebar Q](sidebar-animated-q.md).

## Landing footer lazy-image sizing

The full footer logo keeps its intrinsic 665×310 HTML dimensions, lazy loading,
responsive auto width and 64px CSS height. Its footer-only image rule also sets
`aspect-ratio: 665 / 310` explicitly. Chromium's lazy-image sizing diagnostic can
flag an automatic width with the HTML-derived `auto 665 / 310` ratio even when
the image already reserves space. Do not apply this non-square ratio to the
shared Q image class or change the original artwork to address the diagnostic.

The browser regression holds image delivery, verifies a nonzero footer image
box before decoding, compares the loaded box, and observes CDP `LazyLoadImageIssue`
events on desktop and phone. This checks the actual browser warning rather than
only looking for width/height attributes after load. The Platform strengths
container is a named group, not a labelled generic div. Monthly Comparison uses
the same named-group semantics for its headline and separately names the Staff
nickname popup; no global focus handling, permissions or backend logic changes
are required for these corrections.
