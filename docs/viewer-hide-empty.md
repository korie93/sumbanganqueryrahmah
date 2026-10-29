# Viewer empty fields

Record details has an opt-in Sorok medan kosong switch near its field search.
The default remains all fields. The setting belongs to the open record fields
and resets when details close or the record changes; it is not persisted.

Empty detection uses the original value with the existing display rules:
String(value ?? "").trim() === "". Zero, false, padded identifiers and literal
dash strings remain visible and copyable. The formatted missing-value dash is
never used to decide emptiness. Field objects retain their existing shape.

Header-name search is applied first, followed by hiding blank values. The main
status reports displayed fields against the original authorized field count.
A separate message counts empty fields hidden within the current name search.
No matching names retains Tiada medan sepadan. If matching fields are all
hidden, the dialog explains Semua medan sepadan kosong. and offers Paparkan
medan kosong. That action turns off hiding, keeps the search and focuses the
switch so focus does not disappear with the action.

The switch uses the existing component, a clickable 44px label and per-instance
reduced-motion overrides for both track and thumb. Existing modal heading focus,
Escape/close restoration, search/clear, exact-value copy, ordering and viewport
scrolling are retained. Filtering out a copy control uses its existing cleanup.
No dependency, global CSS, timer, data request, permission or export change.
