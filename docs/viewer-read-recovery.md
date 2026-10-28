# Viewer read recovery

Viewer offers an explicit retry for recognized temporary read failures. It keeps
the failed request's import, target page, cursor, page size, search and a copy of
its column filters. Retrying does not reset the user's column order/visibility,
search or filter controls. Existing shared API GET retries remain unchanged; no
new automatic retry loop or cached result pages are added.

The error and retry button remain mounted while that retry is pending. The
button is disabled and existing polite loading feedback is used; the error has
its own alert semantics. Back to Saved stays available. Controller refs prevent
duplicate retry before a pending render. Only the active mounted request for
the current ready query may commit results or release loading state.

Changing raw search, semantic active filters, import, page size or cleared state
invalidates old retry eligibility immediately, including before debounce settles.
Failed rows/counts are cleared and new exports require a successful current read.
Access denials, malformed responses, aborts and unknown errors are not retried by
this control. The existing authorization/session controls still govern requests.
Viewer is keyed by authenticated account and role to reset ownership on change.

Leaving the route aborts pending reads; a late response cannot update another
file. Cursor history advances only after successful reads, so a failed Next/Prev
can retry its actual target rather than the last successful page. Only one small
failed request descriptor is retained in component memory; no persistent storage,
backend, API contract or dependency changes are introduced.
