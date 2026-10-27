# Floating AI on demand

The authenticated shell renders a lightweight AI launcher. It does not schedule
an idle callback or timer to import the floating panel runtime. A native click,
Enter or Space explicitly requests that runtime; concurrent gestures share one
pending import. After the first successful activation, the existing runtime
stays mounted so minimizing the panel preserves its active request and messages.

An import completion belongs to its initiating route and mounted launcher.
Navigation, logout/unmount or disabling AI invalidates pending open intent.
Loading and import errors use short BM announcements without raw exception text.
A rejected import releases its loader promise. Native browser module maps retain
failed URLs, so the next explicit gesture uses a second statically built module
entry. This is a bounded recovery path; it uses no eval, blob URL, automatic
reload or unbounded cache-busting URLs.

Save Collection and Saved on mobile retain a separate, lazy placement-only
surface before activation. These routes need the existing control/footer/dialog
collision machinery while idle. Ordinary pages use the existing CSS position
and mobile focus suppression. Panel focus handling, modal behavior and chat
components remain deferred. The placement surface contains its own import/render
failure and offers a normal-flow retry without placing a fallback over controls.

The initial runtime opens through `initiallyOpen`. Both the open and activated
states use that seed; the route-close effect compares route identity so React
StrictMode replay does not cancel the user's first activation.

This change targets unnecessary startup code and listeners for unused AI. It
does not guarantee a particular Chrome Task Manager memory reduction. Validate
actual production-build chunk requests, first activation, delayed/failed imports,
navigation, minimized requests, keyboard/mobile behavior and existing Save/Saved
clearance contracts using synthetic local data.
