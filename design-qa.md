# Desktop sidebar Q — visual QA

Date: 2026-10-13. Product Design image-to-code and design-qa workflow.

## Scope and source

- Approved desktop-only states: expanded `PanelLeftClose`; collapsed transparent original Q; hover/keyboard focus `PanelLeftOpen` in the same native button.
- Motion direction: user-supplied `1000316370.jpg`, six phases; sidebar interaction reference `1000316363.mp4` from `gjjjh.zip`.
- Authoritative shape/color: existing approved `assets/brand/q-mark-light-source.png`, SHA-256 `07e5e47d3a1851200301dc22b49764b6bb174b48843bc2462700ba3c0dc5ea5e`. Mechanically separated original pixels, no tracing or AI redraw.
- The reference's checkerboard, phase numbers, stronger silver finish, and extra particle trails are not new logo artwork. The existing blue/cyan identity and four original detached shapes are preserved. Small motion and a single clipped lighting band intentionally replace heavier effects.

## Opened and compared evidence

All browser interaction used Codex's in-app browser, with a loopback-only synthetic frontend. No production accounts, database, credentials or server changes.

- Supplied image/video: `http://127.0.0.1:56305/__preview/reference`.
- Actual built workspace: `http://127.0.0.1:56305/collection/save`.
- Combined implementation/reference capture: `artifacts/sidebar-q/phase-comparison.jpg` (initial), `artifacts/sidebar-q/phase-comparison-final.jpg` (revised, opened and inspected).
- The comparison embeds six CSS-keyframe samples on light and dark surfaces **and the supplied six-phase JPEG in the same image**. The actual 32px slot is magnified 4× for inspection, rather than shipping 128px logos in the rail. Desktop comparison layout is 1280px wide; artifact clipping excludes browser chrome.
- Normal-motion samples are explicitly frozen in the isolated gallery because the browser's OS preference is reduced motion. This is phase/appearance evidence, not a live performance measurement or a claim that the real app ignores reduced motion.
- Actual application captures: `q-rest-light.jpg`, `collapsed-rest-light.jpg`, `collapsed-rest-dark.jpg`, `collapsed-focus-light.jpg`, `collapsed-focus-dark.jpg`, `expanded-light.jpg`, `expanded-dark.jpg`, `mobile-drawer.jpg` in `artifacts/sidebar-q/`. Some in-app full screenshots contain only the visible panel width despite a wider emulated layout; the 56×56 clipped Q capture and explicitly clipped phase comparison are used for geometry, not an inaccurately scaled full-window comparison.

## Iteration history

1. Initial comparison: P2 — the sheen was absent at exactly 18% and too weak at the peak. The six-state presentation did not communicate the intended soft sweep clearly enough.
2. Fix: start a low-opacity sheen at 18%, peak at 36%, soften it at 54%, fully clear it at 74–100%. Only transform/opacity keyframes changed. Original body geometry, alpha mask and color pixels remain fixed.
3. Revised capture at matched desktop comparison width: sheen is visible without a rectangular highlight, added glow, opaque tile, or changes to the Q tail. Dots drift slightly and return to their exact initial state. No actionable P0/P1/P2 visual issue remains in the approved lightweight interpretation.
4. User follow-up: P2 — the expanded dark sidebar still selected the generic navy-backed dark Q. Fixed `NavbarBrandCluster` to explicitly use the transparent blue icon for both themes, leaving other brand consumers and favicon assets unchanged. Added unit and browser contract protection. Actual dark-expanded state was observed with `aria-expanded=true`, one decoded `/brand/sqr-q-mark-light.png` and visible brand mark. Post-fix evidence is `artifacts/sidebar-q/expanded-dark-transparent-final.jpg`; the opened `artifacts/sidebar-q/dark-expanded-comparison.png` places matched before/after header crops together. The visible tile is removed; no further P0/P1/P2 visual issue remains.

## Interaction/accessibility review

Observed in the actual built app through Codex:

- Native 44×44px button; 32×32px Q slot; all seven PNGs decode at 128×128.
- Expanded state shows collapse icon and brand text; collapsed state shows Q at rest. First activation expands immediately.
- Pointer hover verified by right-click/escape without activating the control: Q opacity 0, expand icon opacity 1, state still collapsed.
- Keyboard focus shows the same expand icon with a solid focus outline. Enter/Space work, and focus remains on the control.
- Twenty consecutive toggles alternate the same existing expanded state without extra activation or extra controls.
- With the collapsed Q present, Records search returned exactly the synthetic Customer 199 row; clearing Search restored the table. Native scrolling moved the document by 292.5px. This verifies interaction, not a frame-rate or input-latency budget.
- Collapsed choice survives refresh. Storage-denied/malformed/account-scoping cases are covered by passing unit tests.
- 1024px shows desktop navigation; 1023px shows mobile navigation. At 390px the original Menu SVG/drawer remains; zero animated Q components are mounted. Escape closes the drawer.
- Actual reduced-motion state uses the original static composite, with no decorative animation. No OS setting was changed.
- Existing `/brand/favicon-online-v2-32.png` remains the document favicon after navigation and refresh. Grey offline/tab/PWA/Nginx assets are unchanged.

## Scores (0–4)

Layout/spacing: 4; typography (preserved system): 4; original-asset fidelity: 4; palette/theme continuity: 4; approved states/accessibility: 4. The phase storyboard is a motion direction, not permission to recolor/redraw the established Q or copy its checkerboard.

## Verification boundary

Typecheck, full frontend unit suite, scoped ESLint, asset/keyframe guards, build, bundle budgets, browser-storage safety, breakpoint contract, secret scan and diff checks pass. No budget/tolerance/CSP/security policy was weakened.

Prepared Playwright regression tests and an opt-in 60-second CPU 4×/6× trace harness were **not executed**: the user explicitly chose Codex browser only. That browser does not expose CPU throttling, reliable heap/frame metrics, media emulation or DPR controls. No claim is made about weak-GPU performance, memory-leak profiling, all-role browser coverage, strict-CSP browser execution, physical 125% scaling, or automated CI success. Those remain release-verification follow-ups, separate from this visual result.

final result: passed

---

# Collection Report — desktop hierarchy and navigation QA

Date: 2026-10-13–14. Product Design audit → scoped implementation → design-qa. User request: tidy desktop navigation and remove visually duplicated, oversized module headers without changing the Collection workflows.

## Source and implementation comparison

- Source: actual pre-change Monthly Comparison, admin, dark theme, expanded sidebar. Captured during this task in `artifacts/collection-desktop-polish/01-save-before-dark.jpg`. The original filename is misleading: the opened image is Monthly Comparison, not Save Collection.
- Final implementation: `monthly-after-dark-final.jpg` and `monthly-after-light-final.jpg` in the same artifact directory, opened and inspected. Local URL: `http://127.0.0.1:56306/collection/monthly-comparison`.
- Combined source/implementation: `monthly-dark-comparison.png`, opened and inspected. Two equally sized 1440×420 browser-content crops are placed in the same image, with the source above the implementation. Sidebar, topbar, section navigation and page heading remain in the comparison.
- Matched state: admin, Monthly Comparison, expanded sidebar, dark theme, effective CSS viewport 1440×900. The browser's existing zoom yields DPR approximately 0.67. Raw screenshot canvases include extra blank backing space; comparison crops remove only that excess and retain the same scale. This is hierarchy evidence, not a physical 100%/125% scaling certification.
- The old synthetic Monthly endpoint was not configured, while the final fixture returns a valid empty comparison. That changes load-state/data content below the header; it is not attributed to the navigation refactor. Original raw captures are retained.

## Findings and iteration

1. P2 source issue: Collection Report repeated the global topbar name as a large module banner, followed by long wrapped labels and then the report's own header. This consumed substantial vertical space and weakened hierarchy.
2. Scoped fix: desktop-only compact section strip, short labels with full tooltips/accessibility names, staff nickname on the same line, and a visually clipped but accessible module h1. Keep individual report headings and actions. Approximately 150px of upper-page space is recovered in the inspected Monthly state; final report content begins at CSS y≈157.5px.
3. P2 review issue: initial English short labels did not all occur inside their preserved full accessible names. Revised labels to Simpan / Rekod / Summary / Monthly / Daily / OSP / Nickname / Manage. Added a contract asserting label-in-name consistency for all eight sections. No full accessible name, route, role filter or permission changed.
4. P2 narrow-desktop capture: the shared header's intrinsic-width actions wrapper let the nickname overflow its 180px context and cover OSP. Constrained that desktop-only wrapper before truncating the badge. Actual recapture `osp-desktop-1025-light-fixed.jpg`, opened and inspected, shows no overlap. Measured badge/context left≈799px, width≈180px, navigation right≈787px; full nickname remains in its tooltip. Added unit and admin 1024px browser regression guards.
5. Final combined recapture after both fixes: one aligned navigation row, distinct active state using existing primary tokens, bounded nickname, and a single visible report heading. Light and dark colors remain inherited from the existing system. No actionable P0/P1/P2 issue remains in the scoped layout.

## Observed interactions and fidelity surfaces

All interactions used Codex's in-app browser and the actual build with synthetic responses; no production credentials, database or writes.

- At effective 1440×900, all seven admin sections share one top coordinate. The document has no horizontal overflow. Visible short labels correspond to the unchanged full accessible names.
- Enter opened Records, preserving focus on its button, active `aria-current`, Search, Penapis, record actions and table. Tab advanced to Summary; Enter opened Summary with its heading, freshness badge, year/nickname filters and chart action intact.
- Daily retained its visible `collection-daily-title` and Refresh button. OSP retained its exact heading, Saved target and Reload Targets controls. Save Collection retained its customer-name input and original narrower form layout. Nickname Summary retained its heading and date/nickname controls.
- At effective width ≈1025px (desktop media query confirmed), the strip remains nowrap. Selecting OSP reveals the active button through local horizontal scroll; page y remains 0 and the document does not overflow. Browser zoom means a requested physical viewport corresponding to rounded `innerWidth=1024` can still match the tablet media query; no exact physical-DPR claim is made.
- At effective width ≈769px, full labels, wrapping and the original visible module heading remain. At ≈389px, the mobile launcher/Sheet retains full names; Escape closes the Sheet and restores focus to `button-open-collection-sections`. No animated desktop Q mounts in mobile.
- Additional captures: `summary-desktop-dark-final.jpg`, `osp-desktop-1025-light-fixed.jpg`, `tablet-769-light-final.jpg`, `mobile-390-sections-final.jpg`, `save-desktop-light-final.jpg`. All are in `artifacts/collection-desktop-polish/`. The older `osp-desktop-1025-light-final.jpg` records the overlap before the last fix and is retained as iteration evidence, not final proof.
- Prior Q transparency/favicon work is preserved, not redesigned by this task.

## Scores (0–4) and verification boundary

Hierarchy/spacing: 4; existing-system continuity: 4; desktop density: 4; theme continuity: 4; observed keyboard/mobile behavior: 4. This is a bounded improvement of the existing UI, not a new visual direction.

Typecheck, full frontend units, focused nine-test navigation contract, scoped ESLint, final build, bundle budgets, storage/breakpoint checks, secret scan and repository hygiene passed. No limits, tolerances, permissions, CSP or security policy were weakened.

At the initial visual handoff, fourteen Playwright regression cases were prepared and semantically typechecked but not executed: the user had chosen Codex browser only. Configured OSP target workspaces, backend mutation correctness, CPU throttling and automated CI success were not claimed. The synthetic role-switch URL for an additional initial browser role check was blocked by the browser; no protection was bypassed. The later explicit Playwright request and actual results are recorded below. No commit, push or deployment was performed.

final result: passed

---

## Playwright follow-up — 2026-10-14

The user explicitly requested Playwright tests, authorizing local Chromium CLI execution after the initial browser-only visual review. Final selected run: **49/49 passed, no failures/skips**, including all fourteen new Collection navigation cases, all eight sidebar Q cases, related brand/CSP/mobile-return tests and the existing authenticated light/dark baselines. See `docs/playwright-collection-q-verification.md` for the exact command, case distribution and test isolation.

Three test-only mismatches were corrected: workspace assertions now protect the intentionally single transparent Q in both themes; mobile navigation matches its unchanged label-plus-description accessible name; superuser tests select the synthetic nickname through the actual chooser before waiting for the form. No production code, timeout, tolerance, mask or security policy was changed during this follow-up.

Only two old Save Collection baseline PNGs were refreshed after opening and independently inspecting their expected/actual/diff images at matched 1280×720. The changes match the approved compact navigation/header and prior Q/collapse-control; form controls/actions/privacy guidance remain intact. Other baseline files were untouched. Reviewed comparison evidence is preserved under `artifacts/playwright-collection-q-baselines-20261014/`; the final generated report is `artifacts/playwright-report/index.html`.

This supersedes the earlier pending browser-contract notes only. The optional CPU 4×/6× trace/heap harness, physical-device/GPU behavior, backend production mutations and remote CI remain unverified. This is a focused 49-case suite, not the complete repository's 323 tests. No production data, commit, push or deployment was involved.

final result: passed
