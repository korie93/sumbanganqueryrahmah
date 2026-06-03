# Search API Contract

Search endpoints should keep result sets bounded and predictable.

## Query Handling

- Reject or normalize empty search input before database access.
- Keep default result limits bounded by runtime config.
- Avoid returning unbounded rows for short or broad queries.
- Preserve stable response shapes for the frontend.

## Error Handling

Validation errors must use sanitized field names and stable error codes. Do not
echo raw SQL fragments, stack traces, or untrusted query text in production
responses.

## Performance Notes

For broad exports or analytics-style reads, prefer paginated reads and consider
the optional read-replica path when configured. Primary database fallback must
remain behaviorally identical.
