# Searchable Viewer filter columns

Open a filter row's column chooser and type in **Search columns…**. Matching is a trimmed, case-insensitive substring search over the already loaded header names; it preserves the original header order and exact values. No data request is made while searching. The current filter column, operator and values remain unchanged until a different column is selected.

**No columns found.** explains an empty result. Closing or selecting clears the temporary search, so reopening shows all columns. Selecting the current column simply closes the chooser. Header text is rendered as text, including punctuation and HTML-like names.

The chooser uses the existing Radix Popover and Input components, with a labeled editable combobox and listbox. React owns the visible options and active option ID so the keyboard highlight and screen-reader reference update together. Use the arrow keys and Enter to choose; Escape closes the chooser and returns focus to its trigger. In the mobile Filters sheet, the first Escape closes only the chooser and a later Escape closes the sheet. Clicking an outside input preserves its natural focus. Text composition does not commit a selection.

Long names wrap in the scrollable popup; the selected name is truncated in the compact trigger with a full title and accessible description. Popup dimensions are bounded by the viewport. This change is limited to the filter-column chooser; it does not change server query, numeric filtering, sorting or export contracts.
