# Viewer record detail search

Record details has a local Cari medan input for header names. Matching trims the
query, ignores case and treats punctuation literally. It preserves the original
field order and displayed values. Only the authorized supplied headers are
included; the query never searches values or discovers additional row keys.

An active query announces matching/total fields with a polite status. No results
shows Tiada medan sepadan. Clear restores all fields and focuses the input. The
query is owned by the mounted record fields and resets on close or row change;
it is not stored in URLs, local storage or the backend. No extra data requests,
dependency or debounce timer are needed.

Opening the dialog focuses the record heading with preventScroll, rather than
the new input, to avoid automatically opening a mobile keyboard. The heading
has no extra tab stop. Existing Escape/close focus restoration is retained.
The record dialog owns viewport sizing and keeps its controls separate from the
scrolling fields, as documented in viewer-detail-scroll.md. Input/clear controls
retain mobile touch targets and values retain wrapping.

Copy buttons remain available on matching fields and copy their exact displayed
values. Filtering out a field unmounts its copy control, clearing its feedback
timer and ignoring late promise feedback through the existing lifecycle guard.
Blank-field copy rules, row selection, permissions and export behavior are
unchanged. The optional empty-field filter is documented in viewer-hide-empty.md.
