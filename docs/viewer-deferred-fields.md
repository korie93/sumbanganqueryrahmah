# Deferred Viewer card fields

The compact Viewer card keeps its identity, preview fields, selection and native
`details`/`summary` disclosure. Additional fields are rendered only after that
disclosure opens and removed from the DOM after it closes. The current row and
selected columns are read on every render, so reopening never uses a saved copy
of old values. Removing all overflow fields unmounts the disclosure and resets
its local state.

The native element owns its open state; React reads `currentTarget.open` in the
toggle event. This preserves pointer, touch and keyboard interaction, including
coalesced native toggle events. There are no extra requests or global listeners.

The loaded dataset stays in application state. This reduces hidden field markup;
it does not unload row data, change pagination, restrict columns, or promise a
particular reduction in Chrome's tab memory measurement. Desktop tables, search,
exports, permissions and the separate row-details dialog are unchanged.

Verification includes existing Viewer unit/markup tests and production-browser
tests in `tests/visual/viewer-deferred-fields.spec.ts` with synthetic data. Check
closed DOM counts, keyboard/touch open and close, exact/escaped values, selection,
current filtered rows, and column visibility without accessing production data.
