# UI smoke: wait for the authenticated WebSocket before document navigation

Verified locally on 2026-10-25 against source commit `41be580ef2fa5853aad523a70f6c1838f26c9aaa` plus the reconnect follow-up below.

## Failure and cause

[CI run 40156964075](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/40156964075), smoke job `121061274106`, failed in **Run UI smoke**, phase **Billing Principal V9 UI flow**. XLSX, PNG and PDF downloads completed. Its strict console assertion then reported:

```text
WebSocket connection to 'ws://127.0.0.1:5000/ws' failed:
WebSocket is closed before the connection is established.
```

Billing deliberately performs full document navigations, including a reload to verify private percentages persist. Waiting for DOM/content load does not wait for the authenticated `/ws` connection. On `pagehide`, `SingleActiveTabGate` synchronously unmounts protected content before releasing ownership. `AutoLogout` correctly detaches handlers and closes its abandoned socket, including one still `CONNECTING`. Chromium itself emits the warning; detaching handlers cannot suppress it.

A minimal real Chromium test reproduced the exact warning using the actual `disposeAutoLogoutSocket` function extracted with the TypeScript AST, a synthetic page with `pagehide` cleanup, and a loopback server withholding the WebSocket handshake. This confirms the mechanism; it does not identify which historical CI navigation emitted the warning.

The first repair was too strict about a subsequent clean socket close. [CI run 40161780076](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/40161780076), smoke job `121075809428`, then failed during **authenticated login** after 881 ms with `SQR smoke /ws socket closed before navigation readiness.` Its failure artifact recorded live authentication/CSRF cookie names, zero failed requests and zero console warnings/errors. The monitoring snapshot succeeded, confirming the failed-session cleanup no longer caused the follow-up login `409`.

`bindAutoLogoutSocket` explicitly reconnects after closure, starting with approximately one second of backoff. The observer rejected immediately instead of allowing that supported lifecycle. The cause of the original native closure is not recorded in the trace; it is not established as an application or server defect. Readiness must require a live replacement, rather than either rejecting every closure immediately or accepting a previously opened but now closed socket.

## Changes

- `scripts/lib/ui-smoke-websocket-readiness.mjs` passively observes Chromium CDP events. Only a matching `101` response for the current document's exact same-origin `/ws` connection establishes readiness. A clean close invalidates that readiness and waits for a replacement within the original 10-second deadline; retries never restart an existing waiter's timer. A permanent closure still times out. Non-101 handshakes and native frame errors remain fatal for the current document, even if another socket subsequently opens. Main-frame document commits invalidate old request IDs and reset that document's failure state; subframes and SPA history changes do not.
- `scripts/ui-smoke.mjs` attaches observation before the first navigation. After login, and before/after intentional document navigation or reload, a live authentication cookie requires socket readiness. Public bootstrap and logged-out pages need no authenticated socket. Existing console assertions remain strict; production socket disposal, tab ownership and security policies are unchanged.
- `scripts/lib/ui-smoke-session-cleanup.mjs` ends only the failed smoke browser context's existing session, after failure evidence capture and before browser shutdown. Browser closure deliberately does not end activity sessions; previously this left the subsequent monitoring login receiving the expected single-session `409`. Cleanup uses the existing context cookies and CSRF token, a bounded request to `/api/activity/logout`, no replacement login, redirects or write retries, and sanitized diagnostics. A cleanup failure preserves the original smoke failure.
- Behavioral helper tests and navigation integration contracts cover these lifecycle boundaries. The Billing reload/persistence assertions and export checks remain intact.

## Local verification

All target execution took place in the Linux sandbox: isolated loopback only, empty allowlisted environment, read-only source/toolchain, scratch-only writes, 1 CPU, 768 MiB memory, 64 tasks, 256 MiB scratch, 8 MiB per file and 120-second wall limit. No production endpoint, account, database or uploaded file was used.

- **57/57 focused tests passed**: readiness events, document generations, rejected/closed/timed-out sockets, clean replacement, unchanged retry deadlines, sticky hard failures, cleanup deadlines and CSRF, navigation contracts, actual Playwright API transport, and existing realtime fixture contracts.
- **Native Chromium regression passed**: negative control produced exactly one native warning while closing a `CONNECTING` socket; guarded document navigation completed without warnings/errors. A synthetic clean server close followed by reconnection stayed pending until the replacement's actual `101`, then succeeded. A separate clean close with no replacement timed out. Across these positive cases there were zero console warnings/errors, page errors or external requests; five real handshakes completed. These fixtures verify observer behavior and do not establish the cause of the historical CI closure.
- Syntax checks for all six changed JavaScript files and scoped ESLint passed; `git diff --check` passed.

Sandbox evidence IDs: `smoke-ws-tests-efe20a6b0686`, `smoke-ws-browser-67b86d85d57f`, `smoke-ws-static-2e4663ef6124`. CI artifact inspection: `smoke-ci-artifact-ae03cedd0f09`. Native harness SHA-256: `c4b9347ea296b0112300ec9051996605ac553fb48b47c51df1013ee02449e8a4`. The external synthetic harness is retained with local verification controls, outside production code.

Run the focused repository tests with:

```sh
node --test --test-concurrency=1 scripts/tests/ui-smoke-websocket-readiness.test.mjs scripts/tests/ui-smoke-session-cleanup.test.mjs scripts/tests/ui-smoke-navigation-contract.test.mjs scripts/tests/ui-smoke-api-transport.test.mjs scripts/tests/frontend-redesign-realtime-browser.test.mjs
```

The full PostgreSQL-backed application UI smoke and remote CI have **not** been rerun for this patch. The next CI run must confirm the complete job. No production deployment was performed.
