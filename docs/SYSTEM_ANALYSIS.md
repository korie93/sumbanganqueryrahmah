# System Analysis & Improvement Recommendations

> **Date:** March 2026
> **Scope:** Backend, Database, Frontend, UI/UX
> **Codebase Stats:** ~60,500 LOC server | ~23,800 LOC client | 885 LOC schema | 83 test files | 21 migrations

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Backend Analysis](#2-backend-analysis)
3. [Database Analysis](#3-database-analysis)
4. [Frontend Analysis](#4-frontend-analysis)
5. [UI/UX Analysis](#5-uiux-analysis)
6. [Cross-Cutting Concerns](#6-cross-cutting-concerns)
7. [Priority Recommendations](#7-priority-recommendations)

---

## 1. Executive Summary

### What's Already Good

The system is **surprisingly mature** for its stage. Several areas are well above average:

| Area | Rating | Notes |
|------|--------|-------|
| Security | ⭐⭐⭐⭐ | JWT + HttpOnly cookies, CSRF, rate limiting, helmet, input validation, 2FA, password hashing (bcrypt), log sanitization |
| Architecture | ⭐⭐⭐⭐ | Clean layered architecture (routes → services → repositories → DB), factory patterns for route registration, dependency injection via context objects |
| Database | ⭐⭐⭐⭐ | PostgreSQL with Drizzle ORM, 80+ indexes, proper FK constraints, cascade rules, managed migrations |
| Error Handling | ⭐⭐⭐⭐ | HttpError class, global error middleware, circuit breaker, async handler wrapper, client error boundaries |
| Observability | ⭐⭐⭐⭐ | Pino structured logging, request context (AsyncLocalStorage), sensitive key redaction, audit trail |
| Testing | ⭐⭐⭐ | 83 test files, but coverage likely below 70% target |
| Frontend | ⭐⭐⭐ | React + React Query + Shadcn/Radix, code splitting, device-aware tuning |
| UI/UX | ⭐⭐⭐ | Shadcn component library, dark mode, toast notifications, error boundaries |

### Top Improvement Areas (Ranked by Impact)

1. **Testing coverage gaps** — Critical services lack tests
2. **Frontend state complexity** — Auth state split across 6+ hooks needs simplification
3. **Bundle size** — Heavy dependencies (xlsx, jspdf, html2canvas, recharts)
4. **API documentation** — No OpenAPI/Swagger specification
5. **Internationalization** — Hardcoded mix of English/Malay strings
6. **Database query optimization** — Some N+1 patterns and missing query result caching

---

## 2. Backend Analysis

### 2.1 Strengths

#### Architecture

- **Clean layered separation**: `routes → controllers/handlers → services → repositories → PostgreSQL`. This is textbook clean architecture.
- **Factory-based route registration**: Routes are organized by domain (auth, collection, ai, etc.) with context-based dependency injection — avoids global state and makes testing easier.
- **Typed HTTP validation**: Custom `ensureObject()`, `readString()`, `readInt()` helpers in `http/validation.ts` prevent type confusion attacks.
- **Circuit breaker pattern**: Implemented for AI, DB, and Export operations in `server/internal/circuitBreaker.ts` — protects against cascading failures.
- **Request context tracking**: AsyncLocalStorage in `server/lib/request-context.ts` provides request-scoped logging correlation.

#### Security

- **Authentication**: JWT in HttpOnly cookies (`sqr_auth`) with a client-readable hint cookie (`sqr_auth_hint`) — secure and practical.
- **CSRF protection**: Token-based CSRF with `sqr_csrf` cookie + `X-CSRF-Token` header validation.
- **Rate limiting**: Fine-grained per-route rate limiters (login: 15/10min, recovery: 20/10min, admin: 30/10min, search: 10/10s).
- **Account lifecycle**: Full lifecycle management (pending → active → suspended/disabled/banned/locked) with `getAccountAccessBlockReason()`.
- **2FA**: TOTP-based two-factor authentication with encrypted secret storage.
- **Password security**: bcrypt with salt rounds of 10, forced password change after superuser reset.
- **Log sanitization**: Automatically redacts passwords, tokens, IC numbers, account numbers, API keys from logs.
- **Receipt file scanning**: Configurable external virus scanning (ClamAV) with quarantine directory.

#### Resilience

- **Graceful shutdown**: SIGTERM/SIGINT handlers with 25-second timeout in both `index-local.ts` and `cluster-local.ts`.
- **WebSocket heartbeat**: 30-second ping/pong with WeakSet tracking.
- **Idempotency keys**: `mutationIdempotencyKeys` table prevents duplicate mutations from network retries.
- **AI concurrency gate**: Request throttling/queuing for AI operations with configurable per-role limits.

### 2.2 Improvement Recommendations

#### High Priority

**H1. Extract remaining logic from PostgresStorage facade**

```
Current: Some domains still use PostgresStorage directly
Target:  Every domain should go through its own repository
```

The `storage-postgres.ts` file is a large facade that combines multiple domain concerns. While you've already extracted auth, collection, and AI repositories, completing this extraction would:
- Reduce file size and improve maintainability
- Make each domain independently testable
- Clarify ownership boundaries

**Recommendation:** Finish extracting `activity`, `imports`, `search`, and `backups` into dedicated repositories. The PostgresStorage class should eventually become a thin composition root that delegates to domain repositories.

---

**H2. Add request validation schemas at route boundaries**

```
Current: Manual parsing with readString/ensureObject (error-prone, no auto-documentation)
Target:  Zod schemas at every route handler with automatic 400 responses
```

While you have Zod in your dependencies and use it for insert schemas, route handlers still use manual parsing:

```typescript
// Current pattern
const body = ensureObject(req.body) || {};
const username = String(body.username ?? "");  // Silent failure if wrong type
```

**Recommendation:** Create a `validateBody(schema)` middleware that:
- Validates request bodies against Zod schemas
- Returns structured 400 errors with field-level messages
- Generates TypeScript types from schemas (already possible with Zod)
- Can later be used to auto-generate OpenAPI docs

Example:
```typescript
// Proposed pattern
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fingerprint: z.string().optional(),
});

app.post("/api/login", validateBody(loginSchema), async (req, res) => {
  // req.body is now typed and validated
});
```

---

**H3. Add OpenAPI/Swagger documentation**

You have 50+ API endpoints but no formal API documentation. This creates friction for:
- Frontend developers needing to know exact request/response shapes
- Integration testing validation
- Future mobile app or third-party integrations

**Recommendation:** Use `zod-to-openapi` (lightweight) or generate docs from Zod schemas. This leverages your existing Zod setup.

---

#### Medium Priority

**M1. Service-level integration test coverage**

```
Current: 20 service test files, but many services lack tests
Missing: AuthAccountService login flow, CollectionRecordService CRUD, BackupOperationsService
```

**Recommendation:** Prioritize tests for the highest-risk services:
1. `AuthAccountService` — login, 2FA, lockout, password reset
2. `CollectionRecordService` — CRUD with receipt validation
3. `BackupOperationsService` — backup/restore integrity

---

**M2. Standardize error codes across the API**

```
Current: Mix of string messages and some error codes
Target:  Every error should have a machine-readable code
```

Your `HttpError` class supports error codes, but they're not consistently used. Create an `ErrorCodes` enum:

```typescript
export const ErrorCodes = {
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_ACCOUNT_LOCKED: "AUTH_ACCOUNT_LOCKED",
  AUTH_2FA_REQUIRED: "AUTH_2FA_REQUIRED",
  COLLECTION_DUPLICATE_RECEIPT: "COLLECTION_DUPLICATE_RECEIPT",
  // ...
} as const;
```

This helps the frontend display contextual error messages without parsing strings.

---

**M3. Connection pool monitoring**

```
Current: Default 5 connections, no pool health metrics
```

With a default pool of 5 connections, you should monitor:
- Active vs idle connections
- Connection wait times
- Pool exhaustion events

**Recommendation:** Add pool event listeners:
```typescript
pool.on('error', (err) => logger.error('Pool error', { error: err.message }));
pool.on('connect', () => metrics.increment('db.connections.created'));
pool.on('remove', () => metrics.increment('db.connections.removed'));
```

---

#### Low Priority

**L1. Consider moving from Express to Fastify**

Express 4.x lacks native async/await support (hence your `asyncHandler` wrapper). Fastify offers:
- Native async route handlers
- Built-in schema validation (JSON Schema)
- 2-3x better throughput for JSON-heavy workloads
- Built-in Pino integration

This is a significant migration, so only consider it if you're doing a major version bump.

**L2. Add health check depth levels**

```
Current: /api/system/health exists
Improvement: Shallow (app alive) + Deep (app + DB + AI + mail)
```

Kubernetes/container orchestration benefits from:
- `/api/health/live` — Process is running (for liveness probes)
- `/api/health/ready` — All dependencies connected (for readiness probes)

---

## 3. Database Analysis

### 3.1 Strengths

- **Schema design**: 30+ tables with proper normalization, FK constraints, and cascade rules.
- **Index coverage**: 80+ indexes including compound indexes, function indexes (lower()), conditional indexes, and IVFFlat vector indexes.
- **Drizzle ORM**: Type-safe queries with excellent TypeScript integration. Schema defined in `shared/schema-postgres.ts` so both client and server can reference types.
- **Materialized aggregates**: Daily and monthly rollup tables (`collectionRecordDailyRollups`, `collectionRecordMonthlyRollups`) with a refresh queue — avoids expensive real-time aggregation.
- **Idempotency tracking**: `mutationIdempotencyKeys` table prevents duplicate mutations — excellent for handling network retries.
- **Soft deletes**: Used appropriately for receipts (`deleted_at`) and imports (`isDeleted`).
- **Row locking**: `SELECT FOR UPDATE` in auth repository for safe concurrent login attempt tracking.
- **Transactions**: 139+ uses of `db.transaction()` for atomic operations.

### 3.2 Improvement Recommendations

#### High Priority

**H1. Add database-level check constraints**

While application-level validation exists, the database itself doesn't enforce some critical invariants:

```sql
-- Proposed constraints
ALTER TABLE collection_records
  ADD CONSTRAINT chk_amount_positive CHECK (amount >= 0);

ALTER TABLE users
  ADD CONSTRAINT chk_role_valid CHECK (role IN ('user', 'admin', 'superuser'));

ALTER TABLE users
  ADD CONSTRAINT chk_status_valid CHECK (status IN ('pending_activation', 'active', 'suspended', 'disabled'));
```

This provides defense-in-depth: even if application validation has a bug, the database will reject invalid data.

---

**H2. Add created_at/updated_at consistency**

Not all tables have consistent timestamp columns. Some tables have `createdAt` but not `updatedAt`, and some have neither. Standardize:

```typescript
// Every mutable table should have:
createdAt: timestamp("created_at").defaultNow().notNull(),
updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
```

---

**H3. Review the pagination pattern in imports.repository.ts**

```typescript
// Current: Loads ALL rows into memory
async getImports(): Promise<Import[]> {
  const results: Import[] = [];
  let offset = 0;
  while (true) {
    const chunk = await db.select()...limit(1000).offset(offset);
    if (!chunk.length) break;
    results.push(...chunk);    // All in memory!
    offset += chunk.length;
  }
  return results;
}
```

This loads all imports into memory. If you have 10,000+ imports, this will cause memory pressure.

**Recommendation:** Use cursor-based pagination that returns one page at a time:
```typescript
async getImports(cursor?: string, limit = 50): Promise<{ items: Import[], nextCursor?: string }> {
  const rows = await db.select().from(imports)
    .where(and(eq(imports.isDeleted, false), cursor ? gt(imports.id, cursor) : undefined))
    .orderBy(asc(imports.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    nextCursor: hasMore ? rows[limit - 1].id : undefined
  };
}
```

---

#### Medium Priority

**M1. Add database connection health checks**

```typescript
// Add a periodic connection test
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    logger.error('Database health check failed', { error: err.message });
    // Trigger alerting
  }
}, 30_000);
```

---

**M2. Consider partitioning for collection_records**

If `collection_records` grows to millions of rows, consider range partitioning by `payment_date`:

```sql
-- Future: Partition by month
CREATE TABLE collection_records (
  ...
) PARTITION BY RANGE (payment_date);

CREATE TABLE collection_records_2026_01 PARTITION OF collection_records
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

This would dramatically improve query performance for date-range filters, which appear to be the primary access pattern.

---

**M3. Add EXPLAIN ANALYZE for slow query logging**

Your HTTP pipeline already tracks slow requests (>1500ms). Consider also logging the PostgreSQL query plan for queries above a threshold:

```typescript
// In development/staging only
if (queryDurationMs > 500) {
  const plan = await db.execute(sql`EXPLAIN ANALYZE ${originalQuery}`);
  logger.warn('Slow query detected', { durationMs: queryDurationMs, plan });
}
```

---

**M4. Vector index tuning**

Your IVFFlat index for vector similarity search uses default settings. As data grows, you may need to tune:

```sql
-- Current
CREATE INDEX idx_data_embeddings_vector
ON data_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Better for large datasets (adjust lists based on row count)
-- Rule of thumb: lists = sqrt(rows)
CREATE INDEX idx_data_embeddings_vector
ON data_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Or consider HNSW for better recall at higher memory cost
CREATE INDEX idx_data_embeddings_vector
ON data_embeddings USING hnsw (embedding vector_cosine_ops);
```

---

#### Low Priority

**L1. Add a read replica strategy**

For analytics/reporting queries that don't need real-time data, consider routing to a read replica:

```typescript
export const readDb = drizzle(readPool);   // Read replica
export const writeDb = drizzle(writePool); // Primary

// In repositories:
// Use readDb for SELECT-only operations
// Use writeDb for INSERT/UPDATE/DELETE
```

**L2. Archive strategy for old data**

Consider archiving old audit logs, activity records, and completed backup jobs after a retention period (e.g., 90 days) to keep the main tables lean.

---

## 4. Frontend Analysis

### 4.1 Strengths

- **React Query**: Excellent choice for server state management. Device-aware `staleTime`/`gcTime` configuration shows attention to mobile performance.
- **Shadcn/Radix UI**: 25+ components with consistent design language, dark mode support, and built-in accessibility primitives.
- **Code splitting**: Strategic vendor chunking in Vite config (query, charts, excel, pdf, capture, motion) — reduces initial load.
- **CSRF protection**: Properly reads CSRF token from cookie and injects into mutation requests.
- **Error boundaries**: Class-based error boundary with retry and reload actions.
- **Real-time updates**: WebSocket integration for admin actions (kick, ban), maintenance mode, and settings updates.
- **Wouter**: Lightweight router (~1KB) instead of React Router (~12KB) — good choice for bundle size.
- **Memoization**: 224 instances of memo/useMemo/useCallback show performance awareness.

### 4.2 Improvement Recommendations

#### High Priority

**H1. Simplify auth state management**

The auth state is currently split across 6+ hooks:
```
useAppShellState
useAppShellAuthState
useAppShellAuthActions
useAppShellAuthBootstrap
useAppShellAuthEvents
useAppShellAuthLifecycle
useAppShellSessionValidation
```

This creates a complex dependency graph that's hard to reason about. Auth state changes can trigger effects in multiple hooks simultaneously.

**Recommendation:** Consolidate into a single `useAuth()` hook using `useReducer` for predictable state transitions:

```typescript
type AuthState = {
  status: 'initializing' | 'unauthenticated' | 'authenticated' | 'banned' | 'maintenance';
  user: User | null;
  activityId: string | null;
};

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; user: User; activityId: string }
  | { type: 'LOGOUT' }
  | { type: 'BANNED' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'MAINTENANCE'; payload: MaintenanceState };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { status: 'authenticated', user: action.user, activityId: action.activityId };
    case 'LOGOUT':
    case 'SESSION_EXPIRED':
      return { status: 'unauthenticated', user: null, activityId: null };
    // ...
  }
}
```

This makes auth state transitions explicit and testable.

---

**H2. Reduce bundle size with dynamic imports**

Your current vendor chunks total is significant. Some libraries are only used on specific pages:

| Library | Size (gzip) | Used On | Recommendation |
|---------|-------------|---------|----------------|
| xlsx | ~200KB | Import page only | ✅ Already chunked |
| jspdf | ~130KB | Report export only | ✅ Already chunked |
| html2canvas | ~50KB | Report capture only | ✅ Already chunked |
| recharts | ~90KB | Dashboard/Monitor only | ✅ Already chunked |
| react-icons | Variable | Icons throughout | Switch fully to Lucide (already primary) |

**Recommendation:**
1. Remove `react-icons` — you already use `lucide-react` as your primary icon library. Having both creates confusion and duplicate SVGs.
2. Keep simple route and tab transitions in CSS before adding another animation dependency.

---

**H3. Add React Query error boundary integration**

```typescript
// Current: Manual error handling in each component
const { data, error, isLoading } = useQuery({...});
if (error) return <ErrorDisplay error={error} />;

// Better: Use QueryErrorResetBoundary
import { QueryErrorResetBoundary } from '@tanstack/react-query';

<QueryErrorResetBoundary>
  {({ reset }) => (
    <ErrorBoundary onReset={reset} fallback={<ErrorFallback />}>
      <DataComponent />
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>
```

This reduces error handling boilerplate across all data-fetching components.

---

#### Medium Priority

**M1. Add optimistic updates for collection mutations**

For operations like creating/updating collection records, optimistic updates would make the UI feel instant:

```typescript
const mutation = useMutation({
  mutationFn: updateRecord,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['collection', id] });
    const previous = queryClient.getQueryData(['collection', id]);
    queryClient.setQueryData(['collection', id], (old) => ({ ...old, ...newData }));
    return { previous };
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['collection', id], context.previous);
    toast({ title: 'Update failed', variant: 'destructive' });
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['collection', id] });
  },
});
```

---

**M2. Add loading skeletons instead of spinners**

```
Current: PageSpinner (full-page loading indicator)
Better:  Content-shaped skeletons for perceived performance
```

Shadcn already provides a Skeleton component. Use it to create content-shaped placeholders:

```tsx
// Instead of
if (isLoading) return <PageSpinner />;

// Use
if (isLoading) return (
  <div className="space-y-4">
    <Skeleton className="h-8 w-[200px]" />
    <Skeleton className="h-[200px] w-full" />
    <Skeleton className="h-[200px] w-full" />
  </div>
);
```

---

**M3. WebSocket reconnection improvements**

```typescript
// Current: Fixed 5-second reconnection delay
scheduleReconnect = () => {
  reconnectRef.current = window.setTimeout(() => {
    connectWebSocket();
  }, 5000);
};

// Better: Exponential backoff with jitter
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

scheduleReconnect = (attempt: number) => {
  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
  const jitter = delay * 0.2 * Math.random();  // ±20% jitter
  reconnectRef.current = window.setTimeout(() => {
    connectWebSocket(attempt + 1);
  }, delay + jitter);
};
```

This prevents thundering herd when the server restarts and many clients try to reconnect simultaneously.

---

**M4. Add form validation feedback with Zod**

You have `@hookform/resolvers` and `zod` in dependencies but forms may not consistently use schema validation. Every form should use:

```typescript
import { zodResolver } from "@hookform/resolvers/zod";

const form = useForm({
  resolver: zodResolver(loginSchema),
  defaultValues: { username: "", password: "" },
});
```

This ensures consistent validation messages and prevents invalid submissions.

---

#### Low Priority

**L1. Consider React 19 migration**

You're on React 18.3.1. React 19 offers:
- `use()` hook for simpler data fetching
- Server Actions (if you adopt SSR later)
- Improved hydration error messages
- Better error reporting

Wait for React Query v6 to fully support React 19 before migrating.

**L2. Add keyboard shortcuts for power users**

For admin workflows (navigating between monitor sections, quick search, etc.), consider adding keyboard shortcuts via a `useHotkeys` hook.

---

## 5. UI/UX Analysis

### 5.1 Strengths

- **Shadcn/Radix foundation**: Provides consistent, accessible UI primitives out of the box.
- **Dark mode support**: `darkMode: ["class"]` in Tailwind config.
- **Toast notifications**: User feedback for mutations (success/error).
- **Error boundaries**: Graceful error recovery with retry/reload buttons.
- **Responsive design**: Tailwind's mobile-first approach with breakpoints.
- **Status colors**: Defined status colors (online, away, busy, offline) for activity indicators.
- **Real-time feedback**: WebSocket-powered admin actions (ban, kick, maintenance) provide immediate feedback.

### 5.2 Improvement Recommendations

#### High Priority

**H1. Internationalization (i18n)**

The application has hardcoded strings in both English and Malay:
```typescript
alert("Anda telah dilogout oleh pentadbir.");  // Malay
alert("Akaun anda telah disekat.");             // Malay
title: "Error"                                  // English
description: "Something went wrong"             // English
```

**Recommendation:** Implement i18n using `react-i18next` or a lightweight alternative:

```typescript
// Lightweight approach with a simple translation hook
const translations = {
  ms: {
    "auth.kicked": "Anda telah dilogout oleh pentadbir.",
    "auth.banned": "Akaun anda telah disekat.",
    "error.generic": "Sesuatu telah berlaku salah",
  },
  en: {
    "auth.kicked": "You have been logged out by an administrator.",
    "auth.banned": "Your account has been blocked.",
    "error.generic": "Something went wrong",
  }
};
```

Even if you only support Malay, extracting strings into a translation file makes it easier to:
- Maintain consistent wording
- Update text without changing code
- Add English or other languages later

---

**H2. Improve loading states and perceived performance**

- Replace full-page `PageSpinner` with page-specific skeleton layouts
- Add lightweight CSS transition animations between pages where they improve perceived performance
- Show stale data while refetching (React Query's `placeholderData` option)

---

**H3. Add confirmation dialogs for destructive actions**

Ensure all destructive operations (delete record, ban user, restore backup) use `AlertDialog` with clear consequences:

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete Record</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete the collection record for {customerName}.
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

#### Medium Priority

**M1. Accessibility improvements**

While Radix UI provides basic accessibility, you should audit for:

1. **Color contrast**: Ensure all text meets WCAG 2.1 AA standards (4.5:1 ratio for normal text)
2. **Focus management**: Ensure keyboard navigation works correctly through all interactive elements
3. **Screen reader labels**: Add `aria-label` to icon-only buttons
4. **Skip navigation**: Add a "Skip to main content" link for keyboard users
5. **Form error announcements**: Use `aria-live="polite"` for dynamic error messages

**Tool:** Run Lighthouse accessibility audit or use `axe-core` in development.

---

**M2. Mobile responsiveness audit**

Some complex pages (Monitor with dashboard/activity/analysis tabs, BackupRestore with 666 LOC) likely need mobile-specific layouts:

- Collection data tables: Consider a card-based layout on mobile instead of horizontal scrolling tables
- Monitor sections: Stack dashboard widgets vertically on small screens
- Navigation: Hamburger menu or bottom navigation for mobile

---

**M3. Progressive disclosure for complex forms**

If collection record forms have many fields (customer name, IC number, phone, account number, batch, payment date, amount, staff nickname, receipt files), consider:

1. **Multi-step forms**: Break into logical sections (Customer Info → Payment Details → Receipt Upload)
2. **Collapsible sections**: Show required fields by default, collapse optional fields
3. **Smart defaults**: Pre-fill fields based on user context (e.g., auto-select current staff nickname)

---

**M4. Data visualization improvements**

You have recharts installed. Consider:

1. **Collection trends**: Line chart showing daily/weekly/monthly collection amounts
2. **Staff performance**: Bar chart comparing collection staff performance
3. **Real-time dashboard**: Auto-refreshing metrics with subtle animations
4. **Export charts**: Allow users to export charts as images (html2canvas is already available)

---

#### Low Priority

**L1. Add empty state illustrations**

When lists are empty (no collections, no imports, no search results), show helpful empty states with:
- An illustration or icon
- A descriptive message
- A primary action button (e.g., "Create your first collection")

**L2. Add breadcrumbs for deep navigation**

You have the `Breadcrumb` Shadcn component available but may not be using it consistently. Add breadcrumbs for:
- Collection detail pages
- Admin group management
- Settings sub-pages

---

## 6. Cross-Cutting Concerns

### 6.1 Testing Strategy

**Current state:**
- 83 test files (51 server, 32 client)
- Node.js built-in test runner via `tsx --test`
- No reported test coverage percentage
- CI runs all test suites

**Recommendations:**

1. **Add coverage tracking**: Use `c8` or `nyc` to measure coverage:
   ```bash
   npx c8 tsx --test server/**/*.test.ts
   ```
   Target: 70%+ as stated in AGENTS.md

2. **Prioritize test gaps** (in order of business risk):
   - `AuthAccountService.login()` — full flow including 2FA and lockout
   - Collection record CRUD with receipt validation
   - Backup/restore operations
   - WebSocket message handling
   - Rate limiter behavior

3. **Add contract tests**: Validate that API responses match the expected shapes that the frontend depends on. This prevents silent breaking changes.

### 6.2 CI/CD Pipeline

**Current CI:**
```
checkout → install → verify node → verify hygiene → db check → schema governance
→ typecheck → client tests → script tests → http tests → services tests → routes tests
→ build → bundle budgets → smoke UI (with PostgreSQL)
```

**This is already excellent.** Additional recommendations:

1. **Add dependency vulnerability scanning**: `npm audit --audit-level=high` in CI
2. **Add bundle size tracking**: Comment on PRs with bundle size diff
3. **Add test coverage gate**: Fail CI if coverage drops below threshold
4. **Cache node_modules**: Already using `cache: npm` in setup-node ✓

### 6.3 Deployment Considerations

1. **Container-readiness**: Add a `Dockerfile` for consistent deployments:
   ```dockerfile
   FROM node:24-slim
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --production
   COPY dist-local/ ./dist-local/
   ENV NODE_ENV=production
   CMD ["node", "dist-local/server/cluster-local.js"]
   ```

2. **Environment variable validation**: Your runtime config (`runtime.ts`) already validates env vars at startup — excellent. Consider failing fast with clear error messages for required variables.

3. **Database migration strategy**: Consider running migrations as a separate step before app startup (not inside the app process) to avoid migration races in multi-instance deployments.

### 6.4 Dependency Management

**Resolved:** The `xlsx` dependency is vendored locally:
```json
"xlsx": "file:vendor/sheetjs/xlsx-0.20.2.tgz"
```

This removes install-time dependency on the SheetJS CDN while preserving the
same SheetJS build used by import/export flows. Keep the vendored artifact
integrity documented in `docs/DEPENDENCY_SUPPLY_CHAIN.md`; if an internal
artifact repository becomes available, move the same tarball there in a small
dependency-only PR.

**Dependency overrides** (good practice):
```json
"overrides": {
  "qs": "^6.15.0",
  "lodash": "^4.17.23",
  "rollup": "^4.59.0",
  "dompurify": "^3.3.3"
}
```
These override vulnerable transitive dependencies — well done.

---

## 7. Priority Recommendations

### Immediate (This Sprint)

| # | Area | Action | Impact | Effort |
|---|------|--------|--------|--------|
| 1 | Testing | Add coverage tracking with `c8` | High | Low |
| 2 | Backend | Add Zod validation middleware for route handlers | High | Medium |
| 3 | Frontend | Remove duplicate `react-icons` dependency | Medium | Low |
| 4 | Database | Add CHECK constraints for role/status/amount | Medium | Low |
| 5 | UI/UX | Extract hardcoded strings into translation files | Medium | Medium |

### Short-Term (Next 2-4 Weeks)

| # | Area | Action | Impact | Effort |
|---|------|--------|--------|--------|
| 6 | Backend | Complete repository extraction from PostgresStorage | High | Medium |
| 7 | Backend | Standardize error codes across API | Medium | Medium |
| 8 | Frontend | Simplify auth state hooks into useReducer pattern | High | Medium |
| 9 | Frontend | Replace PageSpinner with skeleton loading states | Medium | Low |
| 10 | Database | Implement cursor-based pagination for large datasets | Medium | Medium |

### Medium-Term (1-3 Months)

| # | Area | Action | Impact | Effort |
|---|------|--------|--------|--------|
| 11 | Backend | Add OpenAPI documentation generation | High | Medium |
| 12 | Frontend | Improve WebSocket reconnection with exponential backoff | Medium | Low |
| 13 | Database | Add connection pool monitoring | Medium | Low |
| 14 | UI/UX | Mobile responsiveness audit and improvements | High | High |
| 15 | Testing | Reach 70% test coverage target | High | High |

### Long-Term (3-6 Months)

| # | Area | Action | Impact | Effort |
|---|------|--------|--------|--------|
| 16 | Infrastructure | Add Dockerfile and container deployment | High | Medium |
| 17 | Database | Evaluate table partitioning for collection_records | Medium | High |
| 18 | Frontend | React 19 migration | Medium | High |
| 19 | Backend | Evaluate Fastify migration | Medium | Very High |
| 20 | Database | Add read replica strategy for analytics | Low | High |

---

## Summary

Your system is **well-architected and production-ready** in most areas. The security posture is strong, the layered architecture is clean, and the database design is solid. The main gaps are in:

1. **Testing depth** — Coverage tracking and critical-path test gaps
2. **Frontend complexity** — Auth state management needs simplification
3. **Developer experience** — API docs, consistent error codes, and i18n
4. **Performance at scale** — Pagination patterns, index tuning, and monitoring

The codebase shows thoughtful engineering decisions (circuit breakers, idempotency keys, device-aware React Query config, log sanitization). Continue focusing on production stability over feature velocity, and address the high-priority items first.
