# API Contracts

This file is generated from `shared/api-contracts.ts` plus the public route metadata in `scripts/generate-api-contract-docs.ts`.
Regenerate it with `npm run docs:api`.

Only stable, client-facing authenticated routes are documented here on purpose. Internal-only, operational, and debug-only routes stay out of this document to reduce drift and accidental exposure.
The same source-of-truth also produces `docs/openapi.public.json` for Swagger/OpenAPI tooling.

## Shared error envelope

```text
{
  ok?: false
  message: string
  requestId?: string
  code?: "REQUEST_TIMEOUT" | "REQUEST_BODY_INVALID" | "PAYLOAD_TOO_LARGE" | "INVALID_CURSOR" | "INVALID_CREDENTIALS" | "INVALID_IDENTIFIER" | "INVALID_EMAIL" | "INVALID_PASSWORD" | "INVALID_CURRENT_PASSWORD" | "INVALID_TOKEN" | "PERMISSION_DENIED" | "USER_NOT_FOUND" | "USERNAME_TAKEN" | "NOT_FOUND" | "TOKEN_USED" | "TOKEN_EXPIRED" | "ACCOUNT_LOCKED" | "ACCOUNT_UNAVAILABLE" | "ACCOUNT_BANNED" | "PASSWORD_CHANGE_REQUIRED" | "SUPERUSER_SINGLE_SESSION_ENFORCED" | "AUTH_RATE_LIMITED" | "IMPORT_UPLOAD_RATE_LIMITED" | "AUTH_RECOVERY_RATE_LIMITED" | "AUTH_MUTATION_RATE_LIMITED" | "ADMIN_ACTION_RATE_LIMITED" | "SEARCH_RATE_LIMITED" | "TWO_FACTOR_CHALLENGE_INVALID" | "TWO_FACTOR_INVALID_CODE" | "TWO_FACTOR_NOT_ENABLED" | "TWO_FACTOR_NOT_ALLOWED" | "TWO_FACTOR_SECRET_INVALID" | "TWO_FACTOR_SETUP_MISSING" | "MAIL_PREVIEW_NOT_FOUND" | string
  error?: {
    code?: "REQUEST_TIMEOUT" | "REQUEST_BODY_INVALID" | "PAYLOAD_TOO_LARGE" | "INVALID_CURSOR" | "INVALID_CREDENTIALS" | "INVALID_IDENTIFIER" | "INVALID_EMAIL" | "INVALID_PASSWORD" | "INVALID_CURRENT_PASSWORD" | "INVALID_TOKEN" | "PERMISSION_DENIED" | "USER_NOT_FOUND" | "USERNAME_TAKEN" | "NOT_FOUND" | "TOKEN_USED" | "TOKEN_EXPIRED" | "ACCOUNT_LOCKED" | "ACCOUNT_UNAVAILABLE" | "ACCOUNT_BANNED" | "PASSWORD_CHANGE_REQUIRED" | "SUPERUSER_SINGLE_SESSION_ENFORCED" | "AUTH_RATE_LIMITED" | "IMPORT_UPLOAD_RATE_LIMITED" | "AUTH_RECOVERY_RATE_LIMITED" | "AUTH_MUTATION_RATE_LIMITED" | "ADMIN_ACTION_RATE_LIMITED" | "SEARCH_RATE_LIMITED" | "TWO_FACTOR_CHALLENGE_INVALID" | "TWO_FACTOR_INVALID_CODE" | "TWO_FACTOR_NOT_ENABLED" | "TWO_FACTOR_NOT_ALLOWED" | "TWO_FACTOR_SECRET_INVALID" | "TWO_FACTOR_SETUP_MISSING" | "MAIL_PREVIEW_NOT_FOUND" | string
    message: string
    details?: unknown
    requestId?: string
  }
}
```

## GET /api/imports

Lists imports available to the authenticated user.

Request summary: Query params: `cursor`, `pageSize`, `search`, `createdOn`.

Response contract:

```text
{
  imports: Array<{
      id: string
      name: string
      filename: string
      createdAt: string
      isDeleted: boolean
      createdBy?: string | null
      rowCount: number
    }
  >
  pagination: {
    mode: "cursor"
    limit: number
    pageSize?: number
    nextCursor: string | null
    hasMore: boolean
    total: number
  }
}
```

## GET /api/imports/:id/data

Returns paginated import rows for viewer-style table rendering.

Request summary: Query params: `page`, `pageSize`, `search`, `cursor`, `columnFilters`.

Response contract:

```text
{
  rows: Array<{
      id: string
      importId: string
      jsonDataJsonb: unknown
    }
  >
  headers: Array<string>
  total: number
  page: number
  limit: number
  pageSize?: number
  offset: number
  nextCursor: string | null
  pagination: {
    mode: "hybrid"
    page: number
    pageSize: number
    limit: number
    offset: number
    total: number
    totalPages: number
    nextCursor: string | null
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}
```

## DELETE /api/imports/:id

Deletes a single import record.

Request summary: Path param: `id`.

Response contract:

```text
{
  ok?: true
  success: boolean
}
```

## GET /api/search/global

Runs the main global search experience used by the search page.

Request summary: Query params: `q`, `page`, `pageSize`.

Response contract:

```text
{
  columns: Array<string>
  rows: Array<unknown>
  results: Array<unknown>
  total: number
  page: number
  limit: number
  pageSize: number
  offset: number
  pagination: {
    mode: "offset"
    page: number
    pageSize: number
    limit: number
    offset: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}
```

## POST /api/search/advanced

Runs advanced search with structured filters and AND/OR logic.

Request summary: JSON body: `{ filters, logic, page, pageSize }`.

Response contract:

```text
{
  results: Array<unknown>
  headers: Array<string>
  total: number
  page: number
  limit: number
  pageSize: number
  offset: number
  pagination: {
    mode: "offset"
    page: number
    pageSize: number
    limit: number
    offset: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}
```

## GET /api/audit-logs

Returns audit log records with offset pagination.

Request summary: Query params: `page`, `pageSize`, `action`, `performedBy`, `targetUser`, `search`, `dateFrom`, `dateTo`, `sortBy`.

Response contract:

```text
{
  logs: Array<{
      id: string
      action: string
      performedBy: string
      requestId?: string | null
      targetUser?: string | null
      targetResource?: string | null
      details?: string | null
      timestamp: string
    }
  >
  pagination: {
    mode: "offset"
    page: number
    pageSize: number
    limit: number
    offset: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}
```

## GET /api/settings

Returns grouped settings data with per-setting permissions.

Request summary: No request body. Authenticated access only.

Response contract:

```text
{
  categories: Array<{
      id: string
      name: string
      description: string | null
      settings: Array<{
          key: string
          label: string
          description: string | null
          type: "text" | "number" | "boolean" | "select" | "timestamp"
          value: string
          defaultValue: string | null
          isCritical: boolean
          updatedAt: string | null
          permission: {
            canView: boolean
            canEdit: boolean
          }
          options: Array<{
              value: string
              label: string
            }
          >
        }
      >
    }
  >
}
```

## PATCH /api/settings

Updates one setting value while preserving permission checks.

Request summary: JSON body: `{ key, value, confirmCritical? }`.

Response contract:

```text
{
  ok?: true
  success: boolean
  status: "updated" | "unchanged"
  message: string
  setting: {
    key: string
    label: string
    description: string | null
    type: "text" | "number" | "boolean" | "select" | "timestamp"
    value: string
    defaultValue: string | null
    isCritical: boolean
    updatedAt: string | null
    permission: {
      canView: boolean
      canEdit: boolean
    }
    options: Array<{
        value: string
        label: string
      }
    >
  } | null
}
```

## GET /api/settings/tab-visibility

Returns current tab visibility for the active role.

Request summary: No request body. Authenticated access only.

Response contract:

```text
{
  role: string
  tabs: Record<string, boolean>
}
```
