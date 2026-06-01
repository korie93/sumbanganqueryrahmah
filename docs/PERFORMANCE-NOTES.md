# Performance Notes

Last reviewed: 2026-06-01

## P4-3 useLatestRef Audit

The current `useLatestRef` footprint is intentionally small: seven call sites across two runtime areas.

| Area | Instances | Finding | Decision |
| --- | ---: | --- | --- |
| `client/src/components/AutoLogout.tsx` | 5 | Long-lived activity, heartbeat, and socket listeners need stable callbacks while still reading the latest logout and timer behavior. Removing these refs would increase listener churn or risk stale closures around logout and heartbeat cleanup. | Keep. Necessary for lifecycle safety. |
| `client/src/hooks/useSystemMetrics.ts` | 2 | The polling loop needs the latest options and polling state while an async poll is in flight. These refs avoid restarting the polling effect for every snapshot update. | Keep. Necessary for polling stability. |

Audit result: 7 necessary instances, 0 optional removals.

Do not remove `useLatestRef` from these areas without profiling and lifecycle tests that cover timer cleanup, visibility changes, unmount during async work, and forced logout.

## Large Component Decomposition Notes

The next safe decomposition candidates remain:

| Component | Current role | Safe extraction boundary |
| --- | --- | --- |
| `client/src/pages/Login.tsx` | Public auth shell and form orchestration. | Extract visual-only sections only after updating source-contract tests that currently inspect stable login markup and test IDs. |
| `client/src/pages/ActivateAccount.tsx` | Activation token validation and password form orchestration. | Extract status panels and form fields without changing abort-controller ownership. |
| `client/src/pages/dashboard/DashboardChartsGrid.tsx` | Chart layout, tooltips, and retry sections. | Extract chart cards and tooltip renderers while preserving Recharts props. |
| `client/src/components/Navbar.tsx` | Navigation shell and action controls. | Extract mobile/desktop sections separately so route state ownership stays centralized. |

Because this release set is documentation/configuration-focused, runtime refactors should remain in a dedicated visual-regression PR rather than being bundled with dependency and release-readiness changes.
