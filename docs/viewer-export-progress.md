# Viewer export progress

The existing compact export status now reports two real phases:

- `Mengambil rekod: 100 daripada 237` counts rows appended after each successful
  cursor response, starting at zero for a paged export. It does not count a
  request before its response is accepted or simulate a percentage. If the
  actual count exceeds the initial query total, only the actual count is shown.
- `Menyediakan fail CSV…`, `Menyediakan fail Excel…` or `Menyediakan fail PDF…`
  begins after the required rows are ready, before loading the format module.
  Current-page and selected-record exports start directly at this phase.

The status retains its polite live region and now announces the whole message
atomically. No new progress bar, panel, animation or dependency is introduced.

The existing synchronous owner lock covers all formats. Each progress and phase
update checks mounted state, current owner and current export eligibility.
Cancellation, unmount, dataset change or debounced query/filter change aborts
the export and clears the status. A cancelled owner's late response or finalizer
cannot overwrite a replacement export or trigger its download. Empty results
and failures also clear the matching status and allow retry. Export scope,
columns, filenames, batch size, file generation and backend APIs are unchanged.

Cancellation stops pending reads/downloads; it cannot interrupt JavaScript file
generation while that synchronous work occupies the browser's main thread.

Validation evidence and continuation instructions are linked from
`docs/viewer-export-progress-continuation.md`. Tests use fictional records and
the real compiled frontend inside the existing enforced local audit sandbox.
