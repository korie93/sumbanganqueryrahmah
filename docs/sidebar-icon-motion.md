# Desktop sidebar menu icon motion

Date: 2026-10-14 (Asia/Singapore). Bounded Product Design implementation in the existing application.

## Behavior

All 16 current Home, direct-menu, group and flyout IDs use one of three small gestures: lift, inspect or tilt. The existing Lucide SVG retains its 16px layout box; only its transform moves. The native button, label, prefetch, navigation and permission filters are unchanged.

An enabled desktop button's hover or keyboard focus starts one 220ms iteration, returning to the original pose. Leaving the interaction immediately removes the animation. Idle icons do not loop. The gesture is not a loading indicator and never delays a click until completion.

Desktop means the existing 1024px breakpoint, including collapsed and expanded navigation. Mobile remains static. `prefers-reduced-motion: reduce` always remains static, including low-spec mode. The original Q/toggle, favicon, chevrons, profile, notifications and topbar controls are not redesigned.

## Low-spec implementation

The existing global `.low-spec * { animation: none !important; transition: none !important; }` remains unchanged. Only the new enabled, interacted desktop menu SVG selectors use scoped important animation longhands to outrank that reset inside the desktop/no-reduced-motion media query. Other animation/transition savings, prefetch policy and hardware detection remain intact.

No animation library, per-frame application JavaScript, listeners, timers, device-specific disabling, persistent `will-change`, filters or new raster/SVG artwork were added. New menu IDs have a bounded fallback, while the unit contract requires explicit review of the current registry.

## Verification

- Production client build, bundle budgets, application TypeScript, scoped ESLint, breakpoint and storage guards passed.
- Final full frontend unit run: 1,970 passed, zero failed/skipped, including six new contracts. The sandbox's Windows-profile `uv_os_get_passwd` failure was resolved by the approved local test execution; no application check was weakened.
- Existing Collection/brand/Q regression run: 49 passed, zero failed/skipped. Preserved report: `artifacts/sidebar-q/regression-before-low-spec-49-report/`.
- Final motion specification: 15/15 passed, no failures/skips/retries, approximately two minutes. Eight independent role/state cases preserve every target while avoiding one long combined matrix near the CI deadline. CPU 4x/6x cases both pass in actual low-spec mode.
- Before that test-only split, a final-build 23/23 run also passed all then-current gesture cases and twelve existing baseline/Q cases. Its report is preserved at `artifacts/sidebar-q/motion-final-23-report/`. The runtime implementation did not change between these successful runs. The final report at `artifacts/playwright-report/index.html` contains the fifteen independently bounded cases.

Run the final focused suite against the already-built static frontend:

```sh
node scripts/test-visual-built.mjs --workers=1 --grep "desktop menu|keyboard focus animates|native hover gestures|reduced motion and disabled|mobile/tablet|CPU throttling|desktop animated Q|one touch expands|authenticated pages match"
```

The runner uses an ephemeral loopback static server, scrubbed environment and isolated synthetic API responses, with no backend or PostgreSQL. Unexpected requests and console/page errors remain failures. CPU cases set actual `perf_mode=low`, then Chromium CPU throttling to 4x/6x and reset it in `finally`.

Target-only pose assertions pause only the target's play-state before native hover/focus, then inspect the real production CSS animation at 45%. They never invent its name, duration, existence or iteration count. Separate unpaused tests require native animation-start events, finite completion while the cursor remains, return to `transform:none`, and replay on re-entry. Native navigation is verified through a real transition to General Search, not clicking the already-active Collection page.

## Test corrections and boundaries

The initial CSS guard incorrectly matched `min-width` as a width declaration. The initial browser helper searched for a nested nav even though Popover `asChild` places the flyout class on the nav itself; its outside-focus fallback dismissed the real menu. Both tests were corrected without changing production interaction.

Normal-mode hover preserves existing Dashboard/Backup data prefetch. The isolated Save fixture lacked those reads, so this spec now returns exact schema-valid synthetic responses. Unknown endpoints, methods, queries and off-origin requests still fail closed. No prefetch, errors, timeouts, screenshot baselines, tolerances or permissions were disabled.

An animation-start pause listener could miss a 220ms gesture under 6x CPU throttling. Target play-state is now paused before the pose sample; unpaused completion tests remain independent. This stabilizes measurement without increasing production duration or claiming that a sampled screenshot measures performance.

Independent matrix setup exposed geometry samples taken during the existing sidebar-width/flyout-entry transitions. The helper now waits for finite ancestor effects to finish before comparing exact button/sidebar/main geometry. Those effects are not disabled; no tolerance or timeout was increased. The latest browser spec remains semantically typechecked and lint-clean.

Visual evidence and the five fidelity surfaces are documented in `design-qa.md`. CPU throttling is evidence for these synthetic interactions, not physical weak-GPU certification, an FPS/latency/heap guarantee or a promise covering every PC/browser. Remote CI, production backend mutations and deployment are outside this local implementation verification.

No commit, push or deployment was performed for this request.
