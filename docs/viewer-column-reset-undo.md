# Viewer column reset undo

Open **Columns**, then choose **Reset** to restore the dataset's original column order, show all columns, and clear the desktop pin. If the layout changed, the same Columns popup or mobile sheet displays **Column layout reset.** and an **Undo** button. The notice is a polite, atomic status message; the button's accessible name is **Undo column reset**.

The empty status region is already mounted while Columns is open. Reset updates its text so assistive technology can detect the change.

**Undo** restores the order, visible fields, and pin captured immediately before Reset. It can be used once. Resetting an untouched default layout does not create a notice, and choosing Reset again while the layout is already reset preserves the original snapshot. The notice has no timeout. Closing and reopening Columns in the current Viewer keeps the pending action available.

An effective later column visibility, order, **All**, **Min**, or pin change discards the pending snapshot. Actions that leave the layout unchanged preserve it. Searching column names, searching rows, selecting rows, changing row density, and paging through the same dataset do not consume Undo. Reset and Undo retain the current search, row selection, density, and page. Existing search and page navigation can still perform their normal data reads.

The snapshot exists only in the currently open Viewer. Changing the dataset or its headers, or leaving Viewer, clears it. Column order and visibility continue to use the existing per-dataset browser preferences; Undo writes the restored preferences through the same path. Pin state stays in memory and has controls only on desktop viewports at least 768px wide.

Reset and Undo use the currently loaded column state. They add no requests, endpoints, dependencies, timers, or export behavior. The action lives inside Columns so that it remains reachable while the mobile sheet traps keyboard focus. Existing Malay column-search and selection labels remain unchanged.

## Browser regression coverage

`tests/visual/viewer-column-reset-undo.spec.ts` contains four cases, each with a 60-second timeout:

- **Viewer column reset undo: desktop keyboard restores order visibility and pin once after closing and reopening Columns** — moved and hidden fields, active pin, default reset, English status semantics, popup reopen, keyboard Undo, persisted order/visibility, and one-level consumption.
- **Viewer column reset undo: repeated and no-op actions retain the snapshot while effective column changes consume it** — untouched default Reset, repeated Reset, no-op All, disabled boundary movement, column search, legitimate server search and page navigation, row selection and density retention, then effective visibility, movement, Min, and pin invalidation.
- **Viewer column reset undo: mobile320 dark sheet keeps the English notice accessible and keyboard Undo within bounds** — 320px dark layout, sheet containment, no horizontal overflow, reachable 44px Undo target, keyboard focus and activation, close/reopen retention, restored card fields, no mobile pin controls, and one scoped serious/critical axe scan.
- **Viewer column reset undo: leaving Viewer and opening another file cannot revive a stale snapshot** — reentering the same file, opening a second file with different headers, and returning to the first file all start without a stale action.

The suite uses 12 fictional records, or 24 records for two cheap 12-row desktop pages, and 43 fields. It uses the shared fail-closed authenticated session fixture, permits only an explicit HTTP loopback origin, blocks WebSockets and off-origin requests, and checks for unexpected requests and browser errors. Local column interactions must leave dataset-read and API GET counts unchanged; search and paging reads are counted before measuring further column interactions. No export operation or real data is involved.

This suite was authored through source reads and edits only. No Windows target runtime, browser, npm command, or test was executed during authoring. These files do not establish a passing browser result; run them through the supported production frontend browser harness and record the result separately.
