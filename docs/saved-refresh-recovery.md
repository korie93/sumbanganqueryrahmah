# Saved refresh recovery

Saved retains one last-successful server page in component memory while the exact
same query refreshes. A recognized temporary network, timeout, rate-limit or
server failure leaves that page visible with a short stale-data notice and an
explicit retry. First-load errors still show an error rather than a false empty
workspace. No persistent cache or extra result pages are introduced.

Raw search, uploader, date, row-count inputs, workspace view, page and page size
identify the current context. A changed context hides old rows immediately and
clears the previous snapshot, including while a deferred query is catching up.
Request ownership and abort checks prevent delayed responses from changing a
different context or an unmounted page. Successful deletion updates the same
snapshot before a fresh read, so a failed refresh cannot resurrect deleted rows.

Rename and delete are disabled while refreshing or showing stale data. Their
confirmation handlers also check current page readiness synchronously, including
dialogs opened earlier. Refresh/retry remains available after a temporary failure.
Selection of remaining visible files survives failure and successful recovery.
The existing three-request deletion cap and DELETE retry policy remain unchanged.

Unknown/malformed responses and access failures, including 401, 403 and 404, clear
the page instead of keeping data. The Saved route is keyed by authenticated account
identity and role, so switching either remounts the workspace and aborts its work.
Existing auth and permission gates still decide whether Saved may mount at all.

Regression checks use synthetic data: same-query refresh and manual retry,
selection after partial deletion plus failed refresh, query changes, access denial,
and navigating away while a response is held. The shared API's existing GET retry
policy is preserved; no additional automatic refresh loop is added.
