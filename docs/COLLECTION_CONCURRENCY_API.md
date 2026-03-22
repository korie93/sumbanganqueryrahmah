# Collection Concurrency API Contract

## Endpoint

- `DELETE /api/collection/:id`

## Request Payload

```json
{
  "expectedUpdatedAt": "2026-03-21T03:50:12.000Z"
}
```

- `expectedUpdatedAt` is optional but strongly recommended.
- Value must be an ISO date-time string from the latest record version the client saw.
- Frontend source of truth:
  - use `record.updatedAt` when present
  - fallback to `record.createdAt` only if `updatedAt` is missing

## Backend Behavior

- If `expectedUpdatedAt` matches current server version:
  - delete proceeds
  - returns `200 { ok: true }`
- If it is stale (record changed in another tab/session):
  - delete is rejected with `409`
  - response code: `COLLECTION_RECORD_VERSION_CONFLICT`
  - message: `Collection record has changed since you opened it. Refresh and try again.`

## Frontend Expectation

- On `409 + COLLECTION_RECORD_VERSION_CONFLICT`:
  - show conflict toast (`Record Updated Elsewhere`)
  - refresh collection list/summary data
  - close/clear pending delete dialog state

This prevents stale tabs from deleting newer data silently and keeps UI totals aligned with backend truth.
