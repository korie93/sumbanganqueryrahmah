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

## Account Management Option 1 production-component integration — 2026-10-15 (in progress)

Source visual truth: `artifacts/account-management-option-1/polish-preview.png`
and the accepted polished detail/edit/mobile captures in that folder. This
integration replaces the actual Settings components, not the isolated prototype.
Implementation: `artifacts/account-management-integration-20261015/after-desktop.png`.
Full comparison: `compare-desktop-full.png`; focused controls and account-row
comparisons: `compare-desktop-controls.png`, `compare-desktop-rows.png` in the
same integration artifact folder. Both compared desktop views are CSS/pixels
1440×1024. IAB density is 0.67; its raw backing canvas is cropped at 0,0 to the
measured CSS viewport, without scaling UI. Fixture identity/count is fictional;
timestamps and page-size values are actual fixture data rather than hardcoded
reference art. The existing app shell, typography and semantic tokens are kept.

Initial comparison: selected horizontal four-section navigation, one heading,
compact neutral summary, outside search/filter/refresh, five-column directory
and Details/Edit/More match the accepted design hierarchy. No new image assets
or logo redraws are introduced. Existing transparent Q assets are reused.

Blocking findings from first local browser run (9 pass / 7 fail):

- [P2] Mobile document overflow: the absolutely positioned screen-reader badge
  label escaped the unpositioned tab button. Fix: position each tab button;
  retain the accessible label and actual scroll container. Recapture pending.
- [P1] Managed and pending-reset search drafts revert before querying, from
  existing eager draft-to-applied synchronization effects. Analogous outbox
  effects require the same check. Fix owners are repairing draft/applied sync;
  no API contract changes. Query tests remain unchanged.
- [P2] Details → Edit → Escape loses focus to the original row. Fix: carry a
  stable origin anchor across the dialog transition, without overriding focus
  when another confirmation/editor opens. Retest pending.

Five surfaces: established app font and readable table/body hierarchy retained;
reference section rhythm and full-width content reproduced; existing semantic
green/amber/destructive tokens used in both themes; original sharp transparent
Q unchanged; real status/timestamp/permission copy retained without invented
reset-request approval controls. Minor shell/icon/font differences from the
prototype are intentional production design-system constraints, not rebranding.

Implementation checklist: fix the three blocking findings; rebuild; rerun
synthetic browser cases; capture matching desktop/mobile light/dark and dialogs;
rerun source/lint/unit checks; append final comparison and verification results.

final result: blocked

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

---

# Desktop sidebar menu gestures — 2026-10-14

Product Design scoped extension → built preview → source/implementation comparison. User approved hover animations for all desktop sidebar menu icons, including low-spec PCs, then explicitly approved isolated Playwright and 4x/6x CPU testing. No new design direction, library or logo artwork was required.

## Source and comparison evidence

- Source visual truth: actual pre-change superuser Records view at `http://127.0.0.1:4177/collection/records`, expanded sidebar, generated 200-record fixture. `artifacts/sidebar-q/sidebar-icons-before-light-clip.jpg` and `sidebar-icons-before-dark.jpg` are both 1493x1343 JPEGs.
- Matched implementation captures: `sidebar-icons-after-light.jpg` and `sidebar-icons-after-dark.jpg`, both 1493x1343. These show the first build at rest, before the animation-only low-spec importance fix. Matching effective CSS viewport: 2149x1343, DPR approximately 0.67, requested browser override 1440x900. Existing browser zoom was preserved.
- Full-context comparison: `artifacts/sidebar-q/sidebar-icons-comparison-full.png`, opened and inspected. Four equally sized 900x500 top-left crops are combined at 1800x1072, including sidebar, topbar, section strip and Records controls. No rescaling, recoloring or browser chrome is included.
- Final-build native screenshot fallback: `sidebar-icons-final-browser-light.jpg` (3173x2004) and `sidebar-icons-final-browser.jpg` (3207x2004). This browser surface includes additional backing space and different scrollbar capture; it is not used to infer pixel-exact page-margin changes.
- Final focused comparison: `sidebar-icons-comparison-final-focus.png`, opened and inspected. Source and final light/dark sidebar regions are combined in one 960x396 input using identical 240x360 top-left crops with no resampling. Important typography, all six expanded menu controls and the original transparent Q are readable. The first matched full comparison remains the context evidence; the final focused crop confirms the last animation-only fix did not alter the sidebar's resting appearance.
- Playwright gesture attachments capture actual production CSS at a paused 45% pose, with a separate 1440x900/DPR1 synthetic Save state. `gesture-home-final.png`, `gesture-general-search-final.png`, `gesture-settings-menu-final.png` and `gesture-viewer-final.png` in `artifacts/sidebar-q/` were opened and inspected. The gestures remain small, original glyphs remain recognizable, and row labels/buttons do not move. These are intentional motion evidence, not same-route pixel comparisons, screenshot baselines or performance measurements.

## Five fidelity surfaces

1. Fonts/typography: unchanged system-ui/Segoe UI stack, 14px, weight 500, 21px line height, normal letter spacing in the observed Home label. Copy wrapping, hierarchy and truncated/collapsed behavior remain native. Source/final focused crops show no font drift.
2. Spacing/layout rhythm: existing approximately 40px menu height and 16px SVG boxes remain. SVG transforms do not move button boxes, sidebar width or main content. Expanded/collapsed hit targets, label gaps, radii and flyout density are preserved.
3. Colors/tokens: inherited foreground, active primary tokens and hover surfaces remain unchanged. No new accent, glow, shadow, opacity effect or recoloring was added. Both themes retain their existing active Collection treatment.
4. Asset/image quality: original Lucide glyphs and stroke weight remain. The supplied transparent Q and favicon exports are untouched; no box, tracing, custom SVG art or raster replacement was introduced. Slight temporary transforms are the approved intentional difference.
5. Copy/content: Home, General Search, Collection, Workspace, Insights, Settings and all flyout labels/descriptions/accessibility names remain unchanged. Synthetic rows are test content, not production data.

## Findings and corrections

The matched idle comparisons found no actionable P0/P1/P2 visual drift. The approved difference is a small 220ms lift/inspect/tilt on the enabled hovered or keyboard-focused menu glyph, not its row or label. Source/implementation comparisons do not certify physical zoom or GPU performance.

During implementation review, the existing global low-spec animation reset would have suppressed the new gestures. Its global rule is unchanged; narrowly scoped important animation longhands inside the desktop/no-reduced-motion media gate now override it only for these interacted SVGs. Actual low-spec coverage is required before handoff.

Test corrections: the initial width guard falsely matched the breakpoint; the initial helper searched for a nested nav instead of Popover `asChild`'s real nav and consequently dismissed it by moving focus outside; normal-mode Dashboard/Backup prefetch required exact synthetic API contracts; a 6x CPU animation-start pause listener could run after a 220ms animation finished. The pose test now pauses only target play-state before the real interaction, without inventing name/duration/iterations. Separate unpaused start/completion/replay and native-action assertions remain. Finally, expanded/collapsed matrices were split into independently bounded cases for CI. Exact geometry assertions now wait for the existing finite sidebar-width/flyout-entry ancestor effects to finish before sampling; those effects remain enabled and no layout tolerance was added. No production handlers, timeouts, tolerances, baselines or permission guards were changed to accommodate tests.

## Verification and limitations

Final full frontend units: 1970 passed, no failures/skips. Application and browser-spec semantic TypeScript, scoped ESLint, production client build, bundle budgets, storage/breakpoint guards, secret scan and repository hygiene passed. Existing selected Collection/brand/Q suite passed 49/49 before the low-spec-only CSS adjustment. A subsequent final-build 23/23 run passed the original combined-state gesture cases, both CPU rates and twelve baseline/Q cases. After splitting the matrix for CI, the final motion specification passed **15/15**, no failures/skips/retries, in approximately two minutes. Runtime implementation was unchanged between those last two runs.

The in-app browser's actual reduced-motion preference remains respected. Its final built preview rendered the real menu markers, preserved geometry and logged no browser console errors. No OS setting, production server, database, credentials or user records were modified. CPU testing uses an isolated Chromium context with synthetic responses; it does not replace physical-device/GPU, FPS, input-latency, heap-leak, complete-repository, production backend or remote CI verification.

Final coverage: eight role/state matrices (normal superuser/admin/user plus explicit low-spec superuser, each expanded/collapsed), keyboard/flyout focus return and a genuine General Search transition, unpaused finite completion/replay, reduced-motion/disabled controls, mobile 390px/tablet 1023px, and actual low-spec 4x/6x CPU cases. CPU cases confirm a real unpaused gesture starts and finishes with no idle loop, preserve target-only sampled motion, and retain native menu actions. They are functional evidence, not a latency/FPS guarantee.

Final report: `artifacts/playwright-report/index.html`; final result file reports `passed` with an empty failed-tests list. The successful earlier final-build 23-case report is preserved at `artifacts/sidebar-q/motion-final-23-report/`. No actionable P0/P1/P2 finding remains within this scoped implementation. No commit, push or deployment was performed.

final result: passed

---

# Collection workspace and receipt viewer polish — 2026-10-15

## Scope and visual target

Product Design continued the approved Collection and receipt-viewer improvements,
using the existing application as the visual target. This is incremental polish,
not a replacement design system. The intended differences are a quieter first-run
Save form, less prominent supporting report controls, clearer applied-filter
state, compact nickname management, and a receipt viewer with more usable image
space and genuine fit-relative mobile zoom.

No backend, shared API, permission, monetary formula, original receipt, database
or dependency changes are included. Local browser fixtures use fictional records
and generated files. During implementation verification, no production connection,
mutation, commit, push or deploy was performed. The user subsequently approved
committing and pushing the completed changes; deployment remains a separate action.

## Evidence and normalization

All paths below are under `artifacts/collection-polish-20261015/` unless stated.
Source truth was captured from this checkout's pre-change Git HEAD
`315a657a50ce`, served separately from an ignored local archive. Implementation
evidence comes from the changed client source on a loopback-only synthetic
preview. Source and implementation were captured in the same Codex in-app tab
with matched route, superuser role, theme, fixture content and CSS viewport.

Desktop CSS viewport was 1440×1024. The temporary in-app viewport override used
a reported DPR of approximately 0.67; its full-page capture adds inverse-density
backing canvas. The comparison helper removes only that excess backing canvas:
left 1440 pixels, height capped at `ceil(raw height × .67)`. UI pixels are not
resampled. Full-page heights intentionally differ after disclosure and form
density changes; they are not represented as pixel-exact screenshot baselines.

| Surface | Source PNG pixels | Implementation PNG pixels | Combined evidence |
| --- | --- | --- | --- |
| Manage | `before-manage.png` 2115×1528 | `after-manage.png` 2115×1528 | `compare-manage.png` 2904×1072 |
| Save | `before-save.png` 2115×2761 | `after-save.png` 2149×1849 | `compare-save.png` 2904×1898 |
| Monthly | `before-monthly.png` 2115×4912 | `after-monthly.png` 2115×1952 | `compare-monthly.png` 2904×3340 |
| Daily | `before-daily.png` 2115×4952 | `after-daily.png` 2115×4560 | `compare-daily.png` 2904×3366 |
| Receipt | `before-receipt.png` 2149×1528 | `after-receipt.png` 2149×1528 | `compare-receipt.png` 2904×1072 |

All five combined inputs were opened and inspected. Readable native-pixel focused
comparisons were also opened for Save, Manage, Monthly and Daily:
`compare-*-focus.png` (2424 pixels wide, 1002–1098 high). These use the same
240px-left/70px-top crop in both source and implementation. Receipt controls are
readable in the full desktop comparison and separate mobile comparison.

Mobile source and implementation both measured 389×843 CSS pixels and reported
DPR approximately 0.67. Raw `before-mobile-receipt.png` and
`after-mobile-receipt.png` are both 581×2587. The helper removes the in-app
full-page stitching offset, taking the visible 389×843 app region at source y=1
and implementation y=613 without resampling. `compare-mobile-receipt.png`
(802×891) puts both visible app regions in the same input and was inspected.
These offsets describe the browser capture, not CSS page margins.

Additional rendered evidence: `after-date-error.png`, `after-summary.png`,
`after-monthly-expanded.png`, `after-mobile-zoom.png`, `after-mobile-pdf.png`,
`after-retry.png`, `after-manage-dark.png`, `after-receipt-dark.png` and
`after-mobile-receipt-dark.png`. The dark Manage and viewer captures were opened
and inspected. `final-preview.png` (2149×1528) shows the final light receipt
viewer after restoring the normal viewport. Its actual CSS size was 1440×1024,
reported DPR approximately 1.34, and the image was loaded with a 960px width.
Final in-app console checks returned no warnings or errors.

Final-source capture follow-up: the loopback helper was restarted at
`http://127.0.0.1:51103` to discard its disabled-watcher transform cache. A normal
viewport reset changed backing density; those mismatched captures were not used
for acceptance. Daily and receipt were recaptured at the original 1440×1024 CSS /
approximately 0.67 DPR override. Their full/focused combined inputs were rebuilt,
opened and inspected again. The final Daily visible label is Calendar display
mode, matching its accessible name. No actionable P0/P1/P2 drift remained.

## Five fidelity surfaces

1. **Typography:** the existing system font stack, small UI labels and heading
   scale remain. Focused comparisons show consistent weights, line height and
   wrapping. The large duplicated mobile Manage hero was removed intentionally;
   a compact heading remains. Numeric summaries use tabular figures. Billing's
   semantic ALL row header retains the existing total-row emphasis.
2. **Spacing and layout:** Save payment fields now form a balanced inner grid on
   desktop, returning to a single column when narrow. Its correction list is
   initially folded without hiding actual submit/field failures. Monthly's main
   metrics and monthly chart remain visible; same-day and supporting analysis are
   available through native disclosures. Daily keeps attention, conflict and
   dirty-state feedback visible while folding supporting tools. Receipt controls
   consume less vertical space, with the document retaining native scrolling.
3. **Tokens and color:** existing foreground, border, background and semantic
   theme tokens remain. Initial incomplete fields use neutral guidance rather
   than an error-colored wall. Actual errors and unsaved states remain distinct
   and labelled in text, not color alone. Dark viewer chrome does not invert or
   recolor the original receipt document.
4. **Assets:** supplied transparent Q branding, original Lucide glyphs and receipt
   originals are unchanged. No replacement logo, custom-drawn approximation,
   generated decorative art or rasterized UI was introduced. Image fit/zoom uses
   natural dimensions; rotated images have a positive enclosing scroll canvas.
5. **Copy:** shortened upload guidance still states accepted types and 5MB limit.
   Field completeness is explicitly not successful matching. Receipt choices
   include filenames and selected state. PDF actions appear once. Applied scope
   and pending draft changes are described separately; Movement uses percentage
   points rather than an ambiguous percentage label.

## Review findings and corrections

The matched visual comparisons found no unresolved P0/P1/P2 mismatch against the
approved incremental target. The shorter page heights and moved/folded supporting
content are intended changes, not hidden content loss. Expanded Monthly charts
were verified to render with nonzero dimensions. Dedicated export/print builders
remain unchanged and browser-print CSS exposes the folded report contents.

Implementation review also corrected the following before acceptance; these are
functional checks, not invented screenshot-QA iterations:

- Receipt details needed a keyboard-scrollable focus target: the actual controlled
  region now has `tabIndex=0` and a visible focus ring.
- Fit calculations could oscillate when a scrollbar changed available width:
  the image scroller now reserves a stable scrollbar gutter.
- Dynamic pressed/expanded props now use the repository's ARIA helpers.
- Nickname background refresh could accidentally apply pending draft filters:
  it now uses the last validated applied scope and does not interrupt Apply.
- Long unbroken applied nickname text now wraps within narrow screens;
  System ALL retains semibold emphasis after changing Aging cells to row headers.

An additional P2 development-lifecycle issue was reproduced using the real
receipt component in an isolated in-memory React development bundle. StrictMode's
simulated cleanup removed the image source (naturalWidth=0, stuck loading) and
replaced the PDF source with `about:blank`; non-strict controls retained their
blob sources. This cleanup pattern predates the polish, but the new loading
state makes a correction appropriate within viewer scope. Evidence:
`receipt-dev-strict-repro.log`. Setup now restores the captured validated source
for both media types, while actual unmount cleanup remains. The valid-PDF
reproduction (`receipt-dev-strict-valid-pdf.log`) shows preserved sources for
strict and non-strict controls, a decoded image and no page errors. The dedicated
development browser regression passed inside the final production matrix and
checks media teardown as well. PDF frames no longer use an indefinite overlay
that depends on inconsistent native load events; authenticated fetch loading is
retained. The final IAB DOM exposed the iframe and single PDF actions with no
Opening PDF status. The native PDF engine itself is not certified here.

Browser-test assumptions were corrected without weakening app behavior: scroll
edge assertions account for the reserved gutter; downloaded names use the existing
safe filename convention; manual Retry is tested with a terminal HTTP failure,
separately from the HTTP client's automatic retry. One run received a static 404
while a concurrent build replaced the local index. The subsequent stable-build
reruns passed; no timeout, screenshot tolerance or mask was relaxed for it.

The first long-nickname test expected a specific computed wrapping keyword,
whereas existing global CSS supplies the safe break-word fallback. It now accepts
either wrapping keyword while still requiring the actual paragraph and its
scrollWidth to fit inside the mobile viewport. This does not hide overflow.

Only two Save form baselines were refreshed after the main agent inspected
expected/actual/diff triptychs and native-pixel focused comparisons. Source and
implementation images are 1280×720 at the existing snapshot's matched state.
`compare-save-snapshot-{light,dark}.png` (3872×752) contains all three, and
`compare-save-snapshot-{light,dark}-focus.png` (2036×462) makes typography, inputs,
spacing and copy readable. Differences are the approved payment inner grid and
shorter guidance; branding, shell, colors and safe fields are retained. A hash
audit (`save-baseline-hashes.json`) proves the other six baseline PNGs are
byte-identical. Both refreshed baselines passed in the final non-update run.

## Verification and limitations

Final frontend tests passed 2017/2017 (1186 + 831), no failures or skips. This
includes the 28 task-specific TSX presentation cases now connected to the normal
`.test.ts` runner through a scoped regression entry and the existing CSS hook.
The standalone focused presentation run also passed 28/28. Full
client ESLint, semantic TypeScript, production build, sourcemap gate, spacing,
color compatibility, breakpoint, storage, bundle budget, repository hygiene and
tracked/new-file secret guards passed. Browser-spec semantic TypeScript passed
with a local Node/Vite/DOM test configuration. Final production build:
`sqr-1.0.0-315a657a50ce-20261015T013713Z` (dirty source, not committed).
The script suite passed 727 tests with one existing skip and no failures in an isolated
test environment; an earlier run loading local dotenv was discarded because its
LOG_FORMAT setting did not match the test environment's schema. No environment
file was changed to make tests pass.

An exploratory all-57-TSX run without the existing CSS hook reported seven CSS
import initialization failures and one unchanged RoleGuide capitalization
assertion. It is not claimed as green. The affected Collection presentation tests
pass with the correct hook and now run under the normal client command; unrelated
legacy tests were not changed or silently skipped.

In-app interactions checked actual mobile zoom growth, rotation and keyboard
scrolling, receipt selection, PDF action counts, retry loading, Escape/focus
return, field correction focus, inverted-date feedback, native disclosures and
Manage action menus. The earlier stable production receipt/Billing browser matrix passed
24/24, including byte-identical original PDF downloads, terminal HTTP/decode retry,
mobile/desktop light/dark viewing, draft receipt cards and populated Billing
sticky tables/private-save state. Its preserved report is
`artifacts/collection-polish-20261015/receipt-final-report/index.html` and its log
is `receipt-playwright-final.log`. After the final viewer fix, the combined stable
built suite passed **60/60**, no skips, failures or retries, in approximately 8.2
minutes. It covers the real development StrictMode regression, image/PDF/retry
flows, Billing sticky headers/private state, Monthly keyboard disclosures and
print reveal, Daily modes/role restrictions/day dialogs, Nickname draft/applied
scope and both background events, responsive layout/role guards and reviewed
authenticated snapshots. Report behavior separately passed 15/15; the initial
Collection navigation matrix passed 14/14. The final combined report/results are
`artifacts/collection-polish-20261015/final-combined-report/index.html` and
`final-combined-results/`, with `final-combined-browser.log`.

This is synthetic frontend verification, not a real-database save, full remote
CI/release-readiness run, comprehensive WCAG certification, physical-device/GPU
test or native PDF-engine guarantee. Dedicated original-file downloads are
preserved; no real receipt or collection was used for testing. Preview aggregate
fixtures are presentation data and must not be used to validate financial
formulas.

Implementation checklist: visual comparisons inspected; scoped source review
complete; final static checks complete; stable browser, report/navigation and
development lifecycle checks complete; no actionable P0/P1/P2 finding remains
within this scope. Continuation instructions and exact limitations are saved in
`CODEX_CONTINUATION_HANDOFF_COLLECTION_FRONTEND_POLISH.md`.

final result: passed

## Collection CI follow-up — 2026-10-15 (run 38669128827)

CI evidence exposed P1 mobile Retry occlusion and P2 blur-triggered layout/focus
instability. These were functional assertions inside the visual-snapshot stage,
not baseline pixel mismatches. Original CI: 10 failed, 347 passed.

Source evidence:
`artifacts/ci-38669128827/evidence/artifacts/playwright-test-results/`;
matching cases `collection-auto-matching-A-8697a-ack-and-retry-light-390x844-chromium`
and `collection-auto-matching-A-bcbf1-back-and-retry-dark-390x844-chromium`.
Post-fix captures: matching-retry PNGs in corresponding `focused-results/` cases.
Combined full-view evidence: `compare-retry-{light,dark}.png` (804×880).
Readable focused evidence: `compare-retry-{light,dark}-focus.png` (804×330).
The main agent opened both full composites and the light focused composite.

Both source and implementation captures are 390×844 pixels, CSS 390×844, DPR1.
State: completed synthetic fields, terminal matching error, Retry scrolled into
view, light/dark. CI Linux versus local Windows Chrome font rasterization and
system fallback differ; no pixel-equality claim is made across those platforms.

Iteration: before, the sticky Reset/Save footer painted over the matching error
and Retry. After, error/no-match actions flow normally below the feedback; Retry
is fully visible, has a 44px target and passes elementFromPoint plus trial click.
Normal matched-state actions retain their original sticky behavior.

Five-surface check: typography hierarchy and font declarations unchanged;
spacing/grid/radii unchanged except intentional attention-state footer flow;
semantic green/amber and light/dark tokens unchanged; original brand/media
assets untouched; app-specific matching/field/privacy copy retained. No new
visual target or unrelated redesign is introduced. All existing snapshot
baselines and tolerances remain unchanged in this follow-up.

Stable native review details prevent correction controls remounting. Blur-only
validation stays inline; an explicit invalid submit opens review. In-app Browser
verified whitespace Reset confirmation, cancel, disclosure opening, consecutive
correction focus and no console errors. Evidence: `iab-reset-fixed.png` in the
same artifact folder. Preview: loopback51974 (synthetic, read-only).

Receipt fixture-only Chrome resource boundaries and top-level storage seeding
are corrected; four PDF/development-StrictMode cases pass on installed Chrome.
Nested filter tests synchronize actual focus/Sheet exit without delays or
weaker request/data assertions. Final full browser run passes **357/357** on
installed Google Chrome, no retries/skips/failures, in 17.7 minutes. Evidence:
`full-chrome.log`, preserved `full-final-report/index.html` and
`full-final-results/` in the same artifact folder. This includes all original
10 failures, unchanged light/dark snapshot baselines, receipt original bytes,
actual development lifecycle, Save correction/reset/suspended access and
Nickname draft/applied scope. Application and affected browser-spec types,
full client lint, 2017 client tests, 729 script tests (one existing skip),
bundle budgets, secret guard and diff checks pass. No actionable P0/P1/P2
finding remains in this focused repair.

This is a local static/synthetic Chrome run, not a remote GitHub rerun or real
backend/database/production save. The user subsequently approved commit/push for
these fixes; remote CI must be verified on that new commit. Browser-internal
exceptions exist only in the test fixtures; app CSP,
safe-URL handling, backend permissions, data and receipt files are untouched.

final result: passed

## Account Management Option 1 — completed actual-app integration (2026-10-15)

This supersedes the in-progress Account Management review earlier in this file.
The selected design is now integrated into real React Settings components and
existing handlers, not just the ignored prototype. No backend, database, auth
policy, dependency, production deployment or brand asset was changed.

### Evidence and normalization

- Visual truth: `artifacts/account-management-option-1/polish-preview.png`,
  `polish-dark-preview.png`, `polish-mobile-details-preview.png` and
  `polish-mobile-edit-preview.png`.
- Current implementation/evidence root:
  `artifacts/account-management-integration-20261015/`.
- Final desktop captures: `qa-1440-light.png` (also `after-desktop.png`) and
  `qa-1440-dark.png`; source and implementation both 1440×1024 pixels/CSS, DPR1.
- Final full comparisons: `compare-desktop-full.png`, `compare-dark-full.png`.
  Focused readable controls and row comparisons: `compare-desktop-controls.png`,
  `compare-desktop-rows.png`. Both artifacts are in each comparison input.
- Mobile: `qa-390-light.png`, `qa-390-dark.png`, `qa-details-390-dark.png`,
  `qa-edit-390-dark.png`; CSS/pixels390×844, DPR1. Reference dialog captures are
  390×840; only the bottom4px of implementation are cropped for combined
  `compare-mobile-details.png`/`compare-mobile-edit.png`, no UI scaling.
- Secondary actual sections inspected in `qa-create-desktop.png`,
  `qa-pending-desktop.png`, `qa-outbox-desktop.png`.
- IAB actual main-app desktop/mobile captures and manual interactions are also
  saved in this folder. IAB raw screenshots have an oversized backing canvas
  and can offset fixed dialogs after inner-page scrolling; definitive normalized
  comparisons therefore use the explicitly user-approved local Chromium
  captures above. The same fictional identities and real app components are
  used; dates/page sizes are fixture values, not reference artwork copied into UI.

### Iterations and resolved findings

1. Initial nine browser passes/seven failures identified actual mobile overflow,
   typed-query reversion, and Details→Edit focus loss. Positioned nav buttons
   contain the accessible badge label; typed drafts and external applied-query
   snapshots now synchronize without overwriting one another; one-shot
   account/dialog-scoped focus handoff restores the original row after Edit or
   Reset/Ban/Delete cancellation. Query/API/payload contracts remain unchanged.
2. Added actual idle-AI occlusion tests: desktop passed, mobile Next was partly
   covered. Local right gutters now protect row actions and pagination without
   enabling global idle observers or changing AI behavior. Center and four
   inset-corner pointer checks plus actual page2 navigation now pass.
3. Independent review found More→confirmation and desktop compact Settings-menu
   focus-return gaps. Both use explicit connected-origin/destination fallback;
   Cancel/Escape and category switching have additional browser assertions.
   New category tests initially used an incomplete exact accessible name;
   selectors were corrected to include the actual descriptive button name.
   No product guarantee/assertion was removed or relaxed.
4. Final post-fix targeted browser run: **21/21 passed**, no retries/skips.
   Preserved report: `focused-21-final-report/index.html`; `browser.log`.
   Existing Settings/profile/app/Collection regression slice: **64/64 passed**,
   including all unchanged light/dark snapshots; `regressions.log` and
   `regressions-final-report/index.html`. No snapshot baseline or tolerance edit.

### Five-surface review and intentional production adaptations

- Typography: existing system-ui/Segoe UI fallback, 28px operational heading,
  established14px/12px UI hierarchy, weights and tabular timestamps remain
  readable. Prototype heading is approximately30px; retained app typography is
  intentional. Long identity/access text wraps without document overflow.
- Layout: one h1/header, compact horizontal native-button navigation, default
  Managed Account, one neutral count strip, outside search with folded filters,
  five-column full-width table and attached pagination. Responsive cards retain
  legible actions rather than shrinking a desktop table. Local AI clearance is
  intentional. Dialog bodies scroll within viewport, footers remain reachable.
- Colors/tokens: established neutral authenticated dark theme is retained,
  instead of importing the prototype's blue-gray global theme. Semantic
  green/amber/destructive access states carry text as well as color. No new
  global palette, glass backdrop or decorative gradients.
- Assets: original transparent Q/sidebar/favicon assets unchanged, no new raster,
  redraw, fake glyph art or brand approximations. Existing Lucide icons match
  the selected UI's icon vocabulary; no avatars are invented for real users.
- Copy/content: real record versus actual login restrictions are distinguished;
  visible-page counts are explicitly scoped. Existing Banned selector and all
  detail actions/extra facts/timeline entries are retained for production
  completeness (more than the prototype's simplified sample). Reset requests
  are truthfully review-only; no nonexistent approval endpoint or activation
  token is exposed. Outbox clearly labels development scope/disabled state.

### Interaction, console and safety verification

Local synthetic cases cover mobile320/390 and desktop1280 themes, actual query
parameters/pagination, clear/filter/refresh, create validation, held-request
duplicate guards, profile edit payload, cancelled role draft, activation
eligibility, explicit ban/delete/reset confirmations, More/Details keyboard
focus, compact category access, denied roles, and pointer clearance beside AI.
IAB verified actual create/details/editor/pending/outbox navigation and editor
Cancel returning to the original Details button. Final capture metadata
`capture-results.json` reports no page errors or document overflow and restored
focus at desktop1440 and mobile390 in both themes. Preview sockets are isolated
and inert; no production server, database, email, credentials or AI call is used.

No actionable P0/P1/P2 remains in the scoped design. Residual P3: the production
detail footer has more commands than the simplified prototype; all are retained
and keyboard-tested, with a bounded scrolling record rather than hidden data.

Final source verification: app/browser TypeScript, full client lint, frontend
production build, bundle budgets, **2056 client tests**, **729 script tests**
(plus one existing skip), tracked/untracked secret guards and diff checks pass.
No live backend/PostgreSQL test or remote CI run is claimed for this frontend
integration. The preserved64-case regression run predates the final narrowly
scoped focus-handoff fixes; the final21-case run includes those fixes and both
Settings category navigation sizes. All original snapshots remain unchanged.

Implementation checklist: actual components integrated; primary interactions
working; source/implementation full+focused comparisons inspected; responsive
themes reviewed; all identified blocking issues repaired and recaptured.

final result: passed

---

## Collection Report supplied-reference integration — 2026-10-15 (active)

Source visual truth: `C:/Users/Administrator/Downloads/1000317582.png`,
3840×3760 pixels, plus `SQR_Collection_Report_Product_Design_Codex.md`.
This is actual application content integration, not a new app shell/prototype.
The screenshot's global topbar is explicitly excluded. Header/sidebar, tokens,
all collection hooks/endpoints/validation and financial rules remain protected.

Evidence root: `artifacts/collection-reference-20261015/`.
Baseline: `baseline-desktop-full.png`, `baseline-mobile-full.png`, with geometry
and91 protected-shell file hashes. Initial actual implementation:
`firstpass-dark-1600-full.png`, CSS1600×1000, DPR1, pixels1600×1728.
Opened full-view combined input: `firstpass-compare-full.png` (2648×1651).
Source was normalized to1600px width, cropped to module content (42,96–1558,1473),
then density-normalized to1312px content width, height1192. Implementation
content crop is x264,y81,width1312,height1615 from the original full screenshot,
not a locator screenshot that accidentally scrolls under the sticky topbar.
No implementation UI scaling, invented data or logo editing.

Initial findings, ordered by impact:

- [P1] Wide desktop form leaves an empty third grid track. At1600px the old
  auto-fit24rem grid plus full-span receipt retains three tracks; customer and
  payment cards occupy only two-thirds of the module and account/card stack.
  Source shows exactly two balanced cards. Fix: cap responsive grid at two
  columns based on available content width; keep one safe column below threshold.
- [P2] Receipt card and footer touch with no gap, unlike the source's clear
  section rhythm. Fix: scoped20px footer separation.
- [P2] Mobile sticky actions acquired a short containing block during wrapping.
  Fix: move the existing conditional sticky behavior to the footer, keep keyboard
  and matching-attention states static, and verify focus/retry is not obscured.

Five-surface first review: existing system-ui/Segoe UI typography and actual copy
are intentionally retained; neutral authenticated tokens replace the mock's
blue-black surface. Cards, grouped payment identification, RM prefix and real
upload target follow the reference hierarchy. Existing real draft privacy text,
readiness disclosure, errors and receipt metadata remain despite extra height.
Pristine incompleteness is neutral instead of amber; explicit validation uses
semantic warning and successful completion uses text+green. Original sharp Q,
favicon and global icon assets remain unchanged; existing Lucide icons supply
the matching UI vocabulary. No decorative raster assets need generation.

Checklist: fix three findings; rebuild and recapture matching states; compare
full and readable focused regions again; finish responsive/interaction/console
checks and regression runs. Initial firstpass evidence is not final acceptance.

final result: blocked

### Post-fix comparison — Collection Report reference, revision3

Source remains `C:/Users/Administrator/Downloads/1000317582.png` (3840×3760).
Rendered implementation is the actual app, not a picture embedded in a demo:
`artifacts/collection-reference-20261015/final-dark-1600-full.png`,1600×1641px,
CSS viewport1600×1000,deviceScaleFactor1. Module content crop is
x264,y81,width1312,height1528. Source normalized to1600px width, cropped
(42,96–1558,1473), then density-normalized to1312×1192 for equal content width.
The protected global topbar/sidebar are intentionally excluded from fidelity.
Source sample nickname/IC and actual fictional fixture values are not identical;
comparison is the initial entry state (one valid Batch group, six missing groups),
not a pixel comparison of real customer records. No dummy values enter app code.

Opened combined evidence (source and implementation in the same image):

- `final-compare-full.png`: composition, title/internal tabs/nickname/form/receipt/footer.
- `final-compare-form.png`: readable paired form/field/label/identification/RM details.
- `final-compare-receipt-actions.png`: actual upload, completeness and action hierarchy.

Also opened actual final390px/768px/1024px captures and light390px full-page;
mobile action screenshots at390×844 and740×360 show the unchanged idle launcher
below, not over, the real action buttons. These are located under
`browser-ai-on-results/collection-reference-layou-*/mobile-action-clearance.png`.
Final preview `http://127.0.0.1:60624/collection/save?auditTheme=dark` was opened in
Codex browser; actual nickname selection and rendered form verified. Temporary
viewport override was reset and obsolete baseline tab closed; preview retained.
Authoritative dimension evidence uses fresh ChromiumDPR1, because the user's
67% IAB zoom affects the IAB high-level viewport override. User zoom unchanged.

Resolved findings and iteration history:

1. [P1] Initial1600px third grid track: scoped track minimum now uses half available
   width, with at most two equal cards and one full-span receipt. Final1600/1920
   geometry asserts the two cards plus24px gap fill the complete grid width.
2. [P2] Receipt/footer touching: scoped20px margin restores section separation.
   Final geometry checks at all six widths, and combined evidence confirms it.
3. [P2] Short sticky containing block: first fix moved sticky to footer, but the
   revision2 actual390px capture exposed a more important [P1] entry obstruction
   from that entire sticky block. Revision3 uses a static footer at every width,
   plus local4.5rem+safe-area mobile bottom clearance. This follows the brief's
   explicit condition that sticky may be used only if content is not obscured.
   Original Reset/submit/validation/retry/shortcut behavior is untouched. Final
   focused-field and action five-point hit tests cover320×740,390×844,740×360.
4. Early desktop status geometry assertions expected the old vertical layout;
   they now verify nonoverlapping side-by-side feedback/actions on desktop and
   vertical ordering below1024, retaining retry hit-testing and actual requests.
   A development StrictMode test required local runner sandbox escalation for
   esbuild, then passed; no product assertion weakened.
5. The first new AI-clearance test run had AI disabled in the synthetic fixture,
   so all three launcher-presence assertions correctly failed. The fixture now
   accepts opt-in `aiEnabled:true` for these tests, default false elsewhere.
   Corrected reference suite11/11PASS, including all three actual idle launchers;
   no AI prompt, chat activation or external service request is permitted.

Five mandatory fidelity surfaces:

- Fonts/typography: existing system-ui/Segoe UI fallback and tokenized28px h1,
  16px card headings,14px field labels,12px supporting copy retained. Reference
  is rounder/lighter; keeping approved SQR fonts/weights is explicitly intentional
  under the brief. Line height/long text wrapping remains legible, no typography
  overrides leak to the shell. Labels stay associated; card values stay masked.
- Spacing/layout:1480px bounded module, compact single internal desktop strip,
  nickname context card, exactly two balanced desktop panels, full-width receipt,
  real completeness and separated footer.24px column gap,20px section rhythm,
  14px card radii,44px controls. Safe one-column mode where available width cannot
  fit two384px tracks. The screenshot's slightly unequal columns are adapted to
  equal production cards. Extra height (1528versus1192 normalized) is intentional:
  actual privacy guidance, real correction/review disclosure and upload controls
  may not be deleted to mimic the shorter mock. No form-induced horizontal scroll.
- Colors/tokens: established neutral authenticated dark surfaces/primary token
  retained instead of introducing the mock's blue-black global palette. Existing
  green/warning/destructive roles include visible text and icons. Initial missing
  fields are neutral; explicit validation is warning; completed groups are green.
  No gradients, blur/glass, heavy shadows, animation loop or dependency added.
  Light mode is compatibility-checked, not a new global light-theme redesign.
- Image quality/assets: supplied reference contains ordinary interface icons;
  reused real Lucide library icons, no custom-drawn substitute artwork. Q/favicon/
  sidebar and brand assets unmodified. No raster generation, fake logo or customer
  avatar introduced. Receipt original bytes/previews and multi-file metadata still
  use the existing implementation; no screenshot is shipped as UI.
- Copy/content: actual labels, all tabs, validation errors, server feedback,
  receipt file types/size limits, draft privacy and shortcuts retained. Completeness
  counts seven visual groups dynamically from authoritative readiness errors;
  account-or-card is one group, nickname prerequisite is separately announced.
  No fixed1/7, synthetic nickname, fake save, fake DrafSesiAktif badge or unsupported
  drop instruction. Phone field is not rewritten into a fixed+60 transformation.

Accessibility and interactions: one visible h1, semantic section headings and
account/card fieldset, associated inputs/error IDs, decorative icons/RM hidden
from accessibility tree, named native progress, polite status, visible required
labels, keyboard navigation and correction focus. Tests cover long unbroken
names/nicknames, leading-zero card input, independent show/hide in input/review,
draft reload/scope switch, held saves, idempotent retry, Reset confirmation,
permission-limited user/admin/superuser and read-only manager, all module tabs,
multi-receipt edits/removal, image/PDF failure/retry/zoom/rotation/Escape.
Reduced-motion uses unchanged global conventions. No WCAG certification or
real-device virtual-keyboard test is claimed.

Verification collected so far for final source:

- Complete client2067/2067PASS; presentation55/55PASS; browser/app TypeScript,
  full client ESLint, all equivalent sanitized production build gatesPASS.
- Token spacing/color, breakpoint, browser storage, entry shell, bundle budgets,
  repo hygiene, tracked/untracked secret guards and whitespace diff checksPASS.
- Broader unchanged scripts729PASS plus1existing opt-in skip.
- Original Save light/dark snapshots intentionally differed and were visually
  reviewed before update. Final no-update authenticated snapshots2/2PASS.
  Only those two PNGs changed; other six baseline PNGs byte-identical.
- Revision3 original browser slice87passed/3fixture-configuration failures;
  corrected focused reference rerun11/11PASS and final role/layout13/13PASS.
  Fresh combined final run is90/90PASS (zero unexpected/flaky/skipped), followed
  by13/13layout/rolePASS, plus2/2no-update authenticated snapshotPASS. Reports:
  `browser-final-green-report/index.html`, `layout-final-green-report/index.html`,
  `browser-final-report/index.html`; machine-readable JSON/logs retained beside them.
- All91 protected shell/token/shared-primitive files byte-identical, verified
  after final code edits (`final-protected-shell.json`). No backend/shared/API,
  schema/calculation/package/dependency/global CSS/brand source diff.

Console/safety: exact synthetic browser fixtures assert zero unexpected requests,
zero page errors and no document overflow. The read-only source preview rejects
all mutations and closes its intentionally unavailable WebSocket, which reports
`WebSocket closed without opened.` in capture metadata; its incomplete dashboard
GET fixtures are not production failures. Codex tool telemetry403 is external to
the app. Production, real customer data, accounts, database and AI are untouched.
No live backend/PostgreSQL run or remote CI result is claimed.

No actionable visual P0/P1/P2 remains. Optional P3: ClearPending occupies its own
retained receipt-control row rather than the reference header; preserving the
shared receipt panel without portal/duplicate controls is an accepted trade-off.

Implementation checklist: source mapping integrated; all existing behaviors kept;
identified layout blockers fixed and recaptured; full/focused comparisons opened;
responsive/keyboard/error/privacy states tested; final combined reports passed.

final result: passed

### Approved compact Collection polish — 2026-10-16, in progress

Scope: the user approved suggestions1–3 from the follow-up Product Design
review: one desktop shortcut hint, receipt ClearPending in its section heading,
and less empty upload height. Matching status relocation (suggestion4) is not
included. Existing matching/save/receipt rules, default editor, shell and assets
remain protected. The completed reference integration above is the baseline.

Source visual truth: `artifacts/collection-reference-20261015/final-{dark,light}-{1440,390}-content.png`
with the three explicitly approved deltas. Original supplied source remains
`C:/Users/Administrator/Downloads/1000317582.png`.
First implementation captures: `compact-final-*`; same CSS viewports and DPR1.
At1440, source/actual content are1152x1547/1152x1420px. At390 they are
358x2785/358x2712px. No stretch/rescale was applied; pairs align by module top.

Opened combined full comparisons: `compact-compare-{dark,light}-1440.png` and
`compact-compare-dark-390.png`. Focused actual receipt/header/footer comparison:
`compact-compare-receipt.png`. Main also opened the real source preview in
Codex browser and selected fictional CollectorAlpha; `compact-iab-review.jpg`.
The IAB's existing zoom differs from CSS1:1; authoritative geometry uses fresh
approved ChromiumDPR1. No user browser zoom was changed.

Iteration1 finding [P2]: the relocated receipt header action can enter the
unchanged idle AI launcher's right-edge strip near the viewport bottom (visible
in both desktop combined comparisons). Add local receipt-action end margin,
then rebuild, recapture, compare and assert all five action hit-test points with
AI enabled on desktop/mobile before accepting. Do not change global launcher.

Initial static/type/lint/build guards passed. Browser94 initial run:92passed,
2timeouts during browser context setup, before app interaction (logs retained).
Role/layout13passed. Initial snapshots intentionally differ only in the Save
layout; review final versions before any baseline update. No tolerance relaxed.

final result: blocked

### Compact polish post-fix visual acceptance — 2026-10-16

Source visual truth and approved scope remain the accepted pre-polish captures
listed above, with only suggestions1–3 applied. Post-fix actual captures are
`artifacts/collection-reference-20261015/compact-fixed-{dark,light}-{1440,390}-content.png`.
CSS viewports1440x1000 and390x1000,DPR1; matching source/actual content widths
1152px and358px. Source/actual content heights1547/1420 and2785/2712px.
The reduced height is intentional, not a density/scale change. Original global
shell is unmodified and excluded from these content comparisons.

Combined evidence opened and reviewed after the fix:

- `compact-fixed-compare-dark-1440.png`: whole module, single desktop hint,
  unchanged cards/fields, actual receipt/readiness/static footer.
- `compact-fixed-compare-receipt.png`: readable actual receipt header, relocated
  action, upload and completeness/footer. The action is now clear of the AI.
- `compact-fixed-compare-{dark,light}-390.png`: mobile wrapping, retained local
  shortcut, receipt action on its own header row when needed, reachable controls.
- `compact-snapshot-compare-{dark,light}.png`: exact1280x720,DPR1 baseline/actual
  pairs reviewed before update. Only duplicate shortcut removal and resulting
  module-content reflow are visible above the fold; global shell stays identical.
- Codex browser tab3 shows current source preview at
  `http://127.0.0.1:64521/collection/save?auditTheme=dark`, fictional CollectorAlpha.
  `compact-iab-final.jpg` retains browser proof; browser error/warning log empty.
  No viewport override or user zoom changed in this follow-up.

Resolved P2 iteration history: first comparison showed the new header action
overlapping the unchanged fixed AI launcher. Local receipt-action end clearance
now reserves3.5rem. Rebuilt source was recaptured and paired again above; actual
five-point button hit tests and keyboard clear pass with AI active at1440/390.
An initial mobile test expected idle AI while a customer input was still focused;
the application intentionally hides AI during typing. The test now moves normal
focus to ClearPending before checking idle AI, rather than altering the product
or weakening the obstruction assertion.

Required fidelity surfaces:

- Typography: existing family/weights/field labels/supporting-copy scale and line
  heights retained. Header text wraps without clipping. No new font introduced.
- Spacing/layout: header action slot, one visible shortcut per breakpoint, empty
  zone152px minimum with32px icon and44px upload target; tighter8px gaps/12px
  vertical padding. Existing field44px controls, two-column cards, summary and
  footer separation stay intact. At narrow widths the header action wraps safely.
- Colors/tokens: existing background/border/text/primary/disabled tokens reused;
  no palette/global CSS/animation/dependency change. Light/dark both compared.
- Assets/image quality: existing real Lucide icons reused, decorative icons remain
  aria-hidden. Q/favicon/sidebar/brand originals and receipt bytes are untouched.
  No generated, redrawn or rasterized replacement UI/brand asset introduced.
- Copy/content: real helper/file-limit/privacy text retained; duplicate desktop
  shortcut suppressed only at>=768, mobile guidance retained. No new drop promise,
  matching status duplication, upload rule or save validation introduced.

Keyboard/behavior checks retain the existing clear callback and busy/empty
disabled guard; one ClearPending button only in SaveCollection. Generic panel
callers retain optional clear action and default editor layout. Clearing pending
receipts leaves customer values untouched and empties the file input without a
save/match request. Visual tests cover320/390/740/768/1024/1440/1600/1920 widths,
role permissions, long values, privacy, receipt preview/PDF and original save and
matching transitions. No production/backend/live-database or WCAG certification
claim is made.

Verification: equivalent sanitized production build, app/browser TypeScript,
full client lint and static safety gates passed (`*-compact-polish-3.log`).
Complete client2069/2069passed, no skip/fail; focused SSR/source19/19passed.
Broad browser94 had92passes and two new mobile test-state expectation failures
explained above; all15 focused reference cases passed after the test fix,
resolving those two. All79 non-reference cases passed on final app code, plus
all15 reference cases and13role/layout cases. Do not describe the broad run's
exit1 as a single clean94-test run. Logs retained for honest traceability.
Only the two reviewed Save light/dark snapshot PNGs were updated by normal
Playwright; six others byte-identical (`compact-snapshot-reviewed-change-report.json`).
All91 protected shell/token/shared files byte-identical (`compact-final-guard-protected-shell.json`).

No actionable visual P0/P1/P2 remains. Matching status relocation is intentionally
deferred, outside the approved1–3 scope. Checklist: compare, fix AI clearance,
recapture, verify keyboard/mobile and unchanged behavior, review/update only two
snapshots. Final no-update snapshots2/2passed with no retry/skip:
`snapshots-compact-snap-final.log`. Only the two approved baselines changed.

final result: passed

## Collection compact navigation — 2026-10-16 (current task)

Source: actual `/collection/records` compact navigation, captured in browser
Codex before edits; baseline33d25ea9. This task supersedes the previous Save-only
hero presentation, not its forms/receipts. No new design system/assets/dependency.

Comparison confirms Save's duplicate eyebrow/title/subtitle and full labels were
a route-only override. Source and final screenshots were opened together at
matched1366x900/390x900 and DPR1 in both themes, full viewport/page and focused
navigation regions. Exact source uses the five baseline UI files from33d25ea9
in an isolated read-only preview, all other source/fixtures identical. Both
light/dark desktop Records viewport PNGs are SHA256-identical before/after.

Mandatory surfaces: typography uses existing Records short label scale/full
accessible names; layout uses one40/44px strip with same1480px page width and16px
content gap; colors reuse original active/focus/border tokens; icons/Q/assets are
unchanged; only navigation presentation changes, all form/privacy/draft copy stays.
Native buttons retain Tab/Enter/Space, full labels and aria-current. Mobile badge
prefix is visually hidden so nickname remains visible, full accessible text kept.

Initial automated review found partial mobile keyboard reveal (P2); fixed with
strip-only focus scrolling that preserves full button and focus-ring clearance.
Monthly's new test selector matched both legitimate headings; scoped selector
fixed without changing product content. Old mobile-Sheet source contracts and
Router test children type were updated; no assertions skipped or tolerances raised.

Visual result: the original Records40px desktop tabs, icon size,12px inline
padding, active surface/border/text, inactive treatment and16px content gap are
shared by Save. Mobile uses44px targets and one horizontal strip; no page overflow
or five-row stack. Save content moves fromY250.59 to158 (~92.6px) at1366 and
Y267.80 to154 (~113.8px) at390. Form columns/cards/controls/notices retain their
original geometry/content below the compact header; only the existing shortcut
hint becomes visible on desktop. Nickname badge is optional once, full accessible
text retained, mobile prefix visually hidden to show nickname. Global shell/Q
and91 protected shared files remain byte-identical. No new images/fonts/icons,
hardcoded palette, animation, new dependency or global CSS.

Required fidelity passes completed: typography (existing Records scale/weights,
no clipping or cramped labels), spacing/layout (source grid/density and deliberate
mobile scroller), colors/tokens (same light/dark active/focus/disabled surfaces),
assets (original Lucide/Q/receipt bytes unchanged), copy (only shortened nav
presentation; draft/privacy/required/form/helper text retained). Native keyboard
Tab/Enter and all-eight-section clicks, route/history/refresh and aria-current
were verified; scroller exits focus normally. Ctrl+S and Meta+S each submit the
original synthetic payload exactly once. Existing form and floating-action
pointer-clearance checks pass; no new overlay was added.

Final evidence: `artifacts/collection-compact-nav-20261016/final-compact-summary.json`
and48PNGs (16 matched states). Source preview has the same missing-fictional-GET,
blocked heartbeat/WS diagnostic patterns before and after, zero warnings/no new
distinct errors. This is not misrepresented as a zero-error source preview.
Actual built-fixture runtime gates pass with no unexpected APIs/page errors;
layout tests also gate console errors. Browser Codex final DOM interaction and
nickname selection succeeded; its later screenshot export reported zero-width,
so final visual evidence is the approved local Playwright capture, not an invented
IAB screenshot. Preview remains local; no production/backend/real data accessed.

Verification: client2077/2077; presentation56/56; full app/browser TypeScript and
client lint; sanitized production build/static safety gates; Collection browser
112/112 plus layout13/13 and completion3/3; allPASS. Effective125% CSS footprint+
DPR coverage is explicit, not a native browser zoom-UI claim. Script suites666
Node passes/0fail/1pre-existing opt-in Viewer skip and63TS passes. Only reviewed
Save light/dark baselines changed; final no-update snapshot2/2PASS across8images.
Initial failed/interrupted runs are retained in logs and explained in the handoff;
no tests/tolerances were disabled to accept a regression. `git diff --check`PASS.

No actionable P0/P1/P2 remains for this bounded navigation task. Unused previous
Sheet-state props are harmless compatibility cleanup debt; not expanded here.
Production/CI deployment and formal WCAG certification were not performed.

final result: passed

## Collection Daily compact calendar and record-first popup — 2026-10-16

Source: the accepted local audit at
`artifacts/daily-audit-20261016-local/report.md`, unchanged frontend baseline
`3b4c5e68ff5613cdedf68308eb4d3704effb554e`. User approved all three audit
recommendations: compact calendar, record-first desktop popup, readable mobile
popup/pagination/focus return. This is intentional scoped polish, not a pixel
clone or a new visual direction. Existing SQR type, tokens, Lucide and Q remain.

Comparison inputs place actual source and implementation together:
`artifacts/daily-polish-20261016/desktop-overview-comparison.png`,
`desktop-popup-comparison.png`, `desktop-empty-comparison.png`, and
`mobile-popup-comparison.png`. Their HTML files retain the exact input PNGs.
Desktop CSS1440×900: source965×603 pixels from the audited browser's0.67 export;
implementation1440×900 atDPR1 is displayed965×603 beside it for density matching.
Mobile source about390×843 (CSS389×843), implementation390×843 atDPR1.
The one-pixel mobile width difference is not treated as product drift. Underlying
page scroll/active focus differs around the modal, so compare the modal content,
not its backdrop. The source's browser export crop/edge is not an app defect.
No screenshot is redrawn or modified; HTML comparison only normalizes display size.

Browser Codex was used for the source audit. During implementation it reported
that local browser use was disabled in Work settings. User explicitly authorized
local Playwright/Chromium; implementation evidence therefore comes from that
permitted browser fallback. The GET-only loopback preview uses fictional October
data, no dotenv/backend/real records. The second real-built-app test uses fresh
disposable PostgreSQL and independent fictional August data. Neither uses production.

### Findings and iteration history

- Baseline P1: first customer's details started below the initial popup viewport;
  repeated date/count/amount/status panels dominated the dialog. Consolidated
  Target/Kutipan/Baki once, count context once, routine audit in a closed native
  disclosure. Important leave, remarks and leave-with-collection notices remain
  visible. Initial and later desktop/mobile captures show the first record header.
- Baseline P1: mobile amount/counts clipped in three narrow summary columns.
  Collected amount now has a full-width row, target/balance below; full numbers
  wrap instead of ellipsizing, freshness stays fit-content. Large synthetic amounts
  are separately verified at1440/390/320.
- Baseline P2: date cells/preamble repeat status counts and management controls.
  One quick-filter/display toolbar, explicit permission-gated management mode,
  lower optional monthly breakdown and one actionable conflict disclosure. Dirty
  review stays outside management mode. Seven modes/preferences are preserved;
  only seven-column Content/Heatmap retain weekday headings and leading blanks.
- Baseline P2: Escape returned to BODY. Separate day/receipt launchers now live in
  the always-mounted page model. Removed/hidden/disabled launchers fall back to
  the actual date or the parent scroll region; nested dialogs do not focus behind
  the parent. Pagination does not replace the original launcher. Real browser
  tests cover Escape, Close, nested receipt and editor→details handoff.
- Iteration1 P2: intermediate-width monthly metrics made an uneven3+1 row at768px.
  Evidence `iteration-1-768-light-overview.png`. Revised local CSS explicitly uses
  two columns at768–1279 and four at1280+, without shrinking amount text.
  Post-fix `tablet-metrics-comparison.png` was opened with both versions in one
  input; confirms balanced2×2 at768 and unchanged typography/content. All five
  width/theme geometry tests pass after this change.
- Capture correction: initial empty/large-amount exports caught dialog entrance
  animation and are rejected as visual evidence. Capture now disables finite
  animation for stable screenshots; motion itself was not removed from the app.
  Stable later captures were re-opened and compared; empty popup is opaque and
  content-driven, and large values are fully readable. The synthetic large-amount
  fixture also uses a consistent below-target status (no app calculation change).
- First actual-built-app workflow failed because the expanded monthly breakdown
  legitimately repeated the “Holiday / Leave” label. Scoped the locator to its
  named breakdown region, retaining both labels and all assertions. Added bounded
  phase diagnostics; no timeouts/tolerances or security checks were relaxed.
- Iteration2 P2: dark conflict text inherited a light-only brown (axe2.07:1),
  and secondary OFF/AL/NOTE code text was visually too dark. Conflict text and
  dark code labels now use existing foreground tokens, preserving warning surfaces.
  Post-fix `1440-dark-calendar.png` and `dark-badge-readability-comparison.png`
  were opened together with the pre-fix badge capture. Text is clear in both
  themes; post-fix32-state axe run reports zero violations.
- Semantic follow-up: the compact context's generic labelled div was an axe
  incomplete. Added explicit group role; final SSR and32-state rerun confirm the
  new context no longer appears in incomplete findings. No visual redesign.

### Five required fidelity surfaces

- Typography: existing SQR family/fallback and scale, compact sentence-case
  headings, tabular financial values; no new font or asset dependency. Full names,
  references and values wrap; receipt filenames retain accessible full labels.
- Layout/spacing: desktop width remains1024px with intrinsic content height and
  viewport cap; one internal scroll region and compact fixed footer. Mobile keeps
  fullscreen height, shared safe-area token and side-by-side44px page controls.
  Close hit area44px is scoped to this dialog, not the generic UI primitive.
- Color/tokens: existing light/dark surfaces, borders and focus rings; operational
  Working/Leave badge neutral, financial success/warning remains separate.
- Assets: original Lucide/Q/brand assets retained; no generated/drawn replacement,
  favicon/global navigation/shared theme changes. Receipt preview implementation
  and authorization are unchanged; synthetic image only exercises nested focus.
- Copy: shortened popup heading/description, clear Target/Kutipan/Baki and localized
  pagination. Audit/freshness/leave messages remain available; stale warning stays
  visible. No-target state avoids a misleading percentage. No prompt text appears.

### Verification

Full client passed2112/2112 (1192+920), no failure/skip. Focused contracts/SSR/focus
85/85 passed; final follow-up presentation/focus65/65 passed, including readable
badge tokens and context-group semantics; script-focused43/43 passed. Clean script suite passed667 Node tests with
one existing opt-in skip, plus63 TypeScript tests. Initial script run's seven TS
failures were the local dotenv's unsupported LOG_FORMAT, not this UI change;
reran with DOTENV_CONFIG_PATH=NUL and no environment-file edits. First integration
run was not green and is retained as `daily-polish-isolated.log`. Successful
post-fix real-built-app evidence: `artifacts/frontend-redesign/final-ZNB5Ag/manifest.json`,
10/10 Daily workflows at1440/1024/768/390/320 light/dark,10 route accessibility
captures with no violations, zero page errors/external requests. PostgreSQL,
temporary app and fixture processes were cleaned by the owned runner. Final
readability/ARIA-only follow-ups use current-source browser verification plus a
fresh production build (`daily-polish-release-build.log`), not a stale built app.

Current-source evidence: `artifacts/daily-polish-20261016/checks.json` (10 viewport/
theme states, seven modes, modal geometry, keyboard, two-page records, complete
amounts, management visibility and focus), `edge-checks.json` (three widths with
nested receipt/editor return, large values, loading/error), `a11y.json` (32states,
zero violations, no new context ARIA incomplete), and matched comparison PNGs.
Runtime page errors are zero. Source-only preview intentionally has incomplete
fictional non-Daily GET fixtures/blocked mutations; those are not production errors.

Late CI-selector audit also found `tests/visual/collection-report-controls.spec.ts`
still expected the old popup title and nested status-tools summaries. Updated its
four Daily cases for the explicit management toggle and new title, preserving all
seven modes, persistence, disabled Save checks and user-role boundaries; added
editor→details focus handoff. Exact existing Playwright tests against the current
built static frontend and deny-by-default synthetic HTTP fixtures PASS4/4, no
retry/skip/baseline update (`daily-polish-report-controls-final.log`). A late
320px edge attempt sent Escape during the editor's exiting layer; it was not a
clean pass and is retained in `daily-polish-release-edge.log`. Waiting for the
actual new modal to own focus/finish its finite entrance (no fixed sleep or retry)
made the same extended suite PASS3/3 (`daily-polish-release-edge-final.log`).

At1440×900, popup stays1024px wide and810px high with first record headerY396.75,
versus baseline aboutY800 (outside its scroll viewport). Empty desktop popup is
501.75px high. At390×843, collected amount/counts are fully visible, first record
starts aboutY458, footer buttons are side-by-side44px. At320 the first record
header still fits before scrolling. Focus checks cover Tab/reverse Tab, Escape,
Close, repeated pagination, receipt inside the day dialog and editor→details.

Axe incomplete results remain explicitly retained: legacy shared brand generic
ARIA, conditional popup relationships, Radix modal-focus review and gradient/
pseudo/partially-obscured contrast. Keyboard containment/restoration and matched
visual review supply scoped manual evidence; these are not silently waived rule
violations or a claim of full WCAG certification. Generic/shared UI is protected.

Final checklist: source and final opened together; full-view and focused calendar,
popup, tablet and mobile comparisons reviewed; P1/P2 fixes recaptured/recompared;
tests/build/typing/lint complete; backend/API/permissions/calculations/shell/brand
unchanged by file diff; no dependency or snapshot-baseline changes. No actionable
P0/P1/P2 remains in the approved Daily scope.

No commit/push/deployment. Not a formal screen-reader/WCAG certification or real
production financial-calculation/data audit. No visual snapshot baseline changed.

final result: passed

## Collection Daily follow-up — 2026-10-17 — accepted final verification

Scope: approved month shortcuts/current-month action, neutral today indicator,
popup date stepper, and stable loading/pagination. Existing approved SQR code and
the previous phase's accepted renders are the visual target; no new art direction,
brand assets, templates or global component changes. Product Design is used for
bounded implementation and matching source/render QA.

Source truth: `artifacts/daily-navigation-20261017/baseline-source/`, copied before
follow-up edits (not git HEAD, which lacks the accepted prior polish). Native
source captures: `before-{1440|1024|768|390|320}-{light|dark}-{overview|popup}.png`
in that same artifacts folder. Implementation captures use the corresponding
`after-` filenames. Both are rendered from current real frontend source with
fictional GET/HEAD fixtures, no backend/DB/env files/production/mutations.

Implemented and reviewed: Malaysia calendar time and midnight refresh,
atomic2000–2100 month navigation, neutral Hari ini/aria-current=date across all
seven modes,44px popup arrows, current-date announcement, retained original
launcher, fixed popup geometry, records-only busy/error state, no previous-date
or staff-scope records during loading, retry/focus, date/page scroll reset, draft
protection and explicit Refresh discard confirmation.

### Evidence and normalization

Codex in-app browser became available again; the original matching visual review
and native screenshot export used that selected browser, not a separately launched
Playwright/Chromium CLI/MCP. Subsequent explicitly authorized CLI regression is
recorded below separately. Temporary tab-scoped Fetch interception only held or
returned one synthetic local GET500 for deterministic loading/error/retry checks;
interception was cleared. Device metrics/viewport overrides were restored.

Ten matching viewport/theme pairs: nominal1440/1024/768 at900high and390/320 at843
high, light/dark, overview and populated14October popup. Browser's existing67%
zoom was preserved. Tab-scoped device metrics compensate for it; native PNG
export normalizes to about1pixel/CSSpx, with no screenshot resizing/editing.
Actual CSS widths:1440,1024,769,389,319; PNG widths:1440,1024,769,390,319. These
rounding differences are recorded in `browser-checks.json`; before/after in each
pair have matching CSS size/pixel dimensions/density. Heights900/843 match.

Source and result opened TOGETHER in `generated-comparison.html`; native combined
comparison captures are1600×1500. Full-view evidence:
`comparison-desktop-light-popup-full.png`,
`comparison-tablet-768-light-overview-full.png`,
`comparison-desktop-1024-dark-overview-full.png`,
`comparison-mobile-390-dark-popup-full.png`,
`comparison-mobile-320-dark-popup-full.png`.
Focused evidence: `comparison-desktop-{light|dark}-overview-focus.png` and
`comparison-desktop-dark-popup-focus.png`. Identical CSS crops of unchanged
source PNGs, not reconstructed UI. Reviewed full proportions, then readable
month/date controls, metric values, first records and footer at the same scale.

### Findings, correction and re-comparison

- [P2, resolved] First pass had duplicate vertical spacers on the new44px date
  toolbar, adding about66px to the header. Evidence preserved in `iteration-1/`,
  including combined comparison PNGs and first-pass metrics. Removed component
  top margin and slot top padding, retaining the shared header's6px spacing.
  Restarted only the owned no-watch current preview, recaptured all10 after
  states and reopened matching full/focused comparisons. Added header footprint
  is now about50px; first record moves16px up. Final first-title tops:444.4px at
  desktop,505.3px at389px and572.8px at319px; all are inside the scroll viewport.
- No remaining actionable P0/P1/P2 in the approved follow-up. Fixed desktop popup
  stays about1024×810; mobile remains fullscreen843px with44px close/arrows/page
  actions. No document overflow in any final pair. Native global Collection tab
  scrolling at narrow desktop width is unchanged from the approved source.

### Required fidelity surfaces

- Fonts/typography: existing SQR font family, weights and text scale retained;
  compared heading/label/value wrapping in both themes. No new heading hierarchy,
  truncated amounts or tiny tap labels. Long synthetic customer name still wraps.
- Spacing/layout: compact month controls share the desktop input row and become
  a full mobile row. Date controls add only the intended44px targets +6px gap;
  protected metric/record styling remains aligned. Stable footer uses a reserved
  range line area to avoid paging/loading label reflow on mobile.
- Colors/tokens: native light/dark surfaces/focus rings/financial colors retained;
  Hari ini uses neutral foreground/background, not another performance color.
  New controls use existing Button tokens, with clear enabled/disabled states.
- Images/assets: original Q/favicon/brand and Lucide icons unchanged, no generated,
  approximate, recreated or edited assets. Comparisons display original PNGs.
- Copy/content: clear Bulan ini, distinct date vs record-page navigation and full
  accessible button names. New date is announced politely; pending summary shows
  unavailable values rather than falsely carrying old-date financial numbers.
  Real API error text remains out of record content; inline retry is localized.

### Verification and scope

Complete client suite PASS2135/2135 (1341+794), no failures/skips, using serial
files on this4GB machine (`daily-navigation-client-serial-final.log`). Initial
parallel run exhausted Node memory; first serial run caught an obsolete inline
spinner-margin source contract. Both histories retained; corrected the contract
to test decorative aria-hidden/animation, not obsolete spacing. Post-polish focused
tests PASS99/99 (`daily-navigation-post-polish-tests.log`). Typecheck and client
lint PASS with confirmed sequential command exit0; scripts PASS43/43; design
spacing and final production/status/CSP/sourcemap build PASS
(`daily-navigation-typecheck-confirmed.log`, `daily-navigation-lint-final.log`,
`daily-navigation-script-contracts.log`, `daily-navigation-build-accepted.log`).

`browser-checks.json`:19/19 functional checks pass;20 matched visual entries,
including10 final after states. Checks cover record page2; adjacent date resetting
to page1; first/last date bounds; original opener focus; held date loading, HTTP500
and retry/focus; unchanged popup bounds; previous/current month and Malaysia today;
all7mobile modes without overflow; year rollover and2000/2100bounds; draft lock,
cancel focus and confirmed Refresh discard; forward/reverse Tab containment,
Escape; held mobile page loading retaining the correct summary/footer without
old records; date loading clearing old details; date/page scroll reset. Final
spacing-only recheck also confirms date stepper/title live announcement/original
focus. No source report is presented as browser runtime evidence.

Playwright CI spec retains4 prior Daily cases and adds9 (13Daily/16total).
The user subsequently explicitly authorized local Playwright/Chromium with
synthetic data. ALL16 exact cases now PASS, one worker, zero retries/skips or
snapshot-baseline updates, on fresh built assets with loopback deny-by-default
fixtures. Log: `artifacts/daily-navigation-playwright-accepted.log`; HTML and9
native screenshot attachments: `artifacts/daily-navigation-playwright-report-accepted/`.
Machine-readable result: `artifacts/daily-navigation-playwright-accepted/.last-run.json`.
This is local regression evidence, not a claim that remote CI has run or passed.

The initial CLI run14PASS/2FAIL is retained in
`artifacts/daily-navigation-playwright-initial.log` and its failure screenshot/trace
directories. Both failures were the same lifecycle issue: after successful Retry,
the original error toast's later Radix layer consumed Escape before the day dialog.
The hook now retains/dismisses only its owned toast on superseding request/cache/
retry, selection/scope close and unmount. History, unrelated alerts and global
dialog/notification components are unchanged. Strengthened runtime assertions
verify the error notification existed, was dismissed within1s of Retry (not its
normal5s expiry), wait its finite outgoing layer, then keep the original one-Escape
close and calendar-focus assertions. No timeout increase or skipped assertion.
Report fixtures now explicitly reject every non-GET Collection request.

Post-fix typecheck/client lint/fresh production/status/CSP/sourcemap build PASS:
`daily-navigation-cli-{typecheck|lint|build}.log`; focused utilities/reducer/focus/
presentation tests PASS105/105, zero skips (`daily-navigation-cli-focused-final.log`).
The complete2135 client run above preceded this bounded notification fix; it was
not rerun in the supplementary turn. Final desktop and mobile loading PNGs were
opened for inspection; expected stable shell, pending values and footer retained.
The static runner closed its owned loopback server. The existing current-source
preview was restarted only after exact process/port ownership verification; no
other preview processes or data were removed.

No new axe/screen-reader certification claim; manual
keyboard/ARIA/render evidence and automated source contracts are scoped to this
work. Prior phase's unchanged receipt-nesting/large-value checks remain historical
evidence, not a claim those scenarios were rerun this phase.

No deployment, commit, push, production access, API/backend/permission/calculation
or shared-shell/brand changes. Source and final comparison reviewed after the P2
fix; no remaining required implementation work in the approved scope.

final result: passed

## Release breakpoint regression supplement — 2026-10-17

Release run38990883407 on950be08d stopped at the workspace breakpoint contract:
Daily's1280px media tier was unsupported. This follow-up changes that one threshold
to the existing1024 desktop tier, without broadening the contract or redesigning
the page. Previous768 tablet2-column layout remains; desktop1024+ now uses4.
The earlier1024 before/after captures above are historical, not current-tier proof.

Fresh built frontend with synthetic loopback responses: all24 report-controls
Playwright cases passed, including8new summary checks across768/1024/1280/1440 in
both themes. Complete ordinary fixture amounts fit without digit wrapping or
horizontal overflow. Native summary PNGs attached in
`artifacts/daily-navigation-playwright-report-release-breakpoint/`; sampled
768dark,1024light/dark and1280light opened for inspection. At1024 the long final
label wraps normally; no amount is clipped. No image edits or snapshot updates.

Exact breakpoint gate and13release static fast gates passed;19focused script
tests,670Node+63TS script tests (1existing opt-in skip),62presentation regressions
and a fresh production/status/CSP/sourcemap build passed. Logs and explicit limits
are in `CODEX_CONTINUATION_HANDOFF_COLLECTION_DAILY_POLISH.md`. No full new
financial-stress/WCAG/remote-release-success claim. No production/database access,
deployment, commit or push in this repair turn. The owned static test server closed.

final result: passed (bounded release/layout regression)

## Simpan Collection layout repair — 2026-10-17

Approved scope: implement the local audit findings for control sizing, date-field
appearance, mobile guidance density, receipt action spacing and floating AI
clearance. The existing form screenshots are the visual source, with these
specific corrections accepted by the user. This is a bounded production frontend
repair, not a new prototype or a replacement design system.

### Visual evidence and normalization

Evidence root: `artifacts/save-collection-polish-20261017/`.

- Source: `before-mobile-dark.png` and `before-desktop-dark.png`; actual Codex
  browser captures at effective CSS391x845 and1440x1000, Collector Alpha selected,
  empty form, dark theme, draf disclosure not yet present.
- Final implementation: `after-mobile-dark.png` (391x2489 full-page),
  `after-desktop-dark.png` (1440x1458 full-page), `after-tablet-light.png`,
  `after-mobile-light.png` and `after-landscape-dark.png`.
- Final native Playwright captures use deviceScaleFactor1. Source in-app captures
  had devicePixelRatio0.67 and extra screenshot canvas:549x4033 and2115x2172.
  The comparison script removes only canvas beyond the measured CSS content
  width; it does not stretch the UI. Therefore these are qualitative layout
  comparisons, not a claim of identical rasterization across browser densities.
- Opened combined source/implementation evidence: `comparison-mobile-top.png`,
  `comparison-desktop.png`; readable focused mobile evidence:
  `top-mobile-dark.png`. `footer-landscape-dark.png` shows the repaired short
  viewport launcher clearance.
- Exact same-density CI comparisons: `comparison-snapshot-light.png` and
  `comparison-snapshot-dark.png`, each pairing the previous1280x720 baseline with
  the rendered1280x720 implementation. Only the two reviewed sumbangan-form
  baselines were regenerated; dashboard/settings baselines remain unchanged.

### Findings, fixes and iteration history

1. P2 — nickname trigger was about37px while its adjacent refresh and form fields
   were44px. Scoped nickname CSS now sets both controls to2.75rem; narrow screens
   use an accessible44px refresh icon beside the picker, with its label retained.
2. P2 — date trigger had different radius, border, shadow and dark background.
   Local classes align its radius/border/shadow; the existing dark input token
   supplies its background. Runtime assertions compare computed input/date styles.
3. P2 — mobile guidance pushed Customer Name low down the viewport. Native details
   retains the full privacy explanation and opens by keyboard. Mobile keyboard
   shortcut copy is hidden; the required/either-account-or-card instruction stays
   visible. Nickname-change warning remains visible and concise.
4. P2 — idle AI ignored form controls, and computed launcher positions were not
   wired into its shell. Save-route-only tracking and CSS coordinates now avoid
   visible controls, including nickname and native disclosure triggers. Other
   routes retain their existing idle behavior. Scroll work is frame-coalesced;
   container ResizeObserver and native toggle cleanup are covered.
5. P2 — the first mobile footer recheck exposed a collision from the old fixed
   offset candidates. Save-only candidates now include obstacle boundaries with
   8px clearance. The subsequent740x360 browser test exposed a second issue: the
   geometry used a480px floor while CSS positioned in360px. Adaptive launcher
   calculations now use actual height, preserving existing panel calculations.
   Both exact geometry cases have regression tests; final portrait/landscape
   browser checks pass with zero visible-control intersections.
6. Receipt Clear Pending no longer needs the3.5rem right inset, and the mobile
   footer no longer needs4.5rem of compensatory blank space. Both remain reachable
   after scrolling and via keyboard.

### Required fidelity surfaces

- Typography: existing family, weights, sizes and hierarchy retained; long
  nickname/customer values remain contained. Full privacy copy remains readable
  when expanded.
- Layout/spacing: equal desktop card tracks retained;44px controls, consistent
  date shape, compact mobile nickname row and normal footer spacing verified.
- Colors/tokens: existing light/dark semantic colors retained; date background
  now matches the existing input token. Validation/focus behavior is preserved.
- Assets: existing Q branding and Lucide icons retained; no raster redraw,
  substitute logo or added decorative asset.
- Copy: shorter nickname context and draft summary intentionally differ from the
  old screenshot; privacy boundaries and required-field instructions are intact.

### Verification and boundary

`browser-tests-accepted.log`:36/36 targeted Playwright cases pass on the freshly
built frontend, one worker, zero retries/skips. Includes desktop1920/1600/1440/
1024/768/390, effective125% zoom,320px mobile,740x360 landscape, masked long card
values, receipt clear, native disclosure keyboard, AI idle scroll/focus/open/
minimize, reset/draft/retry and synthetic save shortcut payloads for supported
roles. `unit-accepted.log`:58/58 focused tests pass. Typecheck, affected source
ESLint, production client build, breakpoint and spacing guards pass.

`snapshot-accepted.log`: both authenticated light/dark snapshot tests pass again
without snapshot-update mode after regenerating only the two reviewed form PNGs.
Together with the36 functional/layout cases,38 final Playwright cases pass.

Final5-view screenshot capture reports no document overflow, no page exceptions
and zero initial/footer control collisions (`capture-metrics.json`). Codex browser
became disabled in Work settings during final QA; previously authorized local
Playwright supplied final runtime evidence. No claim of an open Codex tab or of
remote CI success. Snapshot verification uses the unchanged tolerance and masks.

No production/backend/database access, commit, push or deployment. Pre-existing
Collection Daily edits were preserved. Full accessibility certification, physical
device virtual keyboards and all remote release checks are outside this bounded
pass. No actionable P0/P1/P2 issue remains in the approved repair.

final result: passed

## Flat Payment Details follow-up — 2026-10-17

User approved removing the persistent Account/Card rule text and inner box so
Payment Details follows Customer Details' spacing. Both identifiers now render
as direct payment-grid children; desktop rows are Account/Card, Batch/Date, and
Amount. Removed the old group surface/padding and both repeated rule paragraphs.
Customer/payment rows share the same gap. Shorter descriptions prevent the
customer heading from wrapping while payment remains one line at1280px; no fixed
heading height was introduced.

Evidence root: `artifacts/save-payment-flat-20261017/`. Source visual truth:
`before-desktop-dark.png`1440x1458 and `before-mobile-dark.png`391x2489, from the
immediately preceding repair. Implementation: `after-desktop-dark.png`1440x1404
and `after-mobile-dark.png`391x2353. Both use matching CSS widths, dark theme,
empty Collector Alpha state and deviceScaleFactor1. Opened combined comparison:
`comparison-desktop.png` and `comparison-mobile-top.png`. Canvas padding is not
product whitespace. Readable focused evidence: `payment-details-preview.png`.
Additional tablet/mobile-light/landscape captures and `capture-metrics.json`
confirm no document overflow, page exceptions or initial/footer control collisions
across five views.

Typography, semantic palette, existing icon/brand assets and44px controls remain
consistent. Copy changes above are intentional. Account/Card retain individual
labels, the masked-card visibility control and error IDs. Tabbing through the
empty pair no longer creates inline errors. Explicit validation still rejects
both empty, associates each error via aria-describedby, and clears both when
either identifier changes. Shared validation and payload rules are unchanged.

Final23 targeted browser cases pass, including1920/1600/1440/1280/1024/768/390
layout, actual first-row y-alignment,320px/mobile landscape, AI scrolling, receipt
actions, card-only matching and empty-pair errors. Focused unit23/23, typecheck,
source lint and production client build pass. The first added browser assertion
counted hidden completeness messages as inline errors; corrected it to inspect
the two actual field-error IDs. No product validation or test tolerance was
weakened. Only the reviewed light/dark form snapshots were regenerated and are
verified again in normal non-update mode.

No commit, push, deployment, backend change or production data access. Prior work
remains intact. This supersedes the earlier boxed Account/Card presentation.

final result: passed

## CI regression: Daily dialog session sizing — 2026-10-17

CI run39037887159 on ea56f624 passed build-and-test and coverage, but failed
the desktop Daily loading shell assertion in Playwright (435/436 cases passed).
Local reproduction confirmed the exact95.625px vertical shift: natural dialog
height shrank when long records were replaced by a shorter loading state.

The desktop dialog now captures its first successfully loaded natural height
once per open session, after the Radix portal attaches. Pagination, date changes,
loading, failure and retry retain that height. Closing resets it so a newly
opened short day remains compact. CSS max-height still caps smaller viewports;
mobile retains its existing fullscreen rules. offsetHeight deliberately ignores
the opening scale animation. No remount, focus, API or data behavior changed.

The original1px stability assertion remains unchanged. Extended browser coverage
checks fresh compact reopening, short-to-long navigation with internal scrolling,
viewport shrink/restore, and focus return to the actual calendar opener. No
snapshot baseline, retry setting, timeout or comparison tolerance was loosened.

Evidence: artifacts/daily-dialog-ci-20261017/. reproduction.log records the
original desktop failure and mobile pass; before-failed-desktop.png preserves
the failure screenshot. report-controls-regression.log records24/24 passing
browser cases, zero retries/skips. unit-correct-runner.log records69/69 passing
state/presentation cases using the repository's CSS-loader wrapper. A direct
standalone .test.tsx invocation first failed because Node cannot load CSS; the
supported wrapper run is the accepted result, not a product failure. Three
sizing contract tests, source ESLint, typecheck, production frontend build and
git diff --check pass. Independent read-only implementation review found no
material issue. Full remote CI has not rerun; local results do not claim that it
has. No commit, push, deployment or production access in this repair.

final result: passed (bounded local regression verification)
