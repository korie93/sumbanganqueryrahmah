# Saved file details recovery

The file details drawer distinguishes loading, read failure and a successful
summary with no columns. Failed or cancelled reads never imply that a file has
no columns. Existing file-list metadata and drawer actions remain available.

Recognized temporary read failures offer an explicit **Cuba Semula** action.
While retrying, the action stays mounted and disabled with a loading label;
the drawer can still be closed. Each attempt makes one summary request without
automatic transport retries. Permission denials, missing files and invalid
response contracts do not offer retry. The existing Saved temporary-read policy
is shared with list refresh recovery; its classification is unchanged.

The request owner synchronously prevents duplicate retries. Closing the drawer,
changing files or unmounting aborts the request. File identity, mounted state,
abort signal and request identity guard every result; even a late reply cannot
replace another file's summary. No rows, summaries or failures are persisted.

Regression coverage uses synthetic summary responses for temporary errors,
keyboard retry, repeated activation, access denials, malformed responses, true
empty columns, 320px layout, closing during a pending request and late replies.
