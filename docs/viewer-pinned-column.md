# Viewer pinned column

On a desktop viewport at least 768px wide, open **Columns** and choose the pin button beside a visible field. One field can be pinned at a time. Pinning another field replaces the current pin; choosing the active pin again removes it. The button keeps the accessible name `Pin <field>` and exposes its current state with `aria-pressed`. Hidden fields have disabled pin buttons.

The pinned field is displayed as the first data column. The selection checkbox and row number keep their positions before it and scroll away normally. Once those controls have scrolled away, the field remains at the left edge of the horizontal table viewport. Header and body cells move together, including the virtual row table. Pinned cells have opaque backgrounds that preserve the selected row appearance.

The pin belongs to the currently open dataset and is held in memory. Hiding the pinned field, choosing **Min** or **Reset**, changing datasets, or leaving Viewer clears it. Showing a field again does not restore an old pin. Resizing into the mobile card layout temporarily hides the pin controls and pinned presentation; returning to desktop retains a current pin while Viewer remains open.

Pinning does not change the saved column order or visibility preferences, the order passed to exports, the mobile card field order, field values, or pagination. Mobile viewports below 768px have no pin controls. Existing column movement and visibility controls continue to determine the normal order.

## Scrolling implementation

Viewer retains its existing horizontal scrolling region and column navigation controls. A shared horizontal scroll offset translates the pinned cells after the leading 100px of controls has passed. This keeps the header and rows aligned across the ordinary table's vertical scrolling container and the virtual list's separate vertical viewport, where separate sticky containing blocks can otherwise disagree. The existing vertical row scrolling and virtualization remain in place.

## Browser regression coverage

`tests/visual/viewer-pinned-column.spec.ts` uses fictional records, 43 fields, isolated loopback HTTP, blocked WebSockets, and the shared fail-closed session fixture. Its four cases cover:

- Standard light table: keyboard pin and unpin, stable accessible name and pressed state, switching the one active field, original preference order, first/middle/end horizontal alignment, vertical alignment, opaque selected cells, overlap hit testing, and serious/critical axe checks for the Columns popup and scrolled table.
- Pin lifecycle: hiding and showing the field, **Min** clearing a retained first-field pin, two-field table geometry in a wide viewport, **All** preserving a current valid pin, and **Reset** restoring the normal order and removing the pin.
- Dark virtual table: 150 records under a configured 200-row page, bounded rendered row count through horizontal and vertical scrolling, shared header/body geometry, selected cell appearance, and serious/critical axe checks.
- Responsive layout: 320px mobile cards, the 767px/768px boundary, original card field order including expanded fields, no mobile pin buttons, and retaining the current in-memory pin when returning to desktop.

Each case has a 60-second timeout and checks that local pin interactions do not fetch dataset rows or introduce unexpected requests or browser errors. These tests require the normal production frontend browser harness. Authoring this suite does not establish a test pass; browser results should be recorded after it is run in the supported environment.
