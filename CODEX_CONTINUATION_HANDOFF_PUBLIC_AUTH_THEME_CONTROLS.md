# Public auth theme controls and CI fixtures — 2026-11-02

## Scope and status

User approved the three suggestions after deploying `9e01009a`: a compact theme
action on Login, Forgot Password following the chosen theme, and common public
theme fixtures. Implemented and locally verified; check Git status/history for
later publication. Production deployment needs a subsequent user request.

## Changes

- `AuthV17Layout.tsx` reuses the unchanged `useTheme` hook and recovery Moon/Sun
  pattern. Native 44px action beside BM/EN, localized action names and focus styling.
- `ForgotPassword.tsx` only adds a presentation class. Validation, requests, abort
  cleanup and generic response behavior remain untouched.
- `AuthV17Layout.css` shares its existing dark palette across its two consumers.
  Reset/activation retain `CredentialRecoveryLayout`. An inline-size container
  query hides the optional HTTPS badge when header content is at most 420px wide.
- Vite keeps only the exact shared Moon/Sun modules in existing `public-runtime`
  ownership. Original startup request/bundle budgets remain enforced.
- `scripts/lib/browser-theme-fixture.mjs` is test-only: `fixed` deliberately
  reapplies a visual palette, `preserve-choice` seeds once and retains real choices,
  and `system` clears explicit/legacy preference once before OS fallback. Exact
  isolated HTTP loopback origin is required before storage access. Performance
  setup and storage-fault injection use one callback to avoid init ordering races.
- Four core callers migrated: built Landing, landing-next, public theme continuity
  and public brand routes. Other fixtures are not claimed as migrated. Declaration
  files keep strict TypeScript callers checked.
- Twelve behavioral tests and four wiring checks cover both directions, legacy
  removal, explicit modes, origin isolation and denied storage. Four new compiled
  browser cases verify native controls, form state, requests and navigation.

## Verification / continuation

Evidence root:
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/`.

- `auth-theme-controls-20261102-v4/`: final frontend build, unchanged bundle
  budgets and 114 selected tests. Source manifest SHA-256:
  `ca455999b52c14fab1bbda8cb6b033a57535b1ddd1453615ec9d3ecd2a1a7cf5`.
  Compiled root: `/opt/sqr-audit/inputs/auth-theme-controls-20261102-v4-after-frontend/public`.
  Frontend archive SHA-256:
  `0539a690cb7db3e3639baefbf70de87f0b53bac1d53be14d22c9a603a2f2f161`.
- `auth-theme-controls-20261102-v3/`: scoped lint, strict changed-file types,
  eight real continuity cases and three startup cases. Its production TypeScript
  matches v4; the later v4 change only corrects header CSS.
- `auth-theme-controls-20261102-v2/`: four control/form/accessibility cases,
  four OS/storage fallback cases and two public brand cases.
- `auth-theme-controls-20261102/`: 12 paired before/after screenshots and geometry,
  16 final actual HTTPS checks, full 38-check V17 verifier, combined comparisons,
  and subsequent final QA receipts if present. See `design-qa.md` for visual review.

All target execution used the established WSL/bwrap isolation, fictional loopback
APIs and finite resource limits. No downloads, real credentials, production account
requests or database access. Full-project typecheck, full backend/CI suites and a
new strict PageSpeed run are not claimed locally; inspect the later GitHub run.

`useTheme.ts`, auth controllers, backend, reset/activation, source images and
workspace theme controls remain unchanged. Production remains the separately
verified deployed `9e01009a` until the user authorizes a later release.
