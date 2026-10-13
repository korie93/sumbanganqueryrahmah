# Collection Report desktop navigation

The desktop workspace uses one compact section strip instead of repeating a large module banner above every report. The global topbar still identifies Collection Report. The single page h1 remains available to assistive technology; page-specific titles, help, filters, freshness indicators and actions remain unchanged.

## Responsive contract

- At `>=1024px`, use one row with compact section labels and a bounded staff-nickname badge. Keep full accessible names and tooltips. Each visible short label is part of its full accessible name, including Simpan, Rekod and OSP.
- The section strip can scroll horizontally on small desktops. Selection and resize reveal the active section by adjusting only the strip's `scrollLeft`. Native keyboard focus also reveals buttons. Never scroll the whole page to reveal a tab.
- At `768–1023px`, retain the full-label wrapped navigation and 24px frame spacing.
- Below `768px`, retain the existing full-label section launcher and Sheet, including Escape and focus return.
- Preserve the existing 1120px Save Collection form limit and 1480px reporting limit. Do not hide or shrink individual report headers globally.

The label helper is presentation-only. Role filtering, route IDs, nickname authentication, session lifecycle, data loading and mutations continue through their existing paths. No new dependency or backend setting is required.

## Verification

`collection-desktop-layout.test.ts` covers eight label mappings, visible-label/accessibility consistency, CSS breakpoints, wrapper structure, mobile preservation, observer cleanup and bounded nickname actions. `tests/visual/collection-desktop-navigation.spec.ts` prepares 14 browser cases for desktop themes/widths, roles, keyboard navigation, direct-route overflow, bounded nickname badges, tablet and mobile states.

The current implementation was inspected in Codex's browser against loopback-only synthetic fixtures. Typecheck, full frontend units, focused nine-test contract, scoped ESLint, build, bundle budgets, storage/breakpoint checks, secret scan and repository hygiene passed. The initial browser-only restriction was superseded by the user's explicit Playwright request on 2026-10-14. All fourteen navigation cases now have actual Chromium execution evidence; see `playwright-collection-q-verification.md` for the scoped suite and screenshot-baseline review. No production data, environment file, deployment or permission was changed. See the Collection Report section of `design-qa.md` for screenshot evidence and limitations.
