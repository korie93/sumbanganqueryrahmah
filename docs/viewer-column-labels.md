# Viewer column names

The Columns popup keeps desktop column names on one line with ellipsis. The
associated label's native title exposes the complete name on pointer hover;
the checkbox keeps its full accessible name through that label. The native
browser tooltip is used rather than adding a tooltip component or focus stop.

Below 768px, matching the existing mobile sheet, names wrap to two lines with
word wrapping for unbroken values.
A scoped CSS module owns the clamp, so global labels and other menus do not
change. The clickable label is at least 44px tall on phones. The checkbox does
not shrink, and the text grid uses a zero minimum track so names cannot push
the independent reorder controls beyond the popup. Names remain plain React
text; neither their content nor the underlying column identifiers are changed.

Search, ordering, checked state, global move bounds, All/Min/Reset and keyboard
Escape/trigger focus behavior remain unchanged. No new state, timer, dependency
or network request is introduced. The full name remains available to assistive
technology even when its visual label is clamped.
