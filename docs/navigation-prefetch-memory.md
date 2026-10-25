# Navigation preloading and browser memory

Route code imported by the browser stays cached for the document lifetime. An
individual Chrome tab memory reading does not establish a memory leak, but
importing unused routes can increase the work and memory needed after login.

The authenticated shell no longer speculatively imports up to four routes after
each navigation. Desktop menu group headers also no longer preload every child.
Individual destinations retain hover/focus preloading, including desktop flyout
items. Clicking or tapping a cold destination continues to use the existing lazy
route loader and loading/error states. This policy applies to all device modes.

Authorization, account/tab ownership, session validation, data-cache expiry,
Collection matching and business logic are unchanged. Preloading is an optional
navigation optimization, never an authorization boundary.

A first visit without preceding hover/focus can now wait for that route's code to
download. Once a person actually visits modules, their code remains cached; this
change does not unload visited modules or promise a fixed reduction in tab RAM.

## Regression checks

- `navigation-prefetch.test.ts`: supported route aliases and unknown targets.
- Existing navigation, permission, lazy-loading, session-boundary and sidebar
  motion tests.
- `tests/visual/navigation-prefetch.spec.ts`: idle/group behavior, individual
  hover and keyboard focus, and cold mobile navigation against a production
  build with synthetic loopback data. Run with
  `npm run test:visual:built -- --grep "navigation prefetch" --workers=1`.

Memory comparisons must use matching production builds, fixtures, browser and
resource limits. Record JavaScript heap separately from OS renderer memory.
Linux headless renderer RSS is not Windows Chrome's tab memory measurement.
