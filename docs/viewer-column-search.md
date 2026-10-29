# Viewer column search

Columns has a local, labelled search field inside the existing popup or mobile
sheet. Matching is a trimmed, case-insensitive literal substring of the header;
it does not search row values or request data from the server. An active query
announces its matching/total column count, and an empty result explains that no
column matches. Clear resets the query and returns keyboard focus to the input.

The search state belongs to the lazy list mounted while Columns is open, so it
resets on close. Column selection remains controlled by the existing Viewer
state: hidden matches retain their checkboxes. Filtering preserves original
indexes, keeping reorder bounds and moves relative to the full column order.
All, Min and Reset still act on the complete dataset column set; their tooltips
state that scope. No backend, permissions, export scope or persistence changes.

No extra dependency, debounce timer, global CSS or forced mobile autofocus is
introduced. The existing bounded list scroll, memoized row handlers, checkbox
identifiers, move-button names and Escape/trigger focus behavior are preserved.
