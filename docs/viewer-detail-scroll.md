# Viewer record detail scrolling

Record details uses a stable height, capped at 44rem and the existing safe
viewport token with dialog gutters. Header, search/hide controls and footer
have their own nonshrinking sections. The named Medan rekod region owns the
field list and empty-state scrolling. Its stable scrollbar gutter prevents
horizontal shifts when filtering. It accepts keyboard focus for native
PageDown/Home/End scrolling. Searching or toggling blank hiding returns the
field region to its start without moving focus or the outer page.

The existing useMobileViewportState hook supplies visual viewport height and
bottom inset while the dialog is mounted. An optional trackAllWidths parameter
is enabled for this dialog so landscape phones and tablets are covered; existing
callers retain their mobile-width default. Local CSS properties use those values
to size and center the dialog within the visible area, including an offset
visual viewport. No new viewport observer, dependency or global CSS is added.
The existing hook cleans up its listeners and animation frame on unmount.

Below 540px available height, scoped styles reduce padding, show one title line
and omit secondary visual context/description. The complete title and values
remain in the accessible markup and record fields. Controls retain mobile
touch sizes. At exceptionally short heights of 320px or less, an outer-scroll
fallback keeps every control reachable when fixed sections cannot all fit.

Search/hide state, exact copy, heading focus, Escape/close focus restoration and
data permissions remain unchanged. Both the list and empty-state recovery live
inside the same scroller. Data filtering remains local; there are no extra data
requests, timers or persistence changes. All styles are local to this dialog.
