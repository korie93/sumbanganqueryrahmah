# Viewer rows per page

On opening Viewer, card layout starts with 25 rows. Desktop table layout retains
the configured size (bounded 10–500) and existing fallback of 100, or 40 in low
spec mode when no configuration is available. The initial layout is captured
once; resizing changes presentation without changing the page size, current
page, selection or API query. Desktop configuration arriving after the first
render is still applied until the person explicitly chooses a page size.

A native, labelled Rows per page selector sits beside pagination, offering 25,
50 and 100. A custom configured desktop value remains visible as the current
option. Choices stay local to this Viewer instance; they are not stored across
accounts. The selector is disabled while loading a page or exporting Excel/PDF.

Explicitly changing the size clears row selection and refetches page one without
an old cursor. Search, column filters and visible/reordered columns remain in
place. Import identity changes still reset import-specific state. Existing
request cancellation and latest-request guards reject stale responses. Search
continues to query the server dataset, including records beyond the current
page. Full exports keep the configured batch size rather than issuing more
requests because fewer cards are shown; export semantics and server permissions
are unchanged.

Verification: Viewer unit/markup tests, `viewer-page-size.spec.ts` for card/desktop
defaults, cursor navigation, resize stability, native keyboard selection and
server search/filter preservation. `viewer-deferred-fields.spec.ts` explicitly
selects 100 rows to retain its 100×43 stress fixture. This reduces initial row
rendering; it does not promise a fixed reduction in Chrome memory.
