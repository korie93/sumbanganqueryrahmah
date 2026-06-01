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

## P4-1 Large Component Decomposition

| Component | Current role | Safe extraction boundary |
| --- | --- | --- |
| `client/src/pages/Login.tsx` | Public auth shell and form orchestration. | Visual-only panels, header, footer, password-toggle, locked alert, and secondary actions now live in `LoginParts.tsx`. Login keeps state, timers, field ownership, test IDs, and submit flow. |
| `client/src/pages/ActivateAccount.tsx` | Activation token validation and password form orchestration. | Status cards, icons, activation form, and actions now live in `ActivateAccountParts.tsx`. Abort-controller ownership and redirect timer cleanup remain in the page. |
| `client/src/pages/dashboard/DashboardChartsGrid.tsx` | Chart layout and retry orchestration. | Tooltip, legend, period selector, loading state, empty state, and compact hour formatting now live in `DashboardChartsGridParts.tsx`. Recharts data preparation and retry behavior remain in the grid. |
| `client/src/components/Navbar.tsx` | Navigation shell and route state ownership. | Brand cluster and user menu dropdown now live in `NavbarParts.tsx`. Route state, focus restoration lifecycle, mobile drawer state, and overflow tracking remain in the navbar shell. |

Line-count result after extraction:

| Component | Lines |
| --- | ---: |
| `client/src/pages/Login.tsx` | 300 |
| `client/src/pages/ActivateAccount.tsx` | 250 |
| `client/src/pages/dashboard/DashboardChartsGrid.tsx` | 257 |
| `client/src/components/Navbar.tsx` | 258 |

The extraction is intentionally behavior-neutral: source contracts now inspect the extracted parts where visual markup moved, and timer/focus ownership remains in the original orchestration components.
