# Saved rename recovery

A failed rename keeps its dialog, target import and entered name in component
memory. A normalized inline alert is associated with the labelled name field;
the user can edit or explicitly retry without typing the name again. No automatic
mutation retry or persistent draft is introduced. Editing clears the previous
error. Cancel, Escape or Close after the request completes discards the draft;
opening Rename again starts with the current stored name and no old error.

Only a successful owned response updates the visible import and closes/resets
the dialog. Finally releases the owned request and busy state, preserving input
on failure. Existing mounted/controller/generation and page-readiness checks stay
in force. Input changes and dialog dismissal are blocked while saving, including
the interval before React commits the busy render. The shared dialog's optional
close-button disabling defaults to false for every other caller.

Leaving Saved still aborts pending work; late responses cannot close a later
dialog or set its error. Account/role remount and existing authorization stay
unchanged. Delete, bulk deletion, Viewer and search timing are outside this change.
