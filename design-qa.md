# Reset and Forgot password themed illustrations — 2026-11-03

final result: passed

## Latest adjustment — remove the Forgot heading icon (v5)

The small decorative icon immediately above the Forgot heading is removed.
`ForgotPassword.tsx` no longer passes the optional icon and its unused import is
removed. The genuine SQR brand logo is retained. The shared shell already omits
the icon wrapper when no icon is provided, so its space is reclaimed naturally.
V5 source snapshot is
`fad5a8426a66a1d927367c2421bf53a3ae7c07291a04fba8fce88c60c825a5ff`.

- Scoped lint, frontend build/budgets and both existing Forgot browser cases
  passed on v5. `V5_QA_SUMMARY.json` records exact receipts and proves that only
  `ForgotPassword.tsx` changed from v4; the other 3,524 source files are identical.
- Four final ready captures: `visual-receipt-adaptive-browser-2162a749e241/`,
  desktop 1440x900 and phone 320x1000 in both palettes, density 1. PNG dimensions
  follow the natural full-page document height and are recorded in `images.json`.
- Three `comparison-v5-forgot-ready-*` boards match v4 desktop light/dark and
  mobile dark at the same state, viewport and density. Mobile light is an extra
  final capture, with no invented baseline. DOM checks confirm icon=0, SQR brand
  logo=1, heading=1. Toolbar positions are unchanged; heading and identifier move
  up by the same intentional 59px. Both reviewers opened all four final views:
  no leftover empty block, distorted illustration or actionable P0/P1/P2 issue.
- The initial WSL startup failure was recovered by a bounded engine restart
  after confirming that only the stopped QA distro existed. It occurred before
  target execution; no application failures or isolation bypass were accepted.
  Initial infrastructure evidence is retained separately. No target execution was
  moved onto the host. The native 38-check pass below belongs to v4 and was not
  repeated for this optional decorative-prop removal. Full CI remains separate.

## Current sizing correction — v4

The Forgot illustration now uses the existing wider artwork track and a larger
responsive frame. Tablet art is centered; mobile has a larger slot that clears
the logo. Form, navigation and confirmation positions remain unchanged in the
eight matched before/after comparisons. No actionable P0/P1/P2 findings remain.

Only `client/src/components/auth/AuthV17Layout.css` changed in this correction.
The final source manifest is SHA-256
`43d007908fb56d2f3b95d87c780b7dac71f19d281730525ff7a1a7730d037587`.
`V4_CSS_ONLY_DELTA.json` proves the other 3,524 source files are byte-identical
to the prior verified v2 source. Assets, controllers and tests were not changed.

### Findings and iteration history

- Resolved P2: the user reported that Forgot art was too small compared with the
  previous scene. The matched 1440px comparison showed the 640px cap, narrower
  track and the new image's internal background margin reducing visual weight.
  The original wider track is restored and both 640px CSS caps are removed.
- Rejected v3: its screenshots exposed another P2 because bottom alignment put
  tablet art too low. V3 receipts and `comparison-v3-*` boards remain available;
  their passing automated checks were not treated as visual acceptance.
- Accepted v4: tablet composition is centered again. At widths >=1201px and
  heights >=761px, a bounded 115% frame uses the source's empty upper canvas to
  enlarge the scene. The existing art boundary can hide that empty margin;
  the blue background shape, warning, person, phone, plant and ground remain
  visible in both tested desktop palettes. Short screens use the normal frame.
- Mobile width is bounded by 56vw, 260px and logo clearance. At 320px the square
  scene grows from approximately 134px to 168px without increasing header height.
  At 1440x1000 the contained square grows from 640px to approximately 836px.

### Current visual evidence

Evidence root:
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-reset-illustration-20261102/`.

- Baseline v2: `visual-receipt-adaptive-browser-7607bf8a06e1/`.
- Final v4: `visual-receipt-adaptive-browser-5b6e02c3a5b8/`.
- Eight matched pairs cover ready/submitted at light 1440px and dark 320px,
  plus ready at 768/1024px in both palettes. Their CSS viewport height is 1000px,
  density 1. All matched toolbar/title shifts are zero. Desktop/tablet images
  are their viewport width by 1000px; mobile ready is 320x1080 and submitted is
  320x1000. Longer content is naturally scrollable, not scaled to fit.
- Four extra final captures cover ready at 1440x900 and 1440x600 in both themes,
  also density 1. Full-page height follows document content, including the short
  desktop's scrollable form. Recorded PNG dimensions/hashes are in `images.json`.
- Opened all eight `comparison-v4-forgot-*.png` boards and all four extra actual
  screenshots. Boards place original screenshots side by side at native pixel
  scale. `FORGOT_CAPTURE_COMPARISON_V4.json` and
  `FORGOT_COMPARISON_BOARDS_V4.json` retain source, geometry and image metadata.
- Independent review opened the desktop, tablet and phone comparisons, including
  both 900px and 600px desktop palettes: no actionable P0/P1/P2 issue found.

### Fidelity and interaction checks

- Typography: existing fonts, weights, labels, wrapping, language and copy are
  retained; form controls and titles stay on their original rails.
- Layout: the illustration is larger within the existing panel, without changing
  form width or introducing horizontal overflow. Tablet placement is balanced;
  mobile art clears the SQR logo and tagline. Full-scene details are legible in
  the actual desktop captures, so a further magnified crop was not required for
  this placement-only correction. Prior original/derivative focused asset boards
  below remain valid because the files are unchanged.
- Colors: existing selected light/dark artwork and surface tokens are retained.
  No filters, recoloring or replacement images were added.
- Asset fidelity: original compositions remain recognizable and undistorted.
  Mild raster softness at the largest size is a non-blocking P3 follow-up; the
  unchanged 640px derivatives were not replaced or re-exported in this correction.
- Accessibility/content: the decorative semantics, reserved dimensions, keyboard
  controls, generic recovery confirmation and retained input are preserved.

### Current verification

- Scoped lint and production frontend build/budgets passed on the final v4 source.
- Both existing Forgot illustration browser cases passed unchanged, covering
  palette swaps, retained input, responsive geometry, submission, confirmation,
  keyboard Edit behavior, return navigation and unchanged Login artwork.
- Original native authentication verifier: 38/38 passed. Receipt:
  `v17-receipt-adaptive-browser-65bdb776b1a2-verified.json`.
- All final receipts have exit code 0, no resource-budget failure and the same
  v4 manifest hash. Target execution remains isolated, synthetic and loopback-only
  under the existing sandbox; no dependencies were downloaded.
- No new tests were added for this reversible CSS correction. The earlier 67
  unit/contract tests and strict changed-root typecheck below describe v2; they
  were not rerun or represented as fresh v4 results. Full CI and physical-device
  testing remain separate checks. No commit, push or deployment occurred during
  those QA runs.

The sections below record the prior combined v2 implementation and verification.
Its passed report is archived as `design-qa.v2.md` in the evidence root; it does
not stand in for verification of this sizing correction.

Approved scope: integrate the user's two original light/dark illustrations into
the existing Reset and Forgot pages, with a sound responsive layout. Authentication, metadata,
validation, focus, navigation and theme preferences stay owned by their existing
controllers. Login and Activation retain their existing artwork/presentation.

## Visual truth and assets

- Light original: `C:/Users/Administrator/Downloads/1000328401.png`, 1254x1254,
  SHA-256 `806fab7945dacc865810adf803f84a8a31df4263a7039790be77f6020abfbee4`.
- Dark original: `C:/Users/Administrator/Downloads/1000328400.png`, 1254x1254,
  SHA-256 `57b91f802c0f557d6da62157f129812bd90f021e64d62a1b90dffbdc9083d93c`.
- Both originals were opened and inspected. They are opaque artwork; the light
  edges are near-white and dark edges near #050d19. The illustrated context panel
  uses the corresponding backing to avoid an unintended contrasting image box.
- Production derivatives: `client/public/illustrations/reset-password-light.webp`
  and `reset-password-dark.webp`, each 640x640, exported at quality 0.95 using the
  already-installed Chromium encoder inside the isolated sandbox. Only full-frame
  proportional resizing and encoding were performed; no redraw, crop or recolor.
- File sizes: 36,890 and 29,226 bytes (66,116 combined versus 2,652,430 original
  bytes). Decode comparison against the identically resized original measured
  PSNR 39.71/40.87dB and zero alpha difference. Export provenance, hashes and
  promotion checks are in `ASSET_EXPORT_RESULT.json` beside the QA receipts.

## Page comparison evidence

Evidence root:
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-reset-illustration-20261102/`.

- Source layout: immutable invalid-focus v3 frontend, source SHA-256
  `3f63f11b16b6b4d4f8c7d8b3dcccdd1dd6f9383aba949ed5b304848b031eb19c`.
  Before capture: `visual-receipt-adaptive-browser-bbfc6672cb91/`.
- Combined final implementation: illustration v2, source SHA-256
  `eede0cb3d34da78993ee0988df541ef71c4bd87c22bbf0d9aab85dff5ba6b3b8`.
- Reset v1 screenshot folder: `visual-receipt-adaptive-browser-89120b135f3e/`.
  It records the first verified Reset pass; the same Reset source is preserved
  in the combined v2 implementation. Final v2 Reset capture is
  `visual-receipt-adaptive-browser-a89b48fe78d9/`.
- Six matched ready-state captures use both themes at 320, 768 and 1440px CSS
  widths, height 1000px, deviceScaleFactor 1. Full-page screenshots keep natural
  content heights and are not stretched. The original assets are the visual truth
  for artwork; the before page supplies the retained typography/form/layout truth.
- Intended difference: desktop artwork sits within the existing context column;
  mobile uses a 104px square alongside the context copy, with brand and security
  guidance spanning the row. The new mobile context slot can intentionally move
  the form down slightly; theme swaps must preserve its geometry.
- Inspected all six final images and four matched full-view boards:
  `comparison-v2-reset-ready-light-1440.png`,
  `comparison-v2-reset-ready-dark-1440.png`,
  `comparison-v2-reset-ready-light-768.png`,
  `comparison-v2-reset-ready-dark-320.png`.
- Focused asset comparisons: `comparison-illustration-slot-light.png` and
  `comparison-illustration-slot-dark.png` show the supplied original proportionally
  scaled to the measured slot beside a native-scale crop from the verified page
  screenshot. Original 1254x1254 pixels, derivative 640x640 pixels and rendered
  square slot dimensions are explicitly distinct; no stretched/cropped artwork
  or double-density screenshot is being compared.
- Tablet/desktop PNGs are 768x1000 and 1440x1000. Mobile full pages change from
  320x1285 to 320x1308 for the requested compact context slot. Document toolbar
  and title positions are unchanged at 768/1440px; at 320px both move by the same
  intentional 23.390625px. Palette swaps preserve page/field geometry.

## Implementation and interaction

- `CredentialRecoveryLayout.tsx`: reset-only opt-in illustration, decorative
  semantics, explicit 640x640 dimensions and a single image source derived from
  the existing `useTheme().isDark`. A stored explicit theme takes precedence over
  the system palette. Only the image element changes identity on a theme swap.
- `CredentialRecoveryLayout.css`: contain sizing, reserved square aspect ratio,
  matching panel backing, existing desktop width and compact mobile grid.
- `ResetPassword.tsx`: enables the illustration on its existing recovery shell.
- `credential-recovery-layout.test.ts`: verifies opt-in scope, one decorative
  sized image outside the form, and unchanged Activation/default presentation.
- `public-auth-reset-illustration.spec.ts`: six synthetic browser cases for
  selected palettes at 320/768/1024/1440px, non-overlap, loaded image ratio,
  theme-swap geometry and retained values, invalid/retry/success states, and a
  real Activation page without the new illustration, plus the Forgot form and
  submitted confirmation flows described below.

## Findings and iteration history

- The originals' opaque backgrounds would contrast with the prior context
  surface. Matching the illustrated panel backing is deliberate and scoped.
- Four new image cases passed. The first Activation regression attempt was
  blocked by a missing `/activate-account` document in the isolated static-server
  allowlist. The exact existing public route was added to the test harness only,
  then that case passed. Application code, test source and assertions did not
  change. The failed receipt and `HARNESS_CORRECTION.json` retain that history.
- Rendered full and focused comparisons found no actionable P0/P1/P2 issue in
  the approved scope. No visual correction was required after the first match.
  Natural two-line context heading wrapping at 320px and the extra compact
  artwork footprint are intentional responsive differences, not clipped content.

## Forgot page extension

- Forgot baseline: immutable illustration v1 frontend, which still used the
  existing computer illustration on Forgot. Source SHA-256
  `c2be390055060680288ddaf160855e5739db9459fbd02fe91710a21098b5f4a8`;
  before images: `visual-receipt-adaptive-browser-0dc1257a9e80/`.
- Final Forgot images: `visual-receipt-adaptive-browser-7607bf8a06e1/`. Four
  matched captures cover ready/submitted at light 1440x1000 and dark 320x1000
  viewports. Four additional ready captures cover 768/1024px in both themes.
- Density is 1 throughout: desktop, tablet and confirmation PNGs are their CSS
  viewport widths by 1000px; the mobile ready full-page PNG is 320x1080 before
  and after. This longer document is naturally scrollable; no image was stretched
  to fit a viewport-height screenshot.
- Opened all eight final Forgot images and four combined matched boards:
  `comparison-v2-forgot-ready-light-1440.png`,
  `comparison-v2-forgot-ready-dark-320.png`,
  `comparison-v2-forgot-submitted-light-1440.png`,
  `comparison-v2-forgot-submitted-dark-320.png`.
- The desktop scene sits in the existing brand/art region with contain sizing.
  Mobile places a compact image on the right, clear of the original SQR logo.
  The form, navigation, title and confirmation positions remain unchanged across
  all four matched captures. Theme-swap form geometry is browser-tested.
- Mid-width review explicitly checked whether the existing curved decoration
  obscured the artwork. The actual 768/1024px captures show the person, phone,
  plant and ground intact; no corrective code or visibility threshold was needed.
- `AuthV17Layout.tsx` gains an opt-in `recoveryArtwork` presentation flag, passed
  only by Forgot. Scoped CSS uses the supplied matching backdrop and disables
  the old decorative pseudo artwork for that flag. A single decorative image
  follows the already-selected theme. Login retains its original artwork.
- The existing illustration browser spec now has six cases: four Reset and two
  Forgot. The new Forgot cases verify image loading, responsive placement,
  preserved identifier/theme, approval-aware generic confirmation, returning to
  the retained form, and unchanged Login artwork.
- Independent visual review of both Reset and Forgot comparison sets found no
  actionable P0/P1/P2 issue. Image compression/resampling softness is acceptable
  at the actual display sizes; no full composition is cropped or distorted.
- Final combined v2 Reset images and matched boards were also opened:
  `comparison-v2-reset-ready-light-1440.png`,
  `comparison-v2-reset-ready-dark-1440.png`,
  `comparison-v2-reset-ready-light-768.png`,
  `comparison-v2-reset-ready-dark-320.png`. All six final Reset screenshots retain
  the same composition as the first pass. `CAPTURE_COMPARISON_V2.json` and
  `FORGOT_CAPTURE_COMPARISON_V2.json` record ten matched pairs plus four extra
  Forgot mid-width captures; all paired form/title/control geometry remains as
  expected for the requested responsive illustration slots.

## Required fidelity surfaces

- Typography: existing fonts, size/weight hierarchy and form copy are preserved;
  full and focused comparisons show readable labels and consistent field/title
  alignment. Context text wraps naturally within the mobile grid.
- Spacing/layout: no artwork enters the password form; responsive containment
  and stable square boxes are browser-tested. Existing desktop/tablet form tracks,
  padding and controls remain aligned. No horizontal overflow was found.
- Colors/tokens: theme-specific originals are used directly, without filters;
  existing form, feedback, focus and primary-action tokens remain.
- Asset quality: full original compositions are preserved at the intended aspect
  ratio. Original, derivative and final in-page crops were opened and compared.
  The light/dark backing follows the supplied files; subtle original background
  texture is retained. No replacement logo, icon or decorative drawing was
  introduced. The illustration remains a secondary visual at mobile width.
- Copy/content: existing state descriptions, safety guidance, validation and
  generic recovery confirmation remain intact. The image is decorative and adds
  no screen-reader announcement or keyboard stop.

## Verification and handoff

- 67 selected unit/contract tests passed.
- Scoped lint, strict changed-root TypeScript (16 roots), production frontend
  build, existing bundle budgets and sourcemap checks passed.
- The combined final source passed all 24 browser cases: six illustration cases,
  four invalid-field focus cases, ten recovery feedback/resilience cases and four
  existing controls cases. All 15 browser-group receipts have exit code 0, no
  budget failure and the same final source manifest hash recorded above.
- The original native authentication verifier passed all 38 checks on the same
  final source. Receipt: `v17-receipt-adaptive-browser-af03614292d0-verified.json`.
  This includes real page controllers with synthetic API responses, keyboard
  submission, MFA, Forgot, Reset and strict CSP/Trusted Types checks.
- Final frontend: 506 files, 6,733,409 uncompressed bytes, archive SHA-256
  `ef5d6ce28466fafd658013a28cd76af16e85905faa9852e465561a4578681828`.
  The earlier Reset-only pass is retained as historical evidence; acceptance
  uses the final combined v2 source and its receipts.
- Source and toolchain are read-only during target execution in the existing
  WSL/bwrap sandbox: isolated loopback, no external network, explicit safe env,
  scratch-only writes, bounded CPU/memory/process/file/disk/time resources and
  parent-verified artifact promotion. All identities and API data are synthetic.
- Product Design uses the supplied artwork and existing code target. MagicPath
  read-only lookup found no active project; no Figma destination was supplied.
  No remote canvas/file was created or modified. Previously authorised sandbox
  Playwright supplies local browser evidence because Browser Codex could not
  initialise in this environment.

Full repository typecheck, the complete GitHub pipeline, physical-device keyboard
testing and complete WCAG certification are outside these scoped checks. Prior
uncommitted recovery work is retained, with its QA report archived externally as
`design-qa.prior-invalid-focus.md`. No backend, dependency, database or production
configuration changed. These checks did not deploy to production. The user
requested commit and push after the final QA pass; deployment remains separate.
