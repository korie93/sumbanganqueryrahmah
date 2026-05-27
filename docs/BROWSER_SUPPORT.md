# Browser Support

SQR is an internal operations system. The supported browser matrix is intentionally modern so the app can rely on secure platform features such as `AbortController`, `crypto.randomUUID`, Trusted Types-compatible CSP behaviour, modern CSS custom properties, dynamic imports, and accessibility APIs.

## Supported Browsers

| Browser | Minimum Version | Notes |
| --- | ---: | --- |
| Chrome | 120 | Primary Chromium target for CI smoke, visual, and accessibility contracts. |
| Microsoft Edge | 120 | Supported through the Chromium target. |
| Firefox | 121 | Supported for core app use, including Firefox scrollbar styling. |
| Safari | 17.4 | Supported for current macOS/iOS platform behaviour. |
| iOS Safari | 17.4 | Supported for mobile operational flows and PWA metadata. |

Unsupported browsers include Internet Explorer, legacy EdgeHTML Edge, Opera Mini, and browsers without modern JavaScript module support.

## CI Coverage

CI currently installs Playwright Chromium and runs:

- `npm run test:e2e:visual`
- `npm run test:e2e:a11y`
- `npm run smoke:ui`
- `npm run perf:pagespeed:local:strict`

Firefox and Safari remain manual or staging QA targets until a multi-browser Playwright matrix is added.

## Polyfills And Fallbacks

The app does not ship a broad legacy-browser polyfill bundle. Instead, it uses targeted defensive fallbacks:

- viewport unit fallbacks: `dvh` to `svh` to `vh`
- storage wrappers for private browsing and quota failures
- reduced-motion CSS fallbacks
- Firefox scrollbar styling alongside WebKit scrollbar styling
- lazy imports for heavy export and capture utilities

## Adding A Browser Target

1. Confirm the browser supports the required security and runtime APIs.
2. Add it to `package.json` `browserslist.production`.
3. Add or update a Playwright/manual QA entry in this document.
4. Run `npm run build`, `npm run verify:bundle-budgets`, and the relevant smoke/a11y contracts.
