# Viewer field copy

Record details has a labelled Salin button beside each displayed field. Copying
uses the displayed string exactly, including leading zeroes, spacing and line
breaks. Blank or missing values keep their existing dash placeholder and have
a disabled copy button; a literal imported dash remains copyable.

Clipboard writes happen only after an explicit click or keyboard activation.
The button prevents duplicate pending writes and shows Disalin for two seconds
only after the browser confirms success. Missing or denied clipboard access
shows a short inline message and permits retry or manual text selection. No
field values are logged or sent to a server.

Each field owns its feedback and managed timeout. Closing details, switching
rows, changing the value or unmounting clears feedback resources and ignores
late promise completions. Clipboard writes already requested from the browser
cannot be cancelled. The stable accessible button name identifies the field;
a separate polite live region announces feedback without repeating its value.

The existing modal, data permissions, row selection, navigation and export
behavior are unchanged. Controls have a fixed width and a mobile touch target;
values retain wrapping and whitespace. No dependency or global CSS is added.
