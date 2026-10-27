# Saved bulk deletion

Saved deletes selected imports through at most three concurrent DELETE requests.
Each available slot takes the next selected ID; an individual failure does not
stop the remaining queue and is never retried automatically. Existing API
authorization, CSRF, response validation and disabled DELETE retry stay intact.

The mutation hook claims an operation synchronously through its controller refs
so repeated confirmation before the next render cannot start another queue.
Unmount aborts the operation and prevents unstarted items from being dispatched;
already accepted server deletions cannot be undone by cancelling a browser request.
Owner/controller/generation checks prevent late UI updates or dialog finalization.

After completion, only successful IDs leave the current selection. Failed imports
remain selected while still visible, with a result message explaining explicit
retry. Existing page/filter selection pruning remains authoritative, so changing
filters does not restore hidden or previously cleared selections.

The queue helper has injected request execution for deterministic tests of its
concurrency limit, slot refill, ordered partial results, abort and synchronous
failures. Synthetic browser checks exercise the actual Saved confirmation flow,
partial/all failures, explicit retry, disabled busy actions and navigation cleanup.
Source contracts also check the synchronous duplicate-operation guard.
