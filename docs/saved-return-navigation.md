# Returning from Viewer to Saved

A direct Saved → Viewer → Saved journey restores the current search, uploader,
local calendar date, raw row-count filters, workspace view, page and page size.
The list fetches fresh authorized data immediately, without retaining rows or
briefly querying default filters. Desktop list scroll and window position are
captured when opening Viewer. After the fresh list loads, focus returns to that
file's View button. If the file is missing or loading fails, focus returns to
search. The server can clamp a page whose files have since been removed.

Only one small, normalized navigation snapshot is held in an account/role-keyed
React provider. Leaving the Saved/Viewer journey, switching Viewer datasets,
logging out, changing accounts/roles or reloading discards it. Snapshots contain
only bounded query strings, numbers and one file ID; no file rows, selected
deletion IDs, drawer state, auth data or persistent browser storage is added.

Restoration runs once after a fresh result. Typing, keyboard navigation, pointer,
touch or wheel actions while waiting cancel pending focus/scroll restoration,
so delayed responses do not interrupt the user's next action. Animation frames
and listeners clean up on replacement or unmount; scroll restoration is instant.
