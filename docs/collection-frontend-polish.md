# Collection frontend polish

This pass preserves the existing Collection routes, permission checks, APIs,
matching, monetary formulas, exports and receipt originals. It adds no dependency
and does not require a database migration.

## Presentation and interaction changes

- Save Collection: balanced payment fields, shorter receipt guidance and a neutral
  first-run field-completeness summary. The correction list is available on demand;
  explicit submit errors open the review; blur-only errors stay next to their
  fields without expanding the closed review or shifting Reset mid-click. One
  stable native disclosure preserves correction controls during validation.
  Matching error/no-match states use normal-flow mobile actions so feedback and
  Retry cannot be covered by the sticky footer. Field completeness is
  not labelled as successful source matching.
- Records: search remains outside the folded filter panel. An inverted date range
  now has persistent inline feedback associated with both date controls.
- Summary: current-month emphasis and right-aligned tabular amounts.
- Monthly Comparison: main metrics and monthly chart remain prominent; same-day
  analysis and detailed insights use native disclosures. Dedicated export/print
  builders are unchanged; browser-print CSS exposes disclosure contents.
- Daily: one native calendar-display selector retains all seven modes. Target and
  supporting status tools are grouped, while attention/conflict and unsaved-change
  feedback remain visible. Existing calendar editing permissions remain in force.
- Billing OSP: movement is labelled in percentage points; Aging is a semantic row
  header and keeps the existing sticky-column treatment.
- Nickname Summary: loaded scope and draft changes are distinguished. Background
  data events refresh the validated last-applied scope, never pending draft values,
  and do not interrupt an in-flight explicit Apply request.
- Manage Nickname: group/assignment order is clearer, search and assignment controls
  have explicit names, and secondary actions use existing guarded menus.

## Receipt viewer

The viewer fits images to available width, with zoom relative to that fit rather
than a natural-pixel percentage. Native scrolling works after zoom or rotation;
the image's enclosing canvas includes its rotated bounds. A stable scrollbar
gutter avoids fit/overflow resize oscillation.

Receipt choices include filenames and pressed state. Details control the actual
keyboard-scrollable details region. Fetch/decode failures offer a retry, loading
and errors expose status semantics, and PDF open/download actions are not repeated.
Original downloads, authenticated blob fetching, safe-URL validation, request
cancellation, object-URL cleanup and dialog focus restoration are preserved.
Development StrictMode setup restores the captured validated media source after
its simulated cleanup. PDF fetches expose loading state; native PDF frames are
not covered by a load-event-dependent overlay, because those events vary by
browser. Open PDF and original download remain available independently.

## Verification

Use the existing Node client/script tests and production build. Browser regression
coverage uses `npm run test:visual:built` with a static loopback frontend and
synthetic HTTP/file fixtures, not a production server or database. New viewer
tests cover actual mobile zoom growth, cardinal rotations, keyboard scrolling,
Fit, selected receipt state, PDF actions, retry, focus return and an isolated real
development StrictMode renderer. Report controls tests cover disclosures, display
modes and draft/applied state. The scoped
`collection-polish-presentation-regressions.test.ts` entry connects seven existing
TSX presentation modules to the repository's `.test.ts` client runner using its
existing CSS-only test loader. Real CSS is verified separately in built browsers.

Visual comparison evidence and limitations for this implementation are recorded in
the Collection section of the repository's `design-qa.md`. Screenshot baselines
must not be updated merely to conceal a layout or accessibility regression.

Chrome's native PDF viewer requests browser-internal resources in CI. The receipt
fixtures permit only the exact built-in PDF extension and `chrome://resources`;
HTTP/external origins remain blocked. Fixture storage initialization is restricted
to the top-level synthetic app origin, never PDF frames. Nested nickname-filter
tests wait for Popover focus restoration before dismissing the containing Sheet.
