# Desktop sidebar Q

This change is frontend-only. It does not alter mobile navigation, account roles,
permissions, Collection data/actions, APIs, migrations, authentication, tab
favicons, PWA icons, or Nginx error-page assets.

## Behavior

The existing shell owns one desktop sidebar preference. Expanded navigation
shows the collapse icon and existing brand text. Collapsed navigation shows the
user's transparent original Q. Hover or keyboard focus crossfades to the expand
icon; click, Enter or Space acts immediately. The control is 44px square with a
32px artwork slot. Rail and main-content transitions are both 200ms, disabled
for reduced motion.

The expanded header also explicitly selects the transparent blue Q in both
themes. It does not use the generic brand component's navy-backed dark asset;
that correction is local to the workspace sidebar, not a global logo migration.

`useDesktopSidebarPreference` reads a guarded, versioned local preference before
first paint. Its key is scoped to user ID (username fallback), storing only
`collapsed` or `expanded`. Invalid/blocked storage defaults expanded; failed
writes do not block toggles. Mobile drawer state is independent. This preference
does not grant access to any module.

## Assets and motion

`SidebarAnimatedQ` and its CSS are lazy-loaded only for a collapsed desktop rail
(1024px+). The genuine static Q is available during loading or optional-chunk
failure. The seven public PNGs total 25,311 bytes; each is 128px for a crisp 32px
slot. Source hashes, crop and output hashes are recorded in
`assets/brand/sidebar-q-exports.json`.

The ring/tail and four detached shapes are separated from approved original
pixels, not redrawn or traced. A baked lighting band is clipped by the original
body's fixed alpha mask. Four dots and that band animate only transform/opacity,
on a 3.2-second loop. No video/GIF/APNG, runtime canvas, per-frame JavaScript,
timers, new package, animated filters, or hardware-detection service is added.

Motion pauses on hover/focus, outside the viewport, or while the document is
hidden. Expanded/mobile states unmount it. Reduced motion uses the exact static
composite. One observer plus visibility/media listeners are cleaned up on
unmount. Missing enhanced assets fall back to the static Q. The tab's blue/grey
connectivity behavior is independent.

## Verification and continuation

See root `design-qa.md` for opened source/implementation comparison and actual
Codex-browser results. Build, typecheck, frontend unit tests, scoped lint, PNG
provenance/keyframe tests, existing bundle budgets and safety contracts pass.

The initial visual review used **Codex browser only**. On 2026-10-14 the user
explicitly requested Playwright tests, authorizing the isolated local Chromium
test run. The eight sidebar cases and related brand/navigation contracts now
have actual browser execution evidence; see `playwright-collection-q-verification.md`.
This does not authorize production testing or deployment.
`scripts/sidebar-q-performance.mjs` remains opt-in, outside CI/default tests,
and has not been run. It compares 60-second static/motion intervals at
CPU 4×/6×, with traces, heap/DOM/listener metrics, twenty toggles and table
search/scroll. CPU throttling would not prove weak-GPU or all-device behavior.
Do not report the pending CPU/heap/trace performance gates or remote CI as passed.

The local synthetic preview harness is ignored under `artifacts/sidebar-q` and
uses no dotenv, database or real accounts. It serves the supplied reference and
frozen CSS phases for visual review only. Do not deploy that harness.

To reproduce mechanical image exports, use an already-installed native canvas
and PNG decoder, supplying their absolute module entry paths if they are not in
the module search path:

```text
node scripts/export-sidebar-q-assets.mjs <canvas-module-entry> <pngjs-module-entry>
node --test scripts/tests/sidebar-q-assets.test.mjs
```

These are offline development tools, not application dependencies. Preserve
the original-source hash and inspect any newly exported images before accepting
them. Do not replace favicon files while reproducing sidebar exports.

No commit, push or deployment is included in this implementation request.
