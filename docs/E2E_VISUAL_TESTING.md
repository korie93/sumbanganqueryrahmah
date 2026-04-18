# E2E and Visual Testing

The reviewed browser smoke source of truth is [scripts/ui-smoke.mjs](../scripts/ui-smoke.mjs).

## Critical journey coverage

The Playwright-backed smoke flow already exercises the highest-value authenticated path:

- login, including optional 2FA verification
- desktop and mobile navigation checks
- import flow
- collection daily and collection record mutation flows
- backup and restore UI flow
- logout and cookie/session cleanup

Run it against an existing server:

```bash
npm run test:e2e:critical
```

Run the CI-style local sequence that builds, boots a reviewed local runtime, then executes the same smoke journey:

```bash
npm run test:e2e:ci-local
```

## Visual-smoke groundwork

The repo keeps visual checks opt-in so the default CI path stays fast and stable.

Run:

```bash
npm run test:visual:smoke
```

This reuses the same smoke flow but enables `SMOKE_CAPTURE_VISUAL_BASELINES=1`, which writes success-path screenshots into `SMOKE_ARTIFACTS_DIR` for:

- `login-page.png`
- `authenticated-home.png`
- `collection-daily.png`

These artifacts are intended as reviewed reference captures for manual regression comparison or future screenshot diff automation.

## Maintenance notes

- Keep new browser journey checks inside `scripts/ui-smoke.mjs` unless a separate flow has a clearly different runtime contract.
- Prefer artifact capture over brittle snapshot assertions when a UI surface is still expected to evolve frequently.
- If screenshot diffing is added later, keep it opt-in or on a dedicated workflow so it does not destabilize the main CI gate.
