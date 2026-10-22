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

---

# Monthly Comparison — selected visual ledger

Date: 2026-10-18. Product Design image-to-code / design-qa.

## Source, scope and normalization

- User selected the third displayed image in the latest ideation set: `C:/Users/Administrator/.codex/generated_images/01a06af3-0962-71b1-b172-6ca2dba63123/exec-82b611b0-9f51-459b-b2cb-2d9eedd5a750.png`.
- Source pixels: 1487 × 1058; normalized proportionally to the intended 1440 × 1024 desktop viewport. Implementation: 1440 × 1024 CSS/pixels, deviceScaleFactor 1. No browser/device frame in either artifact. Normalization is for QA only; no brand assets were edited.
- Existing application, roles, API contracts, nickname scope, month drill-down, targets, CSV and print are preserved. The real shell stays 240px/57px, rather than changing the shared shell to the mock's proportions. Only Monthly Comparison content is redesigned.
- State: dark mode, DEMO.COLLECTOR, April–September 2026, synthetic complete-month totals 32,400 / 36,000 / 33,600 / 42,000 / 45,000 / 48,600; records 54 / 60 / 56 / 70 / 75 / 81; configured targets RM50,000. No production/backend/database/credentials accessed.
- Browser evidence: Codex in-app browser local synthetic preview, plus authorized local Playwright/Chromium responsive and interaction checks.
- Full comparison evidence: `artifacts/monthly-ledger-preview/comparison-iteration-1-dark-1440.png` (opened). Focused ledger comparison: `artifacts/monthly-ledger-preview/focus-iteration-1-dark-1440.png` (opened). Both contain source and implementation together, not independent screenshots presented as a comparison.

## Iteration one findings

- [P2] Ledger row density pushes range total and both secondary disclosures below the 1024px target viewport. Evidence: first implementation ends at September, while the source includes the footer and secondary rows. Fix: reduce desktop-only row padding and month-button minimum to 36px, preserving 44px mobile targets; compact toolbar footer and report gaps.
- [P2] Bars render as 8px pills instead of the selected substantial 20px bars. Existing generic progress rules win in the CSS cascade. Fix: scope the ledger progress selector more specifically, preserving the same native data-driven progress elements and blue token.
- [P2] Native printing initially omitted charts because closed disclosure children were conditionally unmounted. Fix: retain mounted content under native closed details, allowing the existing print CSS to expose it. Dedicated sanitized Print report output remains unchanged.
- [P2] Month dialog did not restore keyboard focus after Escape. Confirmed for admin and user in regression tests. Fix: capture the invoking element in the monthly dialog hook; restore it on close autofocus only while it remains connected. Both focus regression tests passed after the fix.

## Fidelity surfaces / intentional product constraints

- Typography: existing SQR font stack, 24px title, 14px ledger text, 12px metadata; tabular numeric alignment. English labels remain consistent with the application rather than copying mixed-language mock text verbatim.
- Spacing/layout: one compact toolbar, one first-to-last comparison band, one chronological ledger. Secondary analysis remains closed by default. Desktop density/bar findings are resolved in iteration two below. The small target/export-scope footer is intentionally retained for data provenance; it adds height versus the generated mock. The main six-month report and range total fit the 1024px desktop viewport; secondary disclosure content uses ordinary page scrolling. No persistent control is clipped or covered.
- Colors/tokens: existing light/dark background, card, primary, border, foreground, success and destructive tokens. Positive/negative changes retain explicit signs; target configuration is a neutral reference, not failure red.
- Image/assets: original transparent Q+dots PNG and existing icon library; no logo redraw, box, rasterized UI or handcrafted icon substitutions. Bars are native semantic data visualization, not decorative image approximations.
- Copy/content: headline compares FIRST versus LAST applied month; row percentages compare preceding month in the range. Zero baseline is N/A, not invented growth. Shared amount scale never implies month-specific target achievement. Misleading aggregate bar from the generated mock is intentionally omitted; exact range amount and record totals remain.

## Iteration two / final verification

- Revised full-view comparison `artifacts/monthly-ledger-preview/comparison-implementation-dark-1440.png` and focused comparison `artifacts/monthly-ledger-preview/focus-implementation-dark-1440.png` were opened and inspected together with the same source/state. Row rhythm now follows the selected compact ledger, native bars are 20px, values align, and the total is visible without a misleading aggregate bar. Earlier visual P2 findings are resolved; no new actionable P0/P1/P2 visual mismatch remains within the preserved-shell scope.
- Final implementation screenshots: `artifacts/monthly-ledger-preview/implementation-{dark,light}-{1440,390}.png`. Desktop is 1440 × 1024; phone is 390 × 844 CSS with full-page capture at deviceScaleFactor 1. Light/dark screenshots were opened; both themes remain legible, month labels wrap safely on phones, and the decorative bar column is omitted on phones without removing amounts, records or changes.
- Final automated responsive/a11y check: all four theme/width combinations have zero page errors, zero axe violations in the Monthly panel, and no document overflow. `capture.mjs` runs against a loopback-only synthetic frontend, not an application backend.
- Final `npm run build`, TypeScript and source ESLint: passed. Unit/SSR/contract tests: **52/52 passed**, including real component rendering with a CSS-only Node loader; no product code is stubbed. Evidence: `artifacts/monthly-ledger-preview/{build,typecheck,lint,unit}.log`.
- Updated only the four intentional Monthly visual baselines, then reran without update mode: **17/17 Playwright tests passed**, zero retries/skips. Coverage includes responsive themes, stable snapshots, native quick ranges, loaded/unapplied export scope, loading explanations, first/last versus row movement, same-day chart references, untouched closed disclosures under native print, admin/user keyboard drill-down and focus restoration. Evidence: `artifacts/monthly-ledger-preview/playwright-final.log`.
- Codex browser final preview remains open on the real built Monthly Comparison frontend with synthetic data. `git diff --check` passes. Existing unrelated Save Collection work remains preserved. No commit, push, deployment or remote CI run was performed by this task.

## Follow-up polish / residual gaps

- P3: the original English labels and existing shared shell are intentionally retained rather than replacing navigation or theme tokens globally. The generated mock's percent labels inside bars are omitted because different configured targets would make their meaning ambiguous; exact MoM percentages remain in their own column.
- Automated a11y is not a substitute for a manual screen-reader review; none is claimed. Full backend/remote CI suites were not rerun because this task changes presentation and scoped dialog focus only.

Implementation checklist: compact controls, first/last summary, unified ledger, targets/permissions/drill-down preserved, mobile/theme QA, print/focus fixes, snapshots and local tests — complete.

final result: passed

---

# Monthly Comparison — follow-up polish

Date: 2026-10-18. User requested further polish of the already selected third visual, not another design direction. Shared shell, APIs, roles and workflows remain unchanged.

## Evidence and review

- Visual truth remains the selected third ImageGen frame listed above. Latest source/implementation comparisons: `artifacts/monthly-ledger-preview/comparison-implementation-dark-1440.png` and `focus-implementation-dark-1440.png`, both opened at full and readable focused scale.
- Same-state before/after evidence: `artifacts/monthly-ledger-preview/polish-comparison-{1440,390}.png`. The 390px comparison was opened: original full-page 390 × 1596 versus revised 390 × 1493, no scaling or squeezing of content. Desktop captures are 1440 × 1024 CSS/pixels at DPR1, normalized source 1487 × 1058 → 1440 × 1024. Mobile is 390 × 844 CSS at DPR1 with full-page capture.
- Prior screenshots are preserved as `before-polish-{dark,light}-1440.png` and `before-polish-dark-390.png`. Current implementation screenshots retain `implementation-{dark,light}-{1440,390}.png` names for the latest revision.

## Findings and fixes

- Mobile filters previously placed nickname and quick range on separate full-width rows, making the report unnecessarily tall. Now native DOM/Tab order is nickname → quick range → start → end → Apply → Reset, paired into three rows on mobile without CSS-only visual reordering. Touch targets remain at least 44px. Desktop retains a single compact toolbar.
- Target amount repeated in the toolbar and performance header. The toolbar now has a short native Target details disclosure with full amount in its accessible name; configured target amount remains visible once in the ledger. Expanded details and export scope span the grid safely, including 320px.
- Headline previously gave range, values and change similar weight. Three aligned groups now distinguish range, first→last values and overall change; change has stronger type, not another card. Mobile uses a full-width range with two aligned amount/change groups.
- Desktop bars previously lacked visible scale endpoints; 0 and the shared maximum are now aligned above them. Exact amounts remain alongside. The long explanation is reduced visually, retaining precise screen-reader description. No target-attainment percentage is invented.
- Mobile previously removed the bar completely. A 4px native amount bar is now retained within each amount cell, using the exact same common scale as desktop. It is aria-hidden to avoid duplicate announcements; actual values/records/MoM remain semantic table content. No aggregate bar is added.

## Five fidelity surfaces

- Typography: existing SQR font stack and 14px desktop ledger retained; 12px mobile table and metadata, readable figure grouping and 18px desktop change. No font downloads or substitutions.
- Spacing/layout: filter footprint reduced, paired mobile fields, consistent action heights per breakpoint, clearer summary alignment, exact value columns and responsive scale. No document overflow in 320/390/768/1024px responsive tests.
- Colors/tokens: same existing light/dark semantic tokens and neutral target treatment. Positive/negative deltas include signs; color is not the only cue. Reduced-motion behavior remains inherited from the native progress styles.
- Images/assets: original Q+dots and existing icon library untouched. No new raster artwork, logo redraw or decorative effects.
- Copy/content: first→last range change remains distinct from row MoM; zero baseline remains N/A; loaded export scope and unapplied-filter warning remain visible. No sample amounts are added to production code.

## Validation and acceptance

- Independent screenshot/source QA accepted the polish with no P0/P1/P2 blocker. P3: a long mobile nickname truncates inside its trigger, while the full applied nickname remains in visible export scope and accessible labels; this is intentional rather than shrinking the text.
- Production build passed. Unit/SSR/contract tests 54/54 passed. Final Playwright 21/21 passed without update mode, retries or skips, including open target details, keyboard order, responsive bars, export loading/scope, print and focus restoration. Evidence: `artifacts/monthly-ledger-preview/{build-polish,unit-polish,playwright-polish-final}.log`.
- Final TypeScript and source ESLint passed (`typecheck-polish.log`, `lint-polish.log`); `git diff --check` passed. Refreshed synthetic capture at dark/light × 1440/390px returned zero page errors, zero axe violations within the Monthly panel, and no document overflow in every combination. Measured filter height: 124px desktop, 293px phone. The actual Codex browser was reloaded and the April–September report applied and visually checked; its preview remains open.
- No remaining actionable P0/P1/P2 finding. Original brand assets, shared navigation and existing unrelated Save Collection work remain untouched by this polish. No production access, commit, push, deployment or remote CI result is claimed.

final result: passed

---

# Monthly Comparison — responsive layout hardening

Date: 2026-10-18. Follow-up Product Design audit, scoped implementation and design QA. The user requested further polish of layout, width, height, CSS and padding; this is not a new design direction.

## Scope, source and fresh evidence

- Source visual truth: `C:/Users/Administrator/.codex/generated_images/01a06af3-0962-71b1-b172-6ca2dba63123/exec-82b611b0-9f51-459b-b2cb-2d9eedd5a750.png`, the already selected third option. Source 1487 × 1058 normalized to 1440 × 1024 for comparison. Actual desktop captures are 1440 × 1024 CSS/pixels, DPR1. No browser/device frame is included. The original shared shell and role-dependent navigation remain intentional constraints.
- Fresh current-run before captures: `artifacts/monthly-ledger-hardening/before-{320,768,1024,1200,1366,1440}-{default,expanded}.png`; invalid-input capture `before-1366-invalid.png`. Codex in-app browser was also opened, the April–September range applied, and the actual rendered screen inspected before changes.
- Same-state visual review: `comparison-before.png`, `comparison-after.png` and focused `focus-after.png` in that folder were opened. Source and implementation are together in each comparison input. State: dark, synthetic DEMO.COLLECTOR, April–September 2026, six totals RM32,400 / 36,000 / 33,600 / 42,000 / 45,000 / 48,600, target RM50,000; no backend or production data.
- Final same-state screenshots: `after-1440-default.png`, `implementation-{dark,light}-{1440,390}.png`. Phone CSS viewport 390 × 844, DPR1, full-page capture. Both themes were opened and inspected; the Codex browser preview remains open.

## Audit findings, iterations and fixes

- [P2, resolved] Invalid month guidance raised only its input by 42px and pushed neighboring controls downward. Evidence: `invalid-before-detail.png` versus `invalid-after-detail.png`, opened at native pixel scale. Fix: top-aligned grid, consistent label line-height, and matching action offset. Validation remains visible below the field, with the original blur/Enter recovery and loaded-report scope preserved.
- [P2, resolved] Nested viewport-based four/five-column metric grids clipped exact large RM values when analysis was expanded at 1024/1200/1280px. The initial stress run failed three expanded-analysis cases. Fix: intrinsic available-width grids for pace, monthly trend, benchmarks, projections and day-detail cards; zero minimum sizes and wrapping amount/detail lines. The first correction exposed three remaining benchmark/projection values at 1280px; these grids were then corrected too. Final stress cases pass with a long unbroken nickname and RM3b/RM1.875b totals; no truncation or decimal loss was introduced.
- [P2, resolved] Global dark `th` background made body month cells look like a separate gray column, inconsistent with selected/hover rows. Confirmed in fresh browser screenshots. Fix: a narrowly scoped transparent body-month-header reset that wins the existing important theme rule. Header/footer theme styles remain unchanged.
- [P2, resolved] A large monthly tooltip could extend outside its chart after a phone fullscreen popup closed (document width 402px at a 390px viewport). Fix: bounded, wrapping tooltip content and a stable origin within its own chart. No `overflow:hidden` workaround, removed information or relaxed assertion was used.
- [P2, resolved] Fullscreen chart dialogs had no registered trigger, and fullscreen-chart → selected-month-records could retain a disconnected focus target. Fix: standard DialogTrigger for ordinary Escape return; pass the stable fullscreen trigger to the existing records-dialog hook during drill-down. Phone popup tests and the desktop October-bar → October-records → Escape test now pass with focus restored.
- [P3, completed] Toolbar previously used three rows at intermediate widths and abruptly one row at 1200px. It now uses two/four/six tracks based on its own available width, not the viewport/sidebar breakpoint. At 768/1024px filter height is 211px rather than 261px; at 1199px it is 123px rather than 261px. Phone controls stay 44px and desktop controls 36px. No visual-only reordering of Tab sequence was introduced.

## Five required fidelity surfaces

- Fonts/typography: existing SQR font stack, title hierarchy, tabular numeric columns, 14px desktop/12px phone ledger remain. Large amounts wrap in analysis cards; the exact ledger amounts remain available in a deliberately bounded scroll region. Headline first→last change and row MoM retain separate meaning.
- Spacing/layout: compact selected ledger retained; consistent label/input/action alignment; intrinsic card tracks grow vertically rather than leaking horizontally. Full-view and readable ledger/detail comparisons show the resolved cell-background and validation alignment issues. Page max width, shared shell, mobile navigation and existing Save Collection work are unchanged.
- Colors/tokens: existing light/dark primary, foreground, muted, success, destructive and border tokens; no new palette. Positive/negative signs and explicit values supplement color. Target remains a neutral reference. Body month headers now inherit the same row surface as adjacent cells.
- Images/assets: original transparent Q+dots and existing icon library are unchanged. No generated replacement logo, boxed icon, handcrafted illustration or rasterized UI was added.
- Copy/content: no business text or formula was rewritten for this hardening. Target provenance, applied-versus-draft export scope, range totals, records, zero-base N/A, same-day analysis and existing print/export workflows remain. Fixed tooltips contain the same information; they no longer chase a pointer beyond the report bounds.

## Final verification and limits

- Production build and sourcemap gate pass (`build.log`, zero production maps). TypeScript and changed-source ESLint pass (`typecheck.log`, `lint.log`, zero lint warnings). Unit/SSR/contracts: 54/54 passed (`unit.log`).
- Final Playwright run without snapshot updates: **28/28 passed**, no retries or skips (`playwright-final.log`). Seven added stress/workflow cases cover long nickname, large exact amounts, expanded analyses, invalid-month alignment, 200% root text at a real 720px reflow viewport, both phone fullscreen dialogs, and fullscreen-to-record drill-down. This is text enlargement/reflow testing, not a claim of OS/browser zoom or screen-reader certification.
- Four intentional Monthly baselines were refreshed. One initial rerun exposed hover-dependent screenshot noise; the visual fixture now parks the pointer outside content before capture. Snapshot tolerance was not loosened, no region masked, and the subsequent full run passed without update mode.
- Fresh default and expanded sweep at 320, 767, 768, 1023, 1024, 1199, 1200, 1280, 1366, 1440 and 1920px reports no document/panel overflow, uncontained elements or page errors (`sweep-after.log`). Invalid-input state was checked separately at 1366px. Narrow tables retain their explicit horizontal-scroll affordance rather than hiding data.
- Fresh light/dark × 1440/390 captures have zero page errors, zero axe violations within the Monthly panel and no document overflow (`capture-final.log`). Codex in-app browser separately verified both themes on the real built frontend with synthetic data.
- Independent read-only source review plus runtime checks found no remaining actionable P0/P1/P2 issue in this bounded scope. Full remote CI, manual screen-reader review and cross-engine browser coverage were not run; no blanket absence-of-all-bugs or full WCAG certification is claimed.
- Local synthetic preview only: no credentials, database, production records, receipts, server access, commit, push or deployment. Existing unrelated work was preserved.

Implementation checklist: fresh audit evidence, available-width grid, validation alignment, exact amount wrapping, dark row surfaces, tooltip containment, popup/drill-down focus, themes, breakpoints, snapshots, unit checks and QA comparison — complete.

final result: passed

---

# Reset and activation — Guided Workspace v3 implementation

Date: 2026-10-19 (Asia/Singapore). Product Design implementation of the selected second concept, polished twice before approval. Scope includes reset/activation emails and the browser password-creation pages. Login, forgot-password, 2FA, backend authentication operations and production data are not redesigned.

## Source, preview and comparison evidence

- Source visual truth: `C:/Users/Administrator/.codex/generated_images/01a06af3-0962-71b1-b172-6ca2dba63123/exec-30621f90-dcf3-4767-9425-f152cd0b75c0.png` (1448 × 1086). It contains two email artboards and two dark browser workspaces. This is an approved direction, not a source of production brand assets.
- Actual built client preview: `http://127.0.0.1:5188/reset-password?token=preview-valid` and `/activate-account?token=preview-valid`. Pure email builders are rendered at `/preview/emails/reset`, `/preview/emails/activation` and `/preview/emails/resent`. All accounts, tokens, API responses and dates in the preview are synthetic; the preview does not bootstrap the application backend, connect a database or deliver mail.
- Evidence folder: `artifacts/auth-template-design-20261019/`. The source and actual implementation were opened together in `comparison-web-reset.png` and `comparison-email-reset.png`; `implemented-preview.png` contains actual reset/activation email cards plus dark/light browser workspaces. `focus-form.png` was opened at native pixel scale to inspect readable labels, policy icons, password toggles, borders and CTA alignment. Mobile captures were also opened, including `artifacts/password-public-build-browser/reset-320-light-neutral.png` and the long-token email capture `email-browser-qa/reset-320-long.png`.
- Normalization: screenshots are DPR1 at a 1440 × 1000 CSS viewport. Actual browser workspace is 1040 × 796px, with all four reset/activation × theme captures matching that footprint. Source browser crop is 694 × 455px at x22/y607. Actual workspace was resized to the same 694px width with aspect ratio preserved; source canvas/browser chrome was excluded. Email source crop is 695 × 493px at x22/y74; actual 600px-wide email card was normalized to 695px width. Native focused captures remain available; density differences are not treated as font defects. Exact metadata dimensions are in `design-evidence.json`.
- State: ready, BM, empty/masked fields, neutral requirements; light and dark browser themes. Source demo account/date and implementation synthetic account/date differ intentionally. Email remains English to preserve the existing API/default communication language; browser BM/EN remains interactive. The real product password policy, role, live requirement count and confirmation feedback deliberately add content beyond the abbreviated mockup.
- Codex in-app browser separately opened the actual built reset page in dark/light, activation in light, and the final reset email; no console errors were recorded. Browser viewport override was reset afterward and user-facing preview tabs were retained. Standard-DPR Chromium captures are used for comparison because the user's in-app browser has a pre-existing zoom/density setting.

## Findings, fixes and post-fix evidence

- [P2, resolved] First implementation used the legacy glowing boxed Q asset. Fresh browser inspection and the local asset preview confirmed the mismatch against the approved transparent Q-and-dots direction. Added a registry entry for the existing, original `sidebar-q-static.png`, then used that raster directly only in the new recovery shell and email header. Global `BrandLogo`, existing icon paths and favicons were not changed. Final comparisons show no box; the email browser test verifies real transparent pixels and a transparent corner, not merely a CSS background.
- [P2, resolved] Initial desktop workspace was about 893px tall with a long introductory paragraph and excessive neutral feedback reservations. Shortened only the two recovery-page introductions, reduced desktop policy/confirmation reservations to 20px, and tightened control/help spacing. Mobile retains room for two-line feedback. Actual final workspace is 796px tall. `comparison-web-reset.png`, `focus-form.png` and all four workspace captures are post-fix evidence; the source's two-column hierarchy remains while all five authoritative policy checks and error guidance are retained.
- [P2, resolved] New 759px/359px media queries violated the repository's responsive contract. The script gate caught this before handoff. Replaced them with the existing 767px tier and consistent mobile padding; no breakpoint allowlist or assertion was relaxed. The full script-contract phase now passes, and final 320–1440px public-browser cases were rebuilt and rerun afterward.
- Test harness integration: the shared Auth V17 language helper assumed every public page used `main.auth-v17`. Its recovery invocation now also accepts the distinct `main.credential-recovery`, still requiring one main and the exact requested `lang`. Login-specific legacy-shell assertions remain unchanged. No snapshot tolerance, hidden region, retry rule or safety guard was loosened.
- No remaining actionable P0/P1/P2 finding in the final full-view, focused and mobile comparisons. Independent read-only code/security review and independent final visual review found no blocker. This is not a blanket guarantee that all browsers or email clients are bug-free.

## Required fidelity surfaces

- Fonts/typography: system-ui/Segoe UI/Arial stack without a remote font dependency, 24–28px primary heading, readable 13–16px controls/helpers, and logical heading order. Email uses Segoe UI/Arial fallback and live text. Source branding is represented by the original transparent Q plus readable system-name text, not the image generator's approximation of a wordmark. Focused native captures show no label/toggle collision; mobile fields use 16px text.
- Spacing/layout rhythm: bounded 1040px workspace, 30/70 context/form tracks and a 440px readable form. Below 768px it becomes a natural one-column document. Context metadata stays outside the form and wraps without ellipsis. Equal 48px input/primary-action heights, 44px preference/toggle targets and stable feedback regions are preserved. The intentionally taller real-policy/validation content is not squeezed to the mockup's abbreviated height.
- Colors/tokens: scoped navy dark surfaces, restrained neutral light surfaces, blue primary action, cyan/blue links and explicit success/error state text/icons. Neutral requirements are not shown as errors before interaction. Global authenticated-app theme rules and unrelated public shells are untouched. The final public route matrix reports no axe violations in its tested states; this is not full WCAG certification.
- Images/assets: existing original transparent Q PNG, correct aspect ratio, no redraw, filter/recolor or substitute CSS/SVG artwork. Email logo is a same-origin public URL without a token, username or query. If the action URL is invalid, both action and logo are omitted. Email remains understandable if images are blocked because the system name and all instructions are live text.
- Copy/content: concise recovery introductions, complete authoritative 14–256-character policy, separate confirmation and strength feedback, one-time/latest-link guidance, accurate admin resend instructions, and MYT expiry. Existing email subjects and plaintext UTC expiry remain. Token-bearing fallback URL is complete, escaped and wrapping rather than truncated. Reset and activation keep their existing validation/mutation controllers and API contracts.

## Verification, test limits and handoff

- Final production build: passed, including status artifacts, CSP hashes, server bundle and zero production sourcemaps (`build-release-final.log`). TypeScript and changed-source ESLint passed (`typecheck-final.log`, `lint-final.log`). `git diff --check` passed; Git emitted only normal CRLF conversion advisories.
- Final full client suite: 960/960 passed (`client-tests-final.log`). Latest targeted email/recovery/policy tests passed; email URL/XSS regression checks include non-browser schemes, embedded credentials, escaping and full fallback values.
- Script tests: JavaScript contract phase 676 passed, one existing platform-dependent skip, zero failures (`scripts-rerun.log`). TypeScript phase initially rejected the host-injected unsupported `LOG_FORMAT` environment key before running seven test files. Rerunning that phase with only this unrelated key removed from the child environment passed 63/63 (`scripts-ts-isolated.log`). No `.env` was edited or printed and no production runtime schema was relaxed to hide the issue.
- Actual-built public browser matrix: final 32/32 passed (`public-browser-verified.log`, `artifacts/password-public-build-browser/summary.json`), reset/activation × eight widths (320/360/390/430/768/1024/1280/1440) × light/dark. Covers emitted CSS, focus/keyboard visibility, independent password toggles, neutral and five-rule states, stable checklist footprint, mismatch/policy gating, pending duplicate-submit protection, success cleanup, no overflow and axe checks. Zero page errors or unexpected requests. An earlier heavily concurrent run hit the unchanged 240-second runner deadline after 31 cases; the final run passed without changing that deadline.
- Auth V17 built lifecycle: 38 checks passed (`auth-v17-final.log`), including unchanged login/MFA, reset language retention, invalid/missing token and strict script/style CSP plus Trusted Types. Boundary is a real built frontend with synthetic HTTP contracts, not live PostgreSQL authentication E2E.
- Email HTML preview: 36/36 passed (`email-browser-qa/summary.json`), reset/activation/resent × 320/390/768/1440 × normal/long/invalid. Checks complete username/fallback URL, one CTA, no overflow, transparency, same-origin logo, full policy/MYT and resend guidance. Zero page errors, external requests or backend requests. Gmail, Outlook and mobile mail-client delivery/rendering have not been tested; no real email was sent.
- Additional recovery QA: 16/16 passed (`recovery-additional-qa/summary.json`, `recovery-additional-qa-rerun.log`), long username on desktop/mobile in both themes, BM/EN and theme changes preserve both inputs and independent mask state, offline/online preserves fields, invalid/missing tokens expose neither form nor metadata. Zero mutations, unexpected requests or runtime errors. Expected HTTP400 console entries from deliberate invalid-token cases are recorded separately, not hidden.
- Figma: a file was created at `https://www.figma.com/design/1dObFAGpMsMyavaNyLc1fq`, but its canvas is still empty because the account reached the Starter MCP quota. No editable-design completion is claimed. The user explicitly approved finishing code/local QA and deferring Figma. Connection details are retained in ignored `figma-state.json`; no billing or plan change was attempted.
- Production, database, secrets, accounts and email delivery were not accessed for this implementation. No commit, push or deployment was performed. The synthetic loopback preview remains available; remote CI and live mail-client certification are follow-up verification, not claimed results.

Implementation checklist: approved direction, isolated shell, original transparent Q, table-based email, complete policy/fallback, responsive spacing, keyboard/ARIA, themes/locales, invalid/offline/success states, local build/tests, visual comparison and independent review — complete. Editable Figma artifact is explicitly deferred by user approval.

final result: passed

---

# Recovery password requirements — annotation alignment correction

Date: 2026-10-19. Scoped Product Design follow-up to the user's browser annotation on `section#reset-password-strength > ul` at a 722 × 1391px CSS viewport. No surrounding layout, copy, brand asset, token flow, password policy or production data was redesigned.

## Evidence and resolved finding

- [P2, resolved] Requirement items after the first inherited an 8px top margin from the shared `space-y-2` utility. Its emitted child selector has higher specificity than the recovery `li { margin: 0 }` rule. A vertical-list utility was therefore offsetting items inside the compact flex row. Fresh Codex browser inspection confirmed first item top 605.3055px versus 613.3046px for the next three, matching the user's screenshot.
- Fix: omit `space-y-2` only when `density="compact"`; existing flex gap now owns all compact spacing. Comfortable/default lists retain their original vertical spacing. No `!important`, clipped text, removed rule, font-size change or test tolerance relaxation was used.
- Source visual evidence: the user-supplied annotated screenshot and freshly captured `artifacts/auth-requirements-alignment/before-iab.png`. Same-state implementation evidence: `after-iab.png`. Both Codex captures use CSS viewport 722 × 1391px and the same pre-existing browser density/zoom (reported DPR 1.34). Saved screenshot files are 722 × 1391px. Theme light, locale BM, synthetic demo.user, valid link, empty masked fields.
- Full-view source and implementation were viewed together. `before-after-comparison.png` also places the before Codex capture beside a native-DPR1, 722 × 1391px after capture, normalized to equal displayed width with aspect ratio preserved. The antialiasing difference from browser density is expected, not font drift. Readable focused evidence: `after-reset-requirements-focus.png` and `after-activation-requirements-focus.png` (440px-wide native component screenshots).
- Post-fix Codex measurement: first four item tops all 605.3055px; wrapped symbol top 631.2966px. All five computed top/bottom margins are zero. Icons and text now align within each row; wrapping remains natural when five items do not fit.

## Fidelity and regression verification

- Typography, colors/tokens, original transparent Q, icons, app-specific copy, accessible hidden labels and five authoritative requirements are unchanged. Only the conflicting spacing utility differs. The full-view comparison shows the expected compact height reduction without moving content out of reading order or introducing clipping.
- Focused geometry matrix: 96/96 passed (`artifacts/auth-requirements-alignment/summary.json`): reset/activation × 320/390/722/1440px × BM/EN × light/dark × neutral/weak/valid. Checks all five zero physical/logical margins, matching first-row item/text/icon tops, 16px icons, consistent 6px wrapped-row gap, complete rule order/states and no list/document overflow. Zero page errors or unexpected requests; no mutation or real account data.
- Persistent SSR regression confirms compact lists omit `space-y-2` while comfortable lists retain it. Six recovery-layout/policy tests passed (`unit.log`). Persistent actual-built browser checklist checks now assert zero item margins, first-row alignment and 6px gap; all 32 public route/width/theme lifecycle cases passed (`browser-regression.log`) without retries, skips or relaxed assertions.
- Client production build, TypeScript, scoped ESLint and `git diff --check` passed. The local synthetic preview was refreshed and visually inspected in the Codex browser. No new backend or email changes were needed for this correction; no commit, push or deployment was performed.
- No remaining actionable P0/P1/P2 finding in the annotated surface. Remote CI and manual screen-reader certification are not claimed.

Implementation checklist: reproduce annotation, confirm CSS cause, remove compact-only conflicting utility, retain default spacing, add SSR/rendered geometry regression, compare same-state captures and verify both flows/locales/themes — complete.

final result: passed

---

# Recovery workspace — account/form alignment refinement

Date: 2026-10-19. Scoped Product Design response to the user's observation that “Akses akaun SQR” and “Cipta Kata Laluan” did not feel aligned or unified. Existing approved direction, colors, content, brand, navigation and authentication behavior are preserved.

## Fresh evidence, findings and fixes

- Before captures: `artifacts/auth-shell-alignment/before-reset-722-ms-light.png` and `before-reset-1440-ms-light.png`, plus corresponding activation captures. Captured from the actual built frontend on the synthetic loopback preview before this correction; no old screenshot was used as the audit baseline.
- [P2, resolved] At 722px the account context used a 480px content width (left x121), whereas the form and controls used 440px (left x141). Fix: use the same 440px content reference in the stacked context padding. Existing 16px phone gutters remain. The account heading, metadata, logo and form now share the same left/right content rails.
- [P2, resolved] Desktop account heading began 16px below the form heading because the two panels had different header/spacing offsets. Fix: reduce only desktop context top padding from 36px to 20px, preserving its inline/bottom padding and mobile override. The existing 42px brand plus 24px gap now aligns with the main 50px control row plus 16px gap. No DOM reordering, fixed-position heading or new duplicated header was added.
- [P2, resolved] Desktop back/home and language/theme controls spanned a wider track than the form, so their edges did not follow the title and fields. Fix: center their existing row on the same bounded 440px track as the form. Control targets, focus styles and document order remain unchanged.
- After captures: `after-reset-722-ms-light.png`, `after-reset-1440-ms-light.png` and matching activation files. `comparison-722.png` and `comparison-1440.png` place fresh before/after captures together and were opened for review. `after-desktop-workspace.png` is a focused native-pixel workspace view, excluding empty page stage. Independent visual review found no remaining actionable P0/P1/P2 in this bounded correction.
- Viewports: 722 × 1391 and 1440 × 1391 CSS px, DPR1; source and implementation captures have identical pixel dimensions and state. Comparison crops preserve native density/aspect: 510 × 1130px for the stacked content region, 1040 × 781px for desktop workspace. Light theme, BM, synthetic demo.user and valid preview token. Other locales/themes and tablet boundaries are measured in the matrix below.

## Fidelity surfaces and verification

- Typography: existing heading hierarchy, font stack, sizes, line-height and all labels unchanged. The top coordinates align on desktop while the smaller contextual heading remains visually secondary. Phone/tablet text wraps naturally.
- Spacing/layout: only three scoped CSS rules changed: context top padding, toolbar width/margins and stacked context content width. Context and form still stack below 768px and retain the existing two-column desktop hierarchy. No new media-query tier, hidden overflow, forced content height or clipping was introduced.
- Colors/tokens and assets: unchanged light/dark palette, borders, original transparent Q and existing icons. No redrawn logo or generated replacement image.
- Copy/content and behavior: account metadata, five live password requirements, confirmation, visibility controls, admin guidance, token validation and submit lifecycle unchanged. No backend, email builder, database or real account operation was needed for this correction.
- Focused geometry matrix passed 56/56: reset/activation × 320/390/722/767/768/1024/1440px × BM/EN × light/dark (`after-summary.json`, `geometry.log`). Verifies stacked context/form left and right rails, desktop heading top alignment, toolbar/form left/right alignment and no document overflow. Zero page errors or unexpected requests.
- Seven recovery-layout/policy tests passed (`unit.log`), including a new alignment contract. Persistent public-built browser checks now assert shared content rails and desktop heading alignment. Its full 32 route/viewport/theme lifecycle cases passed (`browser-regression.log`), retaining the earlier checklist-alignment, accessibility, policy and submission assertions without relaxed tolerances.
- Client production build, TypeScript and scoped ESLint passed (`build.log`, `typecheck.log`, `lint.log`); `git diff --check` passed with normal CRLF advisories. Remote CI and screen-reader certification are not claimed.
- Codex in-app browser was unavailable because local browser control was disabled in Work settings. Fresh visual capture and QA used the previously user-authorized local Chromium/Playwright workflow against synthetic data only; no setting was changed to bypass that restriction. Preview remains served at `http://127.0.0.1:5188/reset-password?token=preview-valid`, but no claim is made that a Codex preview panel was reopened.

Implementation checklist: fresh before evidence, shared stacked rails, desktop heading offset, form-aligned control row, preserved content/workflow, unit and rendered geometry regressions, responsive/theme/locale matrix and post-fix comparison — complete. No commit, push or deployment performed.

final result: passed

---

# CI follow-up — wrapping strength labels and authentic theme coverage

Date: 2026-10-19. CI run `39187167459` on `9e49a026db03ed7959509f70be00b930d5bc7d6b` failed job `smoke-ui`, step 21, “Verify password and authenticator browser feedback”; build-and-test and coverage-gate passed. Public GitHub job metadata confirmed the failing step. Raw job-log download returned HTTP403, so diagnosis uses the exact local CI command, not a claim to have read the restricted log.

## Confirmed regression and fix

- Local `npm run test:auth:browser` reproduced an assertion failure before the first PASS marker (`artifacts/auth-feedback-ci-repro.log`). The existing runner deliberately forces a wrapping monospace fallback-font strength label at 360px; the prior compact recovery CSS had reduced the row reserve from 40px to 22px. This was a real layout-stability regression, not a reason to remove or relax the assertion.
- Controlled synthetic before/after probe: `artifacts/auth-feedback-ci-height-probe.json`. The old reservation produced a 19px checklist height spread in both reset and activation; restoring the two-line 40px reserve reduced that spread to within the existing 1px tolerance. No password or OTP was submitted by the probe. The source CSS now reserves the original two-line footprint, and a persistent recovery-layout test protects it.
- The isolated fixture previously toggled the root dark class without seeding the presentation preference consumed by the new `useTheme()` shell. It now sanitizes its theme query to light/dark and seeds only that disposable fixture's theme preference before React mounts. Every runner navigation explicitly checks the requested root theme with a bounded assertion, preventing a dark case from silently running light. Production theme storage behavior is unchanged.
- Added credential-safe phase labels and numeric-only geometry diagnostics for future layout failures. Raw assertion details remain suppressed; masking, policy, confirmation, mutation guards, OTP rejection/replay, stale setup response handling and accessibility assertions are retained. No retry, tolerance, timeout or contrast rule was weakened.

## Verification evidence and limits

- Recovery component/policy tests: 8/8 passed (`auth-feedback-ci-unit.log`). Auth fixture/capture/focus contracts: 9/9 passed (`auth-feedback-ci-contracts-final.log`). Scoped configured-source ESLint and whitespace checks passed. The JSX fixture is compiled and exercised by its real-browser runner rather than an unsupported ESLint configuration.
- First broad local rerun passed both forced-wrap regressions, password workflows, OTP and guided 2FA, then its Vite fixture became blank during a concurrent host-native out-of-memory event. The simultaneous build also failed native allocation. This is recorded as an environmental interruption, not counted as a passing run or hidden by retries. Subsequent verification is run serially.
- Serial production build passed (`auth-feedback-ci-build-serial.log`), including status assets, CSP hashes and zero production sourcemaps. The exact full CI command `npm run test:auth:browser` passed serially with exit0 and the final “PASS all isolated UI contracts” marker (`auth-feedback-ci-verified.log`). This includes forced-wrap stability, all password visibility/confirmation workflows, policy/backend-rejection feedback, invalid/expired/used links, OTP rejection/replay and restart autofocus, guided 2FA and stale-response cleanup, six-width public light/dark accessibility/contrast, and expanded forgot/change/OTP/2FA state captures at 390/1280px in both themes. No assertion was skipped or weakened.
- Independent read-only review found no security/lifecycle assertion weakened. Local synthetic fixtures only: no production, database, real account, mail delivery, credentials or environment-file changes. No commit, push, remote workflow rerun or deployment performed for this follow-up.

Acceptance complete for the locally reproduced failing gate. Remote GitHub CI has not yet run this uncommitted patch; no remote-green or live backend E2E claim is made.

final result: passed

---

# SQR Single Active Tab — supplied package integration QA

Date: 2026-10-20 (Asia/Singapore). Target: user-supplied
`SQR_Single_Active_Tab_FINAL.zip`, preserving its selected white/corporate-blue,
gray and soft-gold blocked-page design and BM copy. No new design direction was
invented. This QA result covers the frontend feature, not a production release.

## Source and comparison evidence

- Inspected the complete package and its implementation/test instructions before
  integration. Rendered the original React/CSS in an isolated reference server,
  supplying the existing project transparent Q asset through `logoSrc`.
- Primary visual review used the Codex browser, not production. Captured source
  and actual built implementation in the same browser viewport/state; both full
  captures are 3207×2227 pixels. The common-crop side-by-side comparison was
  opened and inspected: `artifacts/single-active-tab/source-vs-implementation.png`.
  Original captures: `source-desktop.png`, `implemented-desktop.png` in that folder.
- Final exact-viewport implementation evidence from approved Playwright runs:
  `artifacts/single-active-tab-browser/blocked-light-1440.png` and
  `blocked-dark-320.png`, plus 390/768px and both theme-setting captures.
  Root inspected desktop and full-height 320px screenshots, not only metrics.

## Findings, fixes and design acceptance

1. **Ownership boundary, critical:** the legacy username/localStorage check ran
   after authenticated hooks had already started. The new atomic Web Locks gate
   precedes the lazy protected entry, its API effects and native WebSocket.
   Waiting, blocked, unsupported and failed states never render protected children.
2. **Identity/lifecycle, critical:** keyed per backend ID; fresh abortable identity
   checks precede activation, recheck and persisted-page restore. Pre-gate restore
   no longer uses frontend forced-logout broadcast/shared-cookie cleanup on failed
   or stale reads. Account changes re-enter the ownership boundary. StrictMode
   discarded setup is cancelled before issuing its initial browser lock request.
3. **Real assets and icons:** retained the original SQR transparent Q and dots,
   including the illustration's miniature brand. Replaced the package's fake Q
   fallback and emoji/custom icon substitutions with that asset and existing Lucide
   icons. No new icon library or generated brand asset. Existing source CSS browser
   illustration is retained because it is the supplied target, not a replacement
   for missing imagery. Decoration is hidden from assistive technology.
4. **Fidelity:** compared the two-column frame, heading weight/line breaks,
   paragraph width, card radii/border/shadow, action alignment, gold status and
   benefit-strip spacing. Intent and hierarchy match the supplied package; minor
   icon geometry changes are deliberate existing-library consistency. No lost
   assets, clipped text, unintended global styles or overlapping controls found.
5. **Responsive spacing:** adapted package-specific media queries to repository
   640/767/1023px tiers, without weakening the breakpoint contract. At 320px the
   actions stack with 48px targets, all text wraps and the illustration stays within
   its surface. Desktop/tablet retain the selected composition. The page intentionally
   keeps its approved light palette under a stored dark theme, rather than inventing
   an unapproved dark variant.
6. **Motion and accessibility:** no continuous decorative float; only temporary
   checking spinner, disabled by reduced motion. Semantic main/heading/buttons,
   polite status feedback, focus-visible outlines and manual-close fallback. Keyboard
   retry/Tab-to-close passed. Axe WCAG A/AA at 320/1440px under light/dark preferences
   reported zero violations; no horizontal overflow at 320/390/768/1440px.

## Functional and regression evidence

- `npm run test:auth:single-tab-browser`: 17/17 passed with real browser Web Locks
  and actual built frontend. Blocked pages recorded zero protected API requests,
  WebSockets and transient protected mounts. Owner workflows, close/recheck,
  concurrent refresh, deep links/hydration, identity changes, login/logout, idle,
  kick and ban are covered. A populated protected query cache is discarded before
  reactivating a previously active document as another verified account; the new
  dashboard refetch is asserted. Persisted lifecycle tests use synthetic events, not a
  claim that every browser engine admits the document to native BFCache.
- Codex browser independently exercised two tabs, protected network isolation,
  owner Search/Viewer/Import/Activity/Collection navigation, concurrent refresh,
  close/recheck, keyboard, narrow layout, kick, login and idle feedback.
- Client tests 2,198/2,198; fixture Node contracts 8/8; affected existing personal
  avatar/profile race browser tests 4/4. Build, typecheck, full lint, bundle,
  breakpoint, safe JSON, public entry and secret-scan checks passed.
- Full backend green is **not** claimed: an existing unrelated 100,000-account
  PostgreSQL OSP performance test reached its 120-second timeout. Its implementation
  and assertions were not modified. Exact scope/counts and remaining release checks
  are in `docs/single-active-tab.md` and the continuation handoff.
- No production deployment, environment file, migration, receipts/uploads, app
  database, dependency or existing business-rule change. Atomic cross-browser or
  cross-device enforcement needs a separately designed backend lease and remains
  unimplemented. Remote CI has not yet run this uncommitted patch.

final result: passed

## Single Active Tab — requested alignment and typography polish (2026-10-20)

### Target and evidence

Kept the approved package's visual direction and real transparent Q; no new
concept or production operation. Captured the current local blocked page before
editing, then recaptured the same 722x1391 viewport/state after the final build.
Inspected each capture and the combined `polish-before-after-722.png` directly.
Only the oversized empty IAB capture canvas beyond the measured viewport is
cropped in the comparison; rendered content is neither redrawn nor rescaled.
Also inspected desktop, tablet and exact-viewport 320px screenshots.

### Findings and fixes

- **Typography:** reduced the overly heavy/condensed headline from 800/49px max
  to 700/44px max with gentler tracking. Added explicit supporting line heights
  and consistent weights. Required BM wording, status hierarchy and real logo
  remain unchanged; readable wrapping instead of truncated copy.
- **Spacing/layout:** one shared copy/action edge, consistent 16/20/24px rhythm,
  equal 156x48px desktop actions, equal-width mobile actions, aligned outer
  header/card/two-benefit strip. At 722px the main card is approximately 74px
  shorter, without hiding instructions or shrinking touch targets.
- **Responsive:** the 768–1023px split was too narrow and wrapped the actions.
  Stack through 1023px; retain the original split from 1024px upward. Phone
  actions stack when two readable targets cannot fit; both benefit items remain.
- **Illustration/assets:** retained supplied browser composition and original Q.
  The old 280px phone stage was shorter than its foreground browser card. The
  new 304px stage, 196px foreground minimum and caption spacing leave at least
  10px measured clearance after rotation. First-window branding stays visible.
- **Colors/tokens:** existing white/corporate blue/gray/soft gold retained, no
  global CSS overrides or unapproved dark redesign. Axe contrast checks pass.
- **Copy:** no new feature claims, demo controls, removed benefit or extra help
  paragraph. Mandatory message and button labels preserved exactly.

### Final verification

Actual built browser suite **17/17 passed**. Its responsive phase now covers
320/390/640/641/722/767/768/1023/1024/1440px under light and dark preferences,
asserting aligned edges, equal action dimensions, two balanced benefit columns,
stacking and non-overlapping caption. No horizontal overflow. Keyboard retry and
close focus, reduced motion, real asset loading and ownership/data isolation still
pass. Axe WCAG A/AA at 320 and 1440px in both preferences: zero violations.

The first extended run exposed a test timing race with the pre-existing public
boot-shell h1's next-frame cleanup. Replaced instantaneous semantic counts with
retrying expectations for the same one-main/one-h1 contract; protected mount/API/
WebSocket checks remain unchanged. Final reruns pass without bypasses.

Gate contracts **6/6**, production build, targeted ESLint, JS syntax, standardized
breakpoint contract and diff whitespace checks passed. Full client/backend runs
were not repeated for this scoped CSS follow-up; the earlier unrelated PostgreSQL
performance timeout remains documented, not declared fixed.

Evidence: `artifacts/single-active-tab/polish-final.png`,
`polish-before-after-722.png`, `polish-build.log`, `polish-browser.log` and
`artifacts/single-active-tab-browser/report.json`. Preview retained in Codex IAB,
temporary viewport override reset. No production/DB access, commit/push/deploy,
new dependency or auth/session/lock behavior change.

Final visual result: passed; no outstanding P0/P1/P2 findings in this polish scope.

## 2026-10-20 — General Search Enterprise FINAL empty state

### Target and scope

Source truth: user ZIP `SQR_Enterprise_FINAL_Premium_Implementation.zip`, its
Light/Dark desktop and 390px screenshots, and the original empty-state HTML/CSS
preserved in `docs/design/general-search-enterprise-final/`. ZIP SHA256 is recorded
in that directory's README and the continuation handoff. This is a component
integration into the actual General Search route, not the supplied demo shell or
a replacement search workflow. Product Design image-to-code and design-QA guided
faithful asset reuse and the matched-source visual review.

Implementation: actual production build at a loopback-only synthetic API boundary.
No application preview switch, mock route, auth bypass, backend change or production
data access. Primary visual inspection was performed in Codex IAB. The user also
approved local Playwright/Chromium for deterministic responsive/state regression.

### Captures and normalization

Source and implementation were captured by the same Chromium process, at
deviceScaleFactor 1, viewport height 960px, each Light/Dark theme, identical
keyword `123456789012`, and reduced-motion state to freeze the same original
illustration pose. Original motion was checked separately in normal/low-spec mode.
Source reference was constrained to the measured in-app panel width; existing
sidebar, page header and controls are intentionally outside the component target.

| CSS viewport width | Source AND implementation panel PNG size, both themes |
| --- | --- |
| 320px | 288 × 477px |
| 390px | 358 × 499px |
| 768px | 736 × 367px |
| 1024px | 736 × 378px |
| 1440px | 1152 × 378px |

Fractional CSS heights are rounded only by screenshot rasterization. Images are
not rescaled, redrawn or retouched. Same-size source and implementation are placed
side-by-side with a 24px neutral gap and labels; source is left. All ten combined
inputs were opened and visually inspected, not inferred from separate captures.

Full component comparisons:
`artifacts/enterprise-empty/visual/{light,dark}-{320,390,768,1024,1440}-comparison.png`.
Their corresponding `*-source.png`, `*-implementation.png` and contextual
`*-app.png` files remain beside `evidence.json` (measured bounds, density, theme
and browser errors). The narrow 320/390px comparisons also serve as readable
focused typography/icon/copy/asset-detail comparisons; all details are legible
without additional enlargement. Desktop comparisons check composition and crop.
Additional primary-browser evidence is in `artifacts/enterprise-empty/iab/`.
IAB's zoom/oversized capture-canvas quirk is not used for pixel-size assertions;
the exact-viewport pairs above are the normalized comparison evidence.

### Fidelity review and comparison history

First matched visual comparison: **no actionable P0/P1/P2 visual mismatch**.
No visual fix was made in response, so a second visual iteration was not required.

- **Fonts/typography:** retained the exact supplied font stack, size, weights,
  line heights, tracking and optical-size settings. Same browser/system fallback
  on source and implementation; no remote font request or new font dependency.
  Titles, badge, monospace keyword and tip wrap consistently at every measured
  viewport. Long adversarial keywords truncate inside their capsule, not the page;
  the complete literal text remains available in its title.
- **Spacing/layout rhythm:** exact scoped source CSS retains the 17px radius,
  panel padding, meta/title/lead/query/tip spacing and seamless art. Source and
  implementation bounds agree. Text and illustration are side-by-side on desktop,
  stacked on phones, with no secondary card/divider or horizontal overflow.
  The original 365/760/980px responsive rules have an exact-path exception only;
  every adjacent/unrelated stylesheet remains subject to shared workspace tiers.
- **Colors/tokens:** original dark surface `#151b20`, light white surface, muted
  type, blue badge, warm lighting, lagoon gradients, opacity and soft masking are
  unchanged. Existing `html[data-theme]` selects the palette. Workspace styling
  outside the panel is preserved rather than restyled to the demo.
- **Asset quality/fidelity:** reused the original SVG, mechanically converted to
  JSX. Automated SSR comparison verifies every one of 146 elements, nine unique
  IDs, attributes, geometry, paint and order. The stylesheet and all eleven
  keyframes match the canonical source. No generated/redrawn illustration or logo,
  raster enlargement, compression halo or substituted icon. Original fish story
  remains 10 seconds in normal AND low-spec modes; reduced motion disables it.
- **Copy/content:** required original BM title, description, count and tip are
  exact. Real submitted keyword replaces the demo value as escaped React text.
  Advanced mode uses `Kriteria carian` and the actual effective filter summaries.
  No extra empty-panel actions or demo labels. Existing form/navigation copy stays
  unchanged, as required by scope.

Independent code review found and fixed a non-visual P2 before final handoff:
shared PDF-export feedback initially hid accepted populated results. The final
guard distinguishes accepted positive data from a new/failed search, while any
error still excludes the premium empty state. The final rebuilt browser suite
explicitly fails the lazy PDF export chunk and verifies the table, retry/export
controls, record dialog and restored focus remain available. This was a functional
regression fix, not a claimed visual comparison iteration.

### Interactions, accessibility and security

Final actual-built browser run: **34/34 passed** (26 new empty-state checks and
8 existing General Search layout regressions), without snapshot baseline updates.
Evidence: `artifacts/enterprise-empty/final-browser.log`.

Covered initial idle, pending/invalid input, successful zero, populated results,
positive-total/empty-page fallback, server500, network failure, timeout,401 and
malformed200 responses. Held old responses are released and settled before stale
keyword/mode/filter/logic/reset assertions. Simple/advanced controls, Enter submit,
reset, selected record detail, dialog focus restoration, three role permissions,
desktop height/width, low-spec virtualization and mobile cards remain functional.

Scoped axe WCAG A/AA/2.1 checks at 320 and 1440px in both themes: zero violations.
Named region/title, BM language, explicit completion status, hidden decorative
artwork, keyboard order and active search-input focus are preserved. No added
interactive elements or reduced-motion bypass. Normal/low-spec native animation
timelines are checked for 10,000ms/infinite and reduced-motion yields zero running
subtree animations.

Ten separate same-state visual runs also pass strict production-like CSP,
`style-src-attr 'none'` and Trusted Types, without policy relaxation or app code
replacement. No page/JS/CSP/TrustedHTML errors; all traffic is local. Long markup
keywords remain literal text, create no image/script nodes, execute no payload and
cause no overflow. No keyword logging or persistence was added.

### Verification and remaining scope

Production build, final typecheck, full client/server lint, all 2,212 client tests,
771 script tests (one pre-existing Viewer baseline reproducer skipped), exact
SVG/CSS/state tests, DOM-injection guard, breakpoint contract/tests, bundle budgets,
hygiene and secret scan have passed. The new source-fidelity test initially used
Array.at, which is outside this project's ES2020 type library; replaced it with
ordinary array indexing and reran typecheck/client tests successfully without
widening the compiler target. Existing build has an upstream PostCSS `from` warning;
the build completes and source-map/bundle gates pass. No dependency change.

Backend suites and live production deployment are outside this frontend-only
verification. No claim is made that remote GitHub CI or deployment has run. At the
time of this QA report, commit, push and deployment had not yet been requested.
The user later authorized commit/push on 2026-10-20; deployment remains separate.

Final result: passed

No outstanding actionable P0/P1/P2 visual or interaction findings in this scope.
Continuation file: `CODEX_CONTINUATION_HANDOFF_GENERAL_SEARCH_ENTERPRISE_EMPTY.md`.

### Preview motion follow-up — 2026-10-20

User reported that the local preview did not move. Read the live rendered tab
before changing anything: `matchMedia('(prefers-reduced-motion: reduce)').matches`
was true, fish animation-name was `none`, duration `0s`, static transform at268/152.
The previous handoff had cleared the screenshot's media override, which restored
Codex IAB's own reduced-motion default. This was a preview environment issue,
not a missing keyframe or a production runtime regression.

Set `prefers-reduced-motion: no-preference` in the EXISTING preview tab's CDP media
emulation only. The visible fish now uses `se-fish`, duration10s, with transforms
changing from approximately429.883/177.992 to143.823/257.483. Native animation
timelines report running with advancing currentTime; all original motion remains.
Saved live preview evidence: `artifacts/enterprise-empty/iab/animation-live.png`.

No component, asset, CSS, build, production setting or OS preference was changed.
Production reduced-motion behavior stays intact. The prior matched-source visual
comparisons remain valid; no visual source or layout changed in this follow-up.
The tab-local motion override is deliberately retained so the user can inspect
the animation, and must be disclosed at handoff. Chat PNG screenshots are static.

Final result: passed

## Settings primary navigation and consistent account fields — 2026-10-21

### Scope and visual truth

Approved scope: proposal 3 (consistent Create Closed Account field sizing) and
the primary Settings header/page chooser, not the nested Account Management
tabs. Existing proposal 1/2 nickname/status changes in the working tree are
preserved and included in the regression run. No backend, permission rule,
category ID, route, global CSS, dependency or brand asset is changed.

Fresh source visual truth: `artifacts/qa-settings-header/before/` captured from
the existing local build before this scope's edits. Final rendered evidence:
`artifacts/qa-settings-header/verified/`, built from the revised source. These
are browser-rendered real components with strictly intercepted synthetic data,
not generated mockups. Codex browser initialization was blocked; the user
explicitly approved local Playwright/Chromium as the fallback.

Both capture sets use the same fictional superuser, routes, content, interaction
state, browser, reduced-motion preference and light/dark themes. CSS viewports
and source/implementation PNG dimensions are 1366x900, 768x900 and 320x900,
deviceScaleFactor 1. No density scaling, browser chrome or image normalization
is needed. The extra browser regression uses height1000; its Backup failure
and corrected captures must be compared at320x1000, not against the900px set.

### Three-step experience review

1. General Settings: primary category navigation now precedes the page heading,
   consistently with Account Management. Existing text/current-page cues are
   retained. The extra Administration eyebrow is removed; there remains one h1.
2. Account Management: the primary Settings chooser has a bounded44px surface;
   the existing inner tabs, category access, Sheet workflow, Escape and return
   focus are preserved. Backup configuration and operations remain separate.
3. Create Closed Account: Full name, Username, Email, Role and optional Nickname
   are44px, with8px label gaps and16px field-grid gaps. Labels, help and errors
   retain their associations and wrap within the form. No payload or validation
   rules change.

### Comparison evidence and history

Source and rendered implementation were opened together in the same comparison
input, rather than judged from paths or separate image views:

- `before/01-general-1366-light.png` versus `final/01-general-1366-light.png`:
  full desktop hierarchy, intended navigation-first order, typography and tokens.
- `before/02-account-320-dark.png` versus `final/02-account-320-dark.png`:
  compact chooser alignment, readable label and unchanged nested account flow.
- `before/04-create-1366-light.png` versus `final/04-create-1366-light.png` and
  the focused `final/05-fields-1366-light.png`: equal-height controls and labels.
- `before/03-menu-320-dark.png` versus `final/03-menu-320-dark.png`:
  all nine destinations remain readable; Close has a44px hit target. Descriptions
  wrap without changing access or focus behavior.
- `before/01-general-768-dark.png` versus `final/01-general-768-dark.png`, and
  `before/04-create-320-light.png` versus `final/04-create-320-light.png`:
  two-row tablet navigation, mobile single-column fields and retained submit.
- The final post-fix build was recaptured in `verified/`. Matched comparisons
  additionally opened `before/01-general-1366-dark.png` with its `verified/`
  counterpart, and `before/01-general-768-light.png` with its counterpart.
  Final focused `verified/05-fields-1366-light.png`,
  `verified/05-fields-320-light.png` and `verified/06-nickname-320-light.png`
  were opened together with the source create screenshot. Native element crops
  make field text/borders legible; these are region comparisons, not whole-frame
  pixel equality. These crops are 718x217, 254x413 and 228x45 PNG pixels respectively
  at DPR1 (fractional element edges round to whole screenshot pixels; computed
  nickname height remains 44 CSS pixels). Focused capture scrolls the region to
  the viewport center so
  the real sticky submit footer does not obscure its bottom. Earlier `final/`
  mobile field crop was occluded by that footer and is not acceptance evidence.

Before capture audit: source text inputs measured36px on desktop/tablet, Role40px
and Nickname44px. At320px text inputs were44px but Role remained40px. Final
`verified/capture-report.json` records all five controls at44px in all six
viewport/theme combinations. Browser tests also require8px native-label gaps,
16px mobile/14px desktop field text, without weakening legacy write assertions.

Read-only peer review found a configuration heading still named Backup & Restore
and a14px mobile nickname select. Both were corrected before visual acceptance:
the shared display-label helper now gives navigation, heading and error boundary
the same label; the nickname uses `text-base md:text-sm`. Category IDs and the
operational Backup & Restore label are unchanged.

First full browser run:43/45 passed. Both320px navigation cases found a P2
horizontal overflow in operational Backup & Restore. Preserved visual evidence:
`artifacts/qa-settings-header/backup-before-320-light.png` and
`backup-before-320-dark.png` (320x1000 each). Search & Filters inherited Button's
`whitespace-nowrap`; its description visibly extended past the card/viewport.
Local fix: `min-w-0 max-w-full whitespace-normal` on that trigger, non-shrinking
chevron. No global overflow hiding, backup operation or filter handler changed.
The regression still requires no document overflow and additionally exercises
the filter's Enter/Space expand/collapse state and bounded content at 320px.
Post-fix paired comparison opened `backup-before-320-light.png` and
`backup-verified-320-light.png` together, then the dark counterparts together.
All four are 320x1000 pixels at DPR1, same viewport, route, synthetic data and
collapsed filter state. The entire description now wraps inside its card in
two lines; the chevron and surrounding controls remain visible. The modest
extra card height is the intended consequence of retaining readable copy.
The revised browser run passed all 45 cases with the original overflow guard
and new open/close assertions intact. No actionable P0/P1/P2 issue remains in
the inspected scope; this closes the earlier responsive finding.

### Required fidelity surfaces

- Fonts/typography: existing system-ui/Segoe UI stack and heading scale retained;
  no new font/fallback. Primary navigation intentionally moves12px to14px for
  readability. Labels align on20px line-height; help/error copy has20px leading.
  Native controls match16px mobile and14px medium-and-up. No visible clipping,
  artificial lettering or inappropriate new display weights in reviewed states.
- Spacing/layout: existing page width, sidebar, account tabs and card grid kept.
  Navigation surface uses existing radius/border tokens; it wraps rather than
  shrinking text. Equal44px controls,8px labels and16px grid gaps are intentional
  departures from the inconsistent source. No extra rail, hero or duplicate h1.
- Colors/tokens: existing background, muted, border, primary and semantic status
  tokens retained in both themes. Active text/current-page semantics accompany
  color. No new palette, gradients, shadows or animation library.
- Image quality/assets/icons: original Q logo/transparent asset and existing
  Lucide icons remain unchanged; no SVG/CSS approximation or generated imagery.
  Captures show the same asset scale/sharpness, with no new crop/halo artifacts.
- Copy/content: existing product copy is retained except removing Administration,
  adding the Settings context in the chooser and consistently distinguishing
  Backup Settings from Backup & Restore. No demo/preview control is introduced.

### Verification and limits

- Focused initial contracts30/30 passed. Expanded Settings and Backup unit/SSR
  suite232/232 passed, including category selection/hydration, permission guards,
  create payloads, semantic status, unsaved changes and backup filter wrapping.
- Full TypeScript check passed again after the final local filter class/test
  addition (`npm run typecheck`, exit0).
- Final production build passed; status artifacts, CSP hashes and no-production-
  sourcemap gates passed. Existing upstream PostCSS `from` warning remains.
- Final browser rerun: 45/45 passed (one worker, production-built frontend).
  Covers all nine primary destinations, one heading, 44px category/Close targets,
  strict role restrictions, dirty values/badges, reload, keyboard/focus, create
  choices/payloads, retries, long names, stale responses and no unauthorized writes.
- Changed client files lint: zero errors, one pre-existing exhaustive-deps warning
  on `generation.current` in ManagedAccountCollectionScope cleanup. That cleanup
  is unchanged by this UI work.
- Bundle budgets, client breakpoints, spacing/color contracts, secret scan and
  repository hygiene passed. No dependency additions or baseline updates.

No real accounts, database, SMTP, production request or Socket connection used.
No full WCAG compliance, screen-reader assistive-tech run, Safari/iOS device,
remote CI or production deployment is claimed. Browser tests inspect runtime
console/page errors through the strict synthetic fixture. No snapshot baseline
or tolerance has been relaxed. No commit, push or deployment requested yet.

### Implementation checklist

- [x] Preserve workflows, permission boundaries and previous nickname/status work.
- [x] Align primary Settings navigation and single heading; preserve inner tabs.
- [x] Standardize scoped create fields and accessible labels/help/errors.
- [x] Capture matched source/rendered views and inspect focused field regions.
- [x] Fix the discovered320px backup filter overflow without global CSS changes.
- [x] Complete post-fix browser comparison and all 45 browser regression cases.
- [x] Pass lint/error, bundle, token, secret and hygiene checks.
- [x] Finish final post-addition TypeScript check.

Final result: passed

No outstanding actionable P0/P1/P2 findings in this scoped implementation.
The working tree remains uncommitted; commit, push and deployment are separate.

## Edit Managed Account field consistency — 2026-10-22

### Approved scope and source

Implement suggestion1 only: bring the existing Edit Managed Account fields into
line with Create Closed Account. The fresh existing code render is the source,
not a new mockup or visual redesign. Product Design audit informed the local
44px controls, block labels, preserved grids and a long-username wrapping fix.

Current-run audit/report: `artifacts/qa-managed-editor/AUDIT.md`.
Source: `artifacts/qa-managed-editor/source/`.
Implementation: `artifacts/qa-managed-editor/after/`.
Both use strictly intercepted fictional account data on a static loopback server.
Codex browser initialization failed; local Playwright was already approved for
this Settings workflow. No production, database, credentials, mail or real
account was used. The first capture attempt had an invalid relative URL due to
missing baseURL, produced no accepted screenshot, and is not audit evidence.

### Experience audit and fixes

1. Entry from Managed accounts — healthy. Real Edit/Details controls and list
   context remain. Source `01-entry-1366-light.png` was inspected before editing.
   Initial Full Name focus and the direct/Details opener handoff are preserved.
2. Profile fields — source was inconsistent: Full Name/Username/Email measured
   36px at768/1366px, while Role/status/Banned were40px. Mobile inputs were44px/
   16px text but selects40px/14px. All six inline labels measured10px gaps. The
   revised editor uses44px fields, block labels/20px leading,8px gaps and16px
   grid spacing, with16px mobile/14px medium-up text, matching Create.
3. Access fields and dismissal/save — existing warning, role/status/ban meanings,
   bounded scroll body and separate header/footer are retained. A valid unbroken
   32-character username was clipped in the header (P2). Description wrapping
   now preserves the whole text and reserves room for Close at both breakpoints.
   Local Close/Cancel/Save hit areas are at least44px. No new submit-on-Enter,
   pending Escape/Close guard, write request, role option or confirmation flow.

Only application source changed for this scope: `ManagedUserDialog.tsx`, styles
only. Global Dialog/Input, view-models, save handlers, endpoints and permissions
remain unchanged. Tests and the scoped account-management documentation are
added alongside it; all earlier dirty Settings/nickname changes are preserved.

### Matched visual comparison

Full frames:320x900,768x900,1366x900 CSS and PNG pixels, deviceScaleFactor1.
Same Chromium, light/dark theme, fictional user, route, initial Full Name focus,
reduced-motion preference, content and scroll state in source and after captures.
No browser chrome, density resampling or screenshot editing is involved.

The following source/implementation images were opened together in the same
comparison input before judging, not read separately from memory:

- `source/02-editor-1366-light.png` and `after/02-editor-1366-light.png`.
- `source/02-editor-320-light.png` and `after/02-editor-320-light.png`.
- `source/06-long-username-320-light.png` and its `after/` counterpart.
- `source/02-editor-768-dark.png` and `after/02-editor-768-dark.png`.
- Remaining full-view counterparts at1366-dark,768-light and320-dark.

Focused comparisons make field text and geometry readable:

- `source/03-fields-1-1366-light.png` (607x152 pixels) and
  `after/03-fields-1-1366-light.png` (607x160). Local native region captures
  intentionally differ in height because the text controls grow36px to44px.
- `source/03-fields-2-768-dark.png` and its `after/` counterpart (607x72 each).
  Labels now have a20px line box/8px gap; selects grow40px to44px.
- `source/05-create-reference-1366-light.png` was opened with the editor source
  as the approved44px rhythm reference. It is a different form/width; no claim
  of whole-frame equality is made between Create and Edit.

`source/measurements.json` and `after/measurements.json` record all six fields
in all six width/theme states. An independent assertion checked all36 final
fields: exactly44px height,8px native-label gap, block label display and correct
responsive font size. Metrics supplement, rather than replace, visual review.

### Required fidelity surfaces and comparison history

- Fonts: computed system-ui/-apple-system/BlinkMacSystemFont/Segoe UI/sans-serif
  stack is identical. Existing title, body weight and letter spacing remain.
  Native mobile selects now match16px inputs instead of14px. Block labels align
  their left edge with controls; text remains readable without truncation.
- Spacing/layout: maximum dialog width and two-/three-column desktop grids are
  unchanged. The small intentional height increase accommodates44px fields and
  footer buttons. On mobile the fields stay single-column; internal scrolling
  keeps header/actions available. No additional card, rail or illustration.
- Colors/tokens: original background/input/border/ring/primary and amber warning
  tokens remain in both themes. No new palette, shadow or animation introduced.
  Visible focus ring and explicit Role/status/Banned text accompany state cues.
- Assets/icons: existing Q branding, Lucide warning and native close icon are
  untouched. No image, SVG or CSS-art replacement, altered crop or new halo.
- Copy/content: all product labels, warning, account identity and actions remain.
  Long usernames wrap without being omitted or rewritten. No demo/preview text.

The current-run source audit found the sizing/typography mismatch and P2 header
clipping above. After applying local styles, the first matched implementation
comparison found the full username visible, equal-height controls and no further
actionable P0/P1/P2 issue in these states. No visual fix was made after that
comparison. This is an audit-to-fix pass, not a claimed pixel-perfect clone.

### Verification

- Settings/Backup unit and source contracts:236/236 passed, including4 new
  editor contracts. Portaled Radix content is tested in the browser, not claimed
  as server-rendered UI from the source contracts.
- Full `npm run typecheck`: passed. Both changed client files lint:0 errors and
  0 warnings. Production build/status/CSP/no-source-map gates passed; the known
  upstream PostCSS `from` warning remains, with no dependency change.
- Bundle budgets, breakpoints, color/spacing tokens, secret scan and repository
  hygiene passed. Diff whitespace check passed; no snapshot/tolerance update.
- Browser regression:22/22 passed (one worker, production-built frontend).
  Includes11 new editor cases, six existing workspace checks, Details/Edit and
  confirmation focus checks, and three restricted-role cases. Measures field
  geometry, keyboard trap/dismissal/focus, cancellation without writes and exact
  separate changed-only profile/role/status+ban PATCH contracts with held saves.
  Runtime page/console errors and unexpected requests are checked by the strict
  synthetic fixture. No snapshot baseline or error tolerance was relaxed.
- Additional short-height evidence: `artifacts/qa-managed-editor/after/07-short-height-320-light.png`
  (320x480 PNG/CSS pixels, DPR1), opened and inspected after the passing test.
  Header/Close and Cancel/Save remain visible while the inner body is scrolled
  to Banned. This is an additional functional viewport check, not a false
  same-frame comparison against the900px source.

Evidence limits: synthetic Chromium only, not live production or remote CI.
Screenshots do not establish full WCAG or assistive-technology compliance.
Physical mobile keyboard, Safari/iOS and text-zoom device testing are not claimed.
Existing Close/Escape while a save is pending remains allowed; this work does
not add cancellation or rollback of a request already accepted by a server.

### Checklist

- [x] Capture and inspect fresh source before changing application code.
- [x] Keep changes local and preserve all handlers, permission and focus guards.
- [x] Compare full views and focused regions at matched density/state.
- [x] Verify236 unit/source tests, typecheck, build, lint and safety contracts.
- [x] Finish all22 browser cases and inspect short-height evidence.

Final result: passed

No outstanding actionable P0/P1/P2 finding in the approved Edit sizing scope.
No commit, push or deployment performed; the working tree remains reviewable.

## Account confirmation consistency — 2026-10-22

### Scope, fresh audit and visual truth

Approved: frontend-only polish of Reset Password, Ban/Unban and Delete Account
confirmations. Preserve the existing navigation, account targets, impact copy,
colors, handlers, permission checks and request/dismissal semantics. Product
Design audit guided the local alignment,44px actions and bounded scroll layout.
No global AlertDialog/Button, mutation hook, backend or dependency is changed.
All previous Settings/nickname/editor work remains intact in the working tree.

Audit: `artifacts/qa-account-confirmations/AUDIT.md`.
Source visual truth: `artifacts/qa-account-confirmations/source/`.
Final rendered implementation: `artifacts/qa-account-confirmations/verified/`.
Fresh captures use real components on the strict synthetic static loopback
runner. Codex browser initialization again failed; local Playwright was already
approved for Settings QA. No real account, database, SMTP or production access.

### Numbered experience findings and corrections

1. Reset — clear target and impact copy; safe Cancel autofocus already healthy.
   Source desktop actions measured38px, mobile44px. Standardise both actions to
   44px locally, keep native Cancel focus and exact reset-email dispatch.
2. Ban/Unban — impact rows correctly explain restrictions and reversibility.
   Mobile headings/description were centered while impacts were left aligned.
   Use left alignment, consistent16/24px responsive padding and readable24px
   description leading without replacing copy, icons or semantic tokens.
3. Delete/short screens — source P2: an unbroken valid32-character username
   stretched/clipped the grid at320x480 and left Cancel outside the visible
   viewport. Use bounded flex Content, min-width-safe wrapping and a scrollable
   details body with footer outside it. Retain all three impact rows and mobile
   action-before-Cancel visual order. The smaller footer gap is now8px, not the
   accumulated default gap plus Cancel margin.

The details body contains static text. Peer review identified that moving
Cancel into a sibling footer could leave keyboard scrolling browser-dependent.
Before final QA, each body received a named region, tabIndex0 and an inset focus
indicator. Shift+Tab from the initially focused Cancel reaches that region;
PageDown must actually scroll it. Three narrowly scoped lint exceptions explain
this intentional non-widget focus target. No interactive role is fabricated and
no lint configuration is relaxed.

### Matched comparison evidence

Source and final PNGs share CSS viewport, pixel size, DPR1, Chromium version,
route, synthetic data, theme, reduced-motion preference, opener and Cancel focus.
Full views are1366x900,768x900,320x900. Short views are320x480. No image editing,
resampling, browser frame or device-density mismatch is involved.

Each pair below was opened together in the same image comparison input:

- `source/01-reset-1366-light.png` and `verified/01-reset-1366-light.png`.
- `source/02-ban-320-light.png` and `verified/02-ban-320-light.png`.
- `source/03-unban-768-dark.png` and `verified/03-unban-768-dark.png`.
- `source/04-delete-320-dark.png` and `verified/04-delete-320-dark.png`.
- `source/05-short-reset-320-light.png` and its `verified/` counterpart.
- `source/05-short-delete-320-dark.png` and its `verified/` counterpart.
- Desktop-dark Delete, tablet-light Ban and mobile-dark Reset counterparts.

These comparisons cover all four action states and all six width/theme tiers,
plus short-screen P2 evidence. Captures contain24 normal states and six short
states per phase. No claim is made that every screenshot is a separate redesign.
The320px native views act as readable focused dialog comparisons: the304px
dialog fills almost the entire frame width, and all14px body text,18px headings,
icons, borders, buttons and wrapping can be inspected at1:1. A further cropped
image is unnecessary for this small single-surface dialog; the desktop full
views establish its proportions within the app shell.

`source/measurements.json` and `verified/measurements.json` supplement visual
review. A separate assertion checked all24 final normal states:48 actions are
44px high, dialog width stays bounded by the viewport and dialog content has
no horizontal overflow. Native32-character names remain complete and wrap;
the short-screen footer shows both actions, with the static body scrolling.

`after/` is an intermediate capture before the explicit keyboard-scroll region
attributes; it is not final acceptance evidence. `verified/` was rebuilt and
recaptured after that change. The first final matched visual comparison found
the source clipping corrected and no remaining actionable P0/P1/P2 mismatch.
No visual fix was made after this comparison. Keyboard/runtime checks remain
separate from visual-fidelity evidence.

### Required fidelity surfaces

- Fonts/typography: existing system-ui/Segoe UI stack,18px heading and14px body
  size retained. Description leading is intentionally24px; left alignment and
  wrapping improve scanning. No new typeface, letter spacing or display scale.
- Spacing/layout: original maximum512px width retained; mobile dialog304px at
  a320px viewport. Use16px mobile/24px wider horizontal padding,16px body vertical
  padding,12px footer vertical padding and8px action gaps. The existing project
  scrollbar-gutter pattern is used locally; its reserved width is intentional. No
  duplicate heading, hero, new card hierarchy or hidden impact explanation.
- Colors/tokens: original primary actions, background, borders, warning/danger/
  success impact tones and overlay unchanged. A token-based footer divider and
  focus ring clarify regions; no new palette, gradients or decorative shadows.
- Images/icons: original Q branding and Lucide impact icons remain untouched.
  No generated image, inline SVG substitute, CSS art, altered crop or fake asset.
- Copy/content: usernames, titles, action captions and all impact explanations
  remain verbatim. Named details-region labels are accessibility metadata only;
  no demo, preview control or extra visible instructions were introduced.

### Verification and scope limits

- Settings/Backup unit/source suite240/240 passed, including4 new confirmation
  source contracts. Actual portaled dialog rendering is verified in the browser,
  not misrepresented as SSR output.
- Full typecheck and production build passed; status/CSP/no-source-map gates
  passed. The existing upstream PostCSS `from` warning remains.
- Changed files lint: zero errors/warnings after the three documented, local
  focusable-scroll-region exceptions. No global lint rule was changed.
- Bundle budgets, breakpoint/color/spacing contracts, secret scan and repository
  hygiene passed. No dependency, snapshot baseline or tolerance changes.
- Final browser regression20/20 passed, one worker on the production-built
  frontend:13 new confirmation cases, six existing Account Management keyboard/
  callback/role regressions and one neighboring Collection confirmed-reset case
  matched by the command. Covers all four confirmation types, focus/dismissal,
  long names, real keyboard scroll, reset/delete deduplication and exact separate
  POST/PATCH/DELETE contracts. Ban has no existing pending lock; this UI pass
  does not add or claim one. Strict fixtures check page/console errors and
  unexpected/off-origin requests.
- Runtime keyboard evidence was opened and inspected:
  `verified/06-keyboard-reset-320-light.png` and
  `verified/06-keyboard-delete-320-dark.png` (both320x480,DPR1). The focused named
  body has a visible inset ring; its bottom impact items can be read while
  both footer buttons remain visible. These are additional scrolled-state
  evidence, not falsely compared to the initial unscrolled source state.

Source callbacks still dispatch synchronously and native AlertDialog Action
closes immediately. Reset/Delete locks and Delete disabled guards remain where
they were. No new awaiting, preventDefault, pending state, rollback or server-side
authorization behavior is introduced. Broad security assurance, full WCAG/AT
certification, real Safari/iOS behavior, remote CI and deployment are not claimed.

### Checklist

- [x] Capture and inspect the current flow before editing app code.
- [x] Preserve all business callbacks, native safe focus and existing guards.
- [x] Compare source/final states at matched density and check typography/copy.
- [x] Pass240 unit/source tests, typecheck/build, lint and safety contracts.
- [x] Finish all20 browser regressions and inspect keyboard-scroll evidence.

Final result: passed

No outstanding actionable P0/P1/P2 finding in this approved confirmation scope.
No commit, push or deployment performed.

## Edit Managed Account save readiness and inline feedback — 2026-10-22

### Scope and source truth

Approved continuation: Save enabled only for meaningful valid changes, adjacent
Username/Email format errors and retained drafts on save failure. Existing code
and a fresh rendered source capture are the visual target, not a new redesign.
Product Design audit → scoped implementation → paired design QA was followed.

- Source: `artifacts/qa-managed-editor-feedback/source/`.
- Implementation: `artifacts/qa-managed-editor-feedback/verified/`.
- Local audit/capture: `artifacts/qa-managed-editor-feedback/AUDIT.md` and
  `capture.mts`. Codex browser initialization failed on missing kernel assets;
  the already-approved local Playwright fallback captured the actual built app
  using strict synthetic fixtures and a loopback-only static server. No real
  backend, database, mail, credentials or production records were accessed.
- Viewports/pixels:320x900,768x900,1366x900, DPR1 in light/dark, reduced motion,
  fixed synthetic time/content and the same Edit dialog interaction sequence.
  Full views are unscaled PNGs equal to the CSS viewport dimensions. No device
  frame or browser chrome is present. No density normalization is needed.
- Numbered views in both directories: `01-unchanged-<width>-<theme>.png`,
  `02-invalid-<width>-<theme>.png`, `03-profile-<width>-<theme>.png`.
  The latter is an element capture607px wide at desktop/tablet and255px at
  mobile; natural height grows with error text. This intentional content-height
  difference is not a density/geometry mismatch.
  Exact crop pixels: desktop/tablet607x160 source→607x236 final; mobile255x248
  source→255x344 final, both themes, unscaled DPR1. Supplemental failed-request
  captures `verified/04-retained-draft-http-500.png`/`409.png` are1280x720;
  scrolled error-state captures `05-errors-short-320-light.png`/`dark.png` are
  320x480. These additional states were opened and inspected, not falsely paired
  with a source state that did not capture a server error or short-screen error.

### Findings, fixes and comparison history

1. [P2, source] An unchanged draft has active Save. The old handler could close
   with a success toast even when no account PATCH was needed. Evidence:
   `source/01-unchanged-1366-light.png` and the matching320px view. Fix:
   `managed-user-edit-state.ts` derives normalized changed-only profile data,
   access-change flags and save readiness. Both dialog and handler use it.
   The same final views show disabled Save and a visible reason.
2. [P2, source] Invalid Username and Email have no inline explanation or invalid
   state before save. Evidence: `source/02-invalid-1366-light.png` and focused
   `source/03-profile-320-dark.png`. Fix: apply the existing changed-username
   rule and backend email-format rule; use local invalid borders, associated
   `aria-invalid`/`aria-describedby` messages and a polite footer status.
   Matching `verified/02-invalid-*` and `03-profile-*` show readable errors,
   unchanged44px controls and no horizontal overflow.
3. [Preserved behavior] Existing catch already retained entered values. No
   replacement persistence layer, auto-retry, new uniqueness lookup or request
   endpoint is introduced. HTTP500/409 tests exercise deliberate manual retries.

After implementation, all18 matched source/final pairs were opened together in
the same comparison tool inputs: twelve full views (unchanged/invalid in six
viewport/theme contexts), plus six focused profile crops. No actionable P0/P1/P2
was found in those comparisons. New footer explanation and inline error rows
intentionally add intrinsic height; original field sizes/grid breakpoints,
header/footer separation, internal body scrolling and maximum width remain.
The source defects above were fixed and recaptured before final review; no
additional visual repair iteration was needed.

### Required fidelity surfaces

- Fonts/typography: measured `system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif` family/fallback, weights, hierarchy and line
  heights retained. Fields remain16px mobile/14px at medium-and-up. Error and
  status text uses readable14px/20px leading, wraps instead of clipping, and
  does not reflow the label/input relationship. Paired crops expose these details.
- Spacing/layout:44px fields/actions and8px label gaps preserved; grids stay16px.
  Footer feedback has its own8px gap above right-aligned actions and stays outside
  the scroll body. No global dialog geometry or breakpoint changes. Existing
  short-screen scrolling, keyboard dismissal and focus return are regression-tested.
- Colors/tokens: existing backgrounds, borders, amber access warning and primary
  actions retained. New inline errors use semantic destructive tokens and text,
  not color alone. Readiness copy uses muted foreground; disabled Save is a real
  disabled button with an explanation, not merely a dimmed appearance.
- Image/asset fidelity: original project logo and icon assets remain unchanged;
  no drawings, generated raster, custom SVG approximations or new dependencies.
- Copy/content: existing title, six labels, access warning and action names kept.
  New copy distinguishes no changes, invalid fields, ready changes and pending
  save; format errors state the required correction. It does not promise backend
  acceptance or expose secrets. Server uniqueness/permission errors retain their
  existing error toast, not invented frontend uniqueness validation.

### Behavior boundaries

Canonical trim/case-only changes are no-ops. Username validation applies only
when that identity field will be patched, preserving unrelated role/status
edits on untouched legacy identities. Full Name and non-pending Email remain
optional and changed empty values become null. An originally pending account's
changed Email cannot be cleared; unchanged legacy blank email remains omitted.
Backend authorization, uniqueness and lifecycle rules remain authoritative.

Explicit Save behavior is retained (no new Enter/form submission). Fields and
Cancel disable while saving; Close/Escape semantics are unchanged. Separate
profile→role→status calls are still sequential, not transactional: an eventual
failure can follow an already-applied earlier update. This frontend pass does
not claim atomic rollback or change these existing business semantics.

### Verification

- Settings/Backup unit/source suite:253/253 passed, including12 new pure helper
  cases and updated inline-feedback/readiness contracts.
- First built browser run:24/24 passed with `--grep "Managed account" --workers=1`
  (existing editor/workspace matrices plus exact separate PATCH/pending guards,
  no-op/revert, error ARIA, nullable clears, pending/legacy rules,500/409 retry).
- Follow-up built browser run:9/9 passed: two additional320x480 error-state
  light/dark cases, two500/409 re-runs with retained-draft captures, More/Details
  keyboard dismissal and three denied-role API guards (admin/manager/user).
  Combined31 distinct browser cases/33 executions; no forced successful clicks.
- Full typecheck, production build, changed client lint, bundle budgets,
  breakpoint/color/spacing contracts, secret scan, hygiene and whitespace passed.
- Full typecheck was repeated successfully after all new client tests existed.
  Browser fixtures reject off-origin/unexpected APIs and collect page/console
  errors. The two intentionally failed HTTP responses are narrowly asserted;
  unrelated application/resource errors are not allowed.

No screenshot baselines/tolerances were changed. No remote CI, production,
real Safari/iOS keyboard, screen reader or full WCAG certification is claimed.
The existing upstream PostCSS `from` warning remains; build succeeded.

### Residual polish and limits

P3 existing shared-toast placement: at1280x720 a transient error toast overlaps
the dialog action area (`verified/04-retained-draft-http-500.png` and409). It has
auto/manual dismissal and draft retention; the tested unforced retry proves
eventual recovery, not immediate Save clickability while the toast is visible.
No global toast CSS or brittle per-dialog offsets were introduced in this
bounded continuation. A separate modal-aware notification pass can address it.
Do not infer a general "no overlap" or bug-free claim from this scoped result.

### Checklist and result

- [x] Capture/inspect the current unchanged and invalid states before app edits.
- [x] Share semantic dirty/validation decisions between UI and save handler.
- [x] Preserve optional/legacy identity and backend permission semantics.
- [x] Compare full views and focused crops at matched CSS size/DPR.
- [x] Pass253 unit/source tests,31 distinct browser cases, repeated typecheck,
  production build, lint and listed safety contracts.

Final result: passed

No actionable P0/P1/P2 remains in the approved edit-feedback scope; the known
P3 shared-toast follow-up above is explicitly retained, not silently hidden.
No commit, push or deployment performed for this UI continuation.

## Edit Managed Account inline server errors — 2026-10-22

### Approved outcome and fresh source

Replace overlapping/duplicate server-error notifications with one error inside
the active Edit Account dialog, retaining drafts and deliberate retries. This
is the approved follow-up to the P3 noted above, not a global toast redesign.
Product Design source capture/audit preceded application edits.

- Source truth: `artifacts/qa-managed-inline-error/source/`.
- Initial implementation: `artifacts/qa-managed-inline-error/verified/`.
- Final implementation target: `artifacts/qa-managed-inline-error/final/`.
- Audit/capture: `artifacts/qa-managed-inline-error/AUDIT.md`, `capture.mts`.
- Codex browser initialization again failed on missing kernel assets. Capture
  uses the previously approved local Playwright fallback, strict synthetic
  account fixtures and an isolated loopback-only static built server. No real
  backend, credentials, database, mail or production records are accessed.
- Eight contexts:1280x720,768x900,320x780,320x480, each light/dark, DPR1,
  reduced motion, fixed synthetic time/data and identical action sequence.
  `01-open-*` and `02-failed-*` are full PNGs at those exact CSS/pixel dimensions;
  `03-footer-*` are native element captures for readable typography/actions.
  No frames, resizing or density normalization are involved.

### Source findings and repair history

1. Existing P3: the shared error toast temporarily obscures actions at1280x720
   (`source/02-failed-1280x720-light.png`) and the heading at320x480
   (`source/02-failed-320x480-dark.png`). Auto/manual dismissal makes recovery
   possible, but the user approved removing this overlap from the active editor.
   Source footer readiness also continues saying “Changes ready to save” while
   the failure is elsewhere. Fix: replace that status with a single inline alert
   directly above actions, suppressing only this active editor's duplicate toast.
2. P2 found in first browser iteration: four role/status/profile failure cases
   lost Save focus after its pending disabled state (24/28 passed). Evidence:
   `iteration-1-focus/status-error-context.md` and `status-failed-focus.png` under
   the audit directory; `verified/` is pre-repair, not final acceptance evidence.
   Fix: when an open editor's failed save completes and focus is on document
   body, restore Save with `preventScroll`. Do not override focus on Close,
   the error region or another actual control. Keep the original focus assertions
   and add a held-response test for deliberately focused Close.
3. A source test that expected toast-only update errors failed after the intended
   presentation change. Its mounted guard remains required; it now also requires
   normalized inline publication plus the closed/replaced-editor fallback rather
   than weakening the unmount safety contract.

### Implementation boundaries

- `useSettingsManagedDialogs` owns the error and synchronous editor-session
  counter. Every open/close clears error and advances the session, including
  closing/reopening the same account. `publishError` rejects stale sessions.
- `useSettingsManagedUserUpdate` clears current feedback at deliberate retry,
  publishes normalized message/reference for the originating active editor,
  and otherwise retains one notification fallback naming the original target.
  An old success cannot close a replacement editor. Existing list refresh,
  success notification, pending state and API requests remain intact.
- `ManagedUserDialog` replaces readiness with a named `role="alert"` region,
  keyboard focus/scroll access, a real Lucide icon, plain escaped text and an
  optional already-normalized support reference. Save describes the inner error
  text, not merely the outer generic ARIA label. No automatic retry or new
  business validation is introduced.
- Error height is bounded by `min(10rem,25dvh)` with internal scrolling. The body
  remains independently scrollable; header/actions remain outside those scroll
  areas. One local accessibility lint exception documents the focusable static
  alert; no global lint/CSS/Toast/Input/Dialog rules change.
- Existing profile→role→status PATCHes remain sequential, not transactional.
  Copy says “Unable to complete this update”, not “Nothing was saved”, because
  a later failure can follow an applied earlier update. Drafts are not cleared
  on failure; normal explicit Close/Cancel still discards edits as before.

### Required fidelity review

- Typography: existing system-ui/Segoe UI fallback stack, label hierarchy and
  mobile16px/medium14px fields stay. Alert uses14px/20px copy and a compact
  semibold heading; long messages/references wrap without truncating content.
- Spacing/layout:44px fields/actions,8px label gaps,16px grids and existing
  modal maximum width stay. Inline feedback adds only intrinsic footer height,
  with8px separation from the action row. The rest of the dialog is not restyled.
- Color/tokens: existing primary actions, neutral surfaces and amber access
  warning stay. Alert uses semantic destructive border/tint with readable body
  text, explicit wording and an icon rather than color alone.
- Assets: project Q logo and other assets unchanged. No ImageGen, handcrafted
  artwork, inline-SVG substitutes, new library, dependency or backend migration.
- Copy: original labels/actions/permissions stay; error message/support reference
  reuse existing normalization. Active-editor failure is announced once instead
  of duplicated inline+toast announcements. Closed-editor fallback is deliberate.

### Checks and evidence limits

Final typecheck and production build passed after the focus repair, including
status/CSP and production sourcemap checks. Changed client lint and budget,
breakpoint/color/spacing, secrets, hygiene and whitespace gates passed. The
upstream PostCSS `from` warning remains; no new build failure is introduced.

Fixtures reject off-origin/unexpected API calls and collect page/console errors;
deliberate500/409 resource failures are narrowly asserted. Snapshot tolerances
are unchanged. Full WCAG/assistive technology, physical iOS keyboard, remote CI,
production deployment and broad security certification are not claimed.

### Post-repair evidence and result

The final built app was recaptured in `final/` after the focus repair. All eight
`01-open-*` PNGs are byte-identical to their source counterparts, confirming no
unrelated normal-state restyling. Representative desktop-light/mobile-short-dark
open pairs and all sixteen failed full-view/footer pairs were opened together
in the same comparison inputs. No actionable P0/P1/P2 visual finding remains.
Header/Close and action labels stay readable, regular messages do not obscure
actions, and footer padding/icon/text alignment is consistent across both themes.

Exact focused pixels (both themes, DPR1): desktop1280 and tablet768 footer
670x97 source→670x143 final; mobile320 (both heights)302x97→302x163. This is
intentional intrinsic error-copy height, not a density mismatch. Full-frame
pixels remain equal to the listed CSS viewports. `final/states.json` measures
all48 fields at44px and records the actual dialog ARIA tree/font metrics.

Additional keyboard-stress evidence was captured and opened:
`long-error-keyboard-light.png` and `long-error-keyboard-dark.png` in the audit
directory (320x480). A visible inset ring identifies the scrollable error area;
PageDown advances long unbroken text while header/actions remain fixed. These
synthetic untrusted-message stress states are additional QA evidence, not a
production visual target or a source state that was never captured.

- Settings/Backup source/unit suite:256/256 passed after updating the intended
  feedback contract and adding focus-restoration coverage.
- Final built-browser run:41/41 passed with one worker using
  `Managed account|Late account update|Long untrusted account|cannot load Account|More keyboard|Details confirmation`.
  Covers exact profile/role/status PATCHes and pending guards, current-editor
  500/409 inline-only failures, immediate explicit retries, normalized nullable
  fields, old failures/successes after close/switch/same-account reopen,
  Close-focus preservation, Save-focus recovery, error-description ARIA,
  long literal HTML-like messages, normalized/rejected support references,
  actual keyboard scrolling and role-denied API access.
- Full typecheck/build passed after the repair; changed client files/tests lint
  clean. Bundle/secret/hygiene/whitespace gates passed again on the final build.
  Earlier breakpoint/color/spacing contracts also passed; no shared token edit
  was made afterward. No snapshot baselines or thresholds were changed.

The previous P3 is resolved for a failure in its still-active originating editor.
Success notifications and the deliberate closed/replaced-editor fallback still
use the existing shared notification system; this is not a claim that every
notification in SQR has been redesigned or can never overlap another surface.

Checklist: fresh source capture, scoped implementation, P2 focus repair,
matched full/focused comparison, escaped untrusted text/reference checks and
all listed tests completed. No new API, permission, database or dependency work.

Final result: passed

No actionable P0/P1/P2 remains in this approved inline-error scope. No commit,
push or deployment performed for this scoped continuation.
