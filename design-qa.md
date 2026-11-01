# SQR dark login illustration — 2026-11-01

final result: passed

Scope: the supplied illustration appears only on dark login. Light keeps its
original illustration; layout, dimensions and workflow stay the same. This is
visual/layout acceptance, not a claim that full CI or PageSpeed passes.

## Visual truth and normalization

- Source artwork: `C:/Users/Administrator/Downloads/1000327789.png`, 1359×1157px.
  It specifies the image, not a new full-page login design.
- Light-layout truth: the existing light login and its unchanged 1280×720 visual
  baseline. Real light/dark pages were compared at the same CSS viewport and state.
- Implementation screenshots: under
  `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/public-theme-20261101-v9/visual-receipt-adaptive-browser-3e5de05209c8/`:
  `public-theme-continuity-Sh-486cf-t-changing-layout-at-1440px-chromium/login-dark-artwork-1440.png`
  and `login-light-artwork-1440.png` (1440×900px, deviceScaleFactor 1).
- Full-view combined input, rendered and opened for review:
  `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/login-dark-artwork-20261101/comparison-board.png`
  (2600×900px). It places the original artwork beside the two real pages with
  preserved aspect ratios and explicitly labels the different source scope.
- Focused original-resolution captures were also opened at 320×900, 722×900,
  1440×900 and the 1280×720 dark snapshot. These avoid judging controls solely from
  the reduced comparison board. The page content is the same synthetic logged-out
  BM form, with reduced motion and a stable synthetic health response.

## Findings and iteration

- Earlier P2: the initial supplied-image rendering on the charcoal panel exposed
  a rectangular image boundary, particularly in the narrow layout.
  Fix: match the dark brand panel to the supplied night matte (`#010109`), retaining
  scoped edge masking and the original image frame. No light CSS geometry changed.
- Post-fix v9 captures show the supplied blue glow, natural skin/hair and dark
  setting without inversion or multiply/screen recoloring. The prominent rectangle
  from the initial v8 capture is resolved. The full scene remains recognizable
  within the same existing responsive artwork slot.
- No unresolved P0/P1/P2 visual or layout finding in the reviewed scope.

## Validation

- Supplied PNG exported as WebP at the original dimensions; 1,357,803 → 89,032
  bytes. No resize, crop, redraw or recoloring. Pixel comparison PSNR 44.22dB.
- Three real-browser comparisons at 320/722/1440px verify panel, logo, artwork,
  form, input and button boxes within 1px across themes, with identical pseudo
  element sizing/position/insets. No horizontal overflow.
- Opposite OS preference cases verify the explicit theme wins before React and
  only the selected artwork is requested/preloaded. Dark filter is none and blend
  is normal. The original light file and existing workspace theme hook are unchanged.
- Eight selected continuity/OTP/loader/artwork cases pass, including contrast and
  error states at 320/1440px. Both final light/dark snapshots pass, with original
  tolerances. Production frontend build, 102 related tests, lint and focused types
  pass. v9 and v10 emit the exact same frontend archive.

## Remaining limits

Full repository/CI suites and full-project typecheck are not claimed as locally
completed. The earlier strict PageSpeed failure remains disclosed in
`CODEX_CONTINUATION_HANDOFF_PUBLIC_THEME.md`; it was not rerun for this final asset
replacement. No production deployment or account access performed. Commit/push
was subsequently requested after this QA; consult Git history for publication status.
