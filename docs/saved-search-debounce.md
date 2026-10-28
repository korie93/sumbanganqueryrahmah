# Saved text search scheduling

Saved waits 300ms after the last search or uploader-text edit before submitting
the latest complete pair. Controlled inputs and raw-query ownership update
immediately. Old rows/count/selection and destructive actions are not exposed as
results for the new input. No persistent cache or extra server pages are added.

Enter in either field flushes both latest values. Enter during IME composition
keeps its normal text-entry behavior; composition blocks query publication until
complete. Clearing either field submits the latest pair immediately. Clear all
resets both raw and submitted text, other filters and page without waiting.

Date, row-count filter, workspace-view, page and page-size actions flush pending
text and apply in one query change. Refresh while text is pending submits it;
it does not also run a request captured with the previous submitted values.
Refresh of an already-ready query keeps the existing same-query recovery policy.
Composition prevents Refresh from publishing unfinished candidate text.

Timers are cancelled before replacement, immediate submission and unmount.
Current raw-key/readiness, controller ownership and abort checks continue to
reject old responses. A post-delete refresh during pending text does not force
partial text onto the server; the eventual timer/flush loads the latest query.
The existing bounded deletion queue, retry feedback, account/role boundaries and
single-page component memory remain in force. No backend/API/dependency changes.
