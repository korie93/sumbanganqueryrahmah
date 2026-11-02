# Public authentication theme controls — 2026-11-02

final result: passed

Scope: add the approved compact theme action beside BM/EN on Login and Forgot
Password; make Forgot Password follow the shared preference. Preserve the existing
composition, typography, illustrations, form behavior and workspace theme controls.
This is visual/interaction acceptance, not certification of a future GitHub run.

## Visual truth and normalization

The existing compiled SQR screens at `9e01009a` are the visual reference.
`CredentialRecoveryLayout.tsx` supplies the existing Moon/Sun action pattern.
No new design direction, artwork or component library was introduced.

Evidence root:
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-theme-controls-20261102/`.

- Before: `visual-receipt-adaptive-browser-ec128f65e1bf/`.
- Final: `visual-receipt-adaptive-browser-84fc933039d3/`.
- Final HTTPS: `visual-receipt-adaptive-browser-482b262d28dc/`.
- Combined full-view comparisons opened for review: `compare-login-mobile.png`
  and `compare-forgot-desktop-dark.png`.
- Focused combined comparisons opened at native resolution:
  `compare-login-header.png` and `compare-https-header-iteration.png`.
- `LAYOUT_COMPARISON.json` records all 12 paired geometry checks.

Before/after use identical fictional logged-out BM content, health responses,
reduced motion, deviceScaleFactor 1 and 320×1000, 722×1000, 1440×1000 CSS viewports.
PNG widths equal CSS widths; full-page heights are 1000px, or 1080px for the longer
phone recovery form. Comparison boards retain source pixels at 1:1. The desktop
board is 2888×1032px; focused crops keep small controls readable. Final HTTP views
retain the comparison-input geometry. The HTTPS correction is separately compared
at 981×1000px.

## Findings and iteration

- Initial P2: at HTTPS widths 981/1201/1280px, the optional connection badge plus
  new action squeezed the back label onto two lines.
- Fix: make the existing header an inline-size query container. Up to 420px of
  content width, only the optional badge yields; back/theme/language stay present.
- Post-fix evidence: `compare-https-header-iteration.png` and 16 actual HTTPS
  route/theme/width checks at 981/1201/1280/1440px. Wide headers still show the badge;
  controls align without overlap. No unresolved P0/P1/P2 issue.

## Required fidelity surfaces

- Fonts/typography: no family, weight, size, line-height, letter-spacing or content
  change. Same-environment before/after text preserves hierarchy and wrapping.
  Platform fallback differences in exploratory snapshot candidates were not
  adopted as a redesign.
- Spacing/layout: panel, art, form, header, input and language boxes remain within
  1px across 12 matched views. Only the preference group grows by the new 44px
  action and existing 10px gap; it fits the original header height.
- Colors/tokens: light remains unchanged. Forgot Password reuses scoped Login dark
  tokens for input boundaries, readable status colors, focus and selected states.
- Image/icon quality: original WebPs and SQR logos remain unchanged. Dark recovery
  uses the existing night asset in the same frame. Moon/Sun use existing Lucide
  icons, with no drawn substitute, generated artwork or image recoloring.
- Copy/content: auth/help/request copy stays unchanged. BM/EN action names describe
  the destination theme and update after switching. Icons are decorative to AT.

## Interaction and accessibility

Four compiled browser cases cover both themes and eight WCAG A/AA audits at
320/1440px. They verify native Enter/Space, retained visible focus, 44px targets,
localized names, storage/root/surface agreement and refresh persistence. Username,
password and visibility survive switching without login submission. Recovery
identifiers and pending/success/rate-limit states survive theme/language changes,
with exact request counts and return-to-login navigation. Strict CSP, Trusted Types,
page errors and unexpected API traffic remain checked.

Eight existing theme continuity cases also pass, including workspace preference
changes, login/logout, MFA errors, artwork geometry and startup fallback. Three
startup cases retain route isolation/preload behavior. The complete V17 verifier
passes all 38 checks across ten viewports, including request budgets, offline/online,
login, MFA, reset and strict CSP.

Runtime used the reviewed WSL/bwrap sandbox: read-only inputs, isolated loopback,
fictional data, no external network and finite CPU/memory/process/file/disk/wall
limits. Browser Codex could not initialize; previously authorized local Playwright
provided the browser evidence. Full GitHub checks and deployment remain separate.

## Implementation checklist

- Completed: shared action, dark recovery, compact HTTPS header and visual QA.
- Completed: explicit fixed/preserve-choice/system fixtures and behavioral tests.
- Pending separately: full GitHub pipeline after commit/push; production deployment.

No remaining P3 change is required. No backend/auth policy, workspace theme hook,
dependency, animation or CI threshold was changed.
