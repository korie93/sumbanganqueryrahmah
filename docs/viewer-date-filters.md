# Viewer calendar-date filters

The Viewer operator menu includes **Before date**, **After date** and **Between dates**, distinct from numeric **Between**. Before and After exclude the selected calendar day. Between includes both endpoints; identical endpoints select that single day.

Use the native date fields to supply canonical `YYYY-MM-DD` bounds. Imported values may be ISO dates (`2026-10-29`), compact dates (`20261029`, including an eight-digit integer JSON value), or day-first slash/dash dates (`29/10/2026`, `29-10-2026`, with one- or two-digit days/months). Surrounding ASCII whitespace is ignored. Years 0001–9999 and real calendar dates are required, including the Gregorian century leap-year rules.

Interpretation is date-only and independent of browser/server timezone. Timestamps, Excel serial numbers, two-digit years, mixed separators, impossible calendar dates, blank cells and nonscalar values are excluded rather than guessed. Imported text is bounded to 32 characters. This contract does not change import parsing or the stored data.

Incomplete or invalid drafts stay inactive with inline guidance. Both bounds participate in request/retry identity, chips, page and selection resets, and all-results exports. The server applies date filtering to the whole authorized import before pagination, including when search, numeric filters or numeric ordering are also active. Dirty values are guarded before SQL casts. No schema migration or additional dependency is required.
