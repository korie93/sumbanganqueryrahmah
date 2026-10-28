# Saved and Viewer read deadlines

The Saved list, Saved file details and Viewer page reads have a 60-second
deadline spanning response headers, transport retry waits, body reading and
contract parsing. Each hook wraps its complete API operation with
`withReadDeadline`; the shared API defaults and other call sites are preserved.
Browser timers cannot interrupt synchronous parsing. Existing JSON size, depth
and node limits continue to bound that work without adding a worker runtime.

The deadline owns a child abort signal. Timing out stops its request without
aborting the hook's owner controller, allowing the current hook to display the
friendly timeout and offer explicit recovery. Caller cancellation instead
produces an AbortError, retaining the existing quiet close/navigation behavior.
An explicit race also bounds a transport or body reader that ignores abort.
Late settlements cannot restore old data or become unhandled rejections.

Timeouts use the fixed message: **Permintaan mengambil masa terlalu lama. Sila
cuba semula.** They are recognized explicitly by the existing Saved and Viewer
read-retry policies; HTTP access denials keep precedence. Saved can retain its
last good page for the same query, while Viewer clears exportable rows after a
failed read. Details show their existing retry button with the timeout message.
The initial Saved error uses its existing Refresh action.

Unit checks use controlled timers. Browser cases use fictional HTTP fixtures,
virtual time and a narrowly targeted fetch adapter to distinguish pending
headers from an unfinished body. The production server is not involved.
