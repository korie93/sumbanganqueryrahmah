# Viewer export ownership

CSV, Excel and PDF share one synchronous export owner. It is acquired before
loading rows and stays active through lazy module loading and file creation.
Repeated clicks cannot start another format while this owner is active, even
before React renders the busy state.

The Viewer shows a compact live status and a Cancel export action while work is
pending. Export menu options and the page-size selector use the same busy state.
Cancellation, clearing the viewer, changing datasets or leaving the page aborts
the owner's row requests. A completed file already handed to the browser cannot
be recalled, and synchronous PDF/worksheet generation cannot be interrupted
mid-function.

Owner identity prevents a cancelled operation's delayed finalizer from releasing
a newer export. Continuation checks after row reads and lazy module/runtime
loading prevent stale downloads. Errors and empty results release ownership so
the user can retry. Selected/filtered rows, export batch sizes, column order,
file formatting and permissions retain their existing behavior.

Regression coverage includes all format pairs, delayed cancellation and
replacement, final-page cancellation, failure/retry, production browser busy and
cancel controls, complete CSV contents, and navigation cleanup. Browser fixtures
use synthetic data only. This change reduces duplicate work; it does not claim a
measured reduction in Chrome's total tab memory.
