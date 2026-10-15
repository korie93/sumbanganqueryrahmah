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
