# Billing OSP V3 SQL reconciliation audit

Reviewed 2026-09-06 00:20 UTC. This is a bounded backend review and differential-test record, not certification of the entire feature or production performance. See `BILLING_OSP_V3_PROGRESS.md` for the main completion checklist.

## Reviewed implementation

- `server/repositories/collection-osp-effective-query.ts`: parameterized shared effective-account CTE and grouped aging/day queries.
- `server/repositories/collection-osp-v7-repository-utils.ts`: SQL viewer predicate, target metadata pagination, grouped report loader, full-period calendar, exact-day detail pagination, final authorization/version check and export dataset.
- `server/services/collection/collection-osp-v7-operations.ts`: canonical calendar period, exact-day effective-state cutoff and export access/range validation.
- `server/db-postgres.ts`, `server/db-postgres-options.ts`, `server/config/runtime.ts`: actual PostgreSQL pool and finite statement timeout.

## Financial and scope conclusions

The shared CTE produces one financial state per immutable `(target_revision_id, cycle_key)`. It does not project encrypted customer fields, imported JSON, or private TABLE B rows. Production consumers group in SQL or apply the materialized detail-page boundary before retrieving identity fields; they no longer materialize all account/payment arrays in Node merely to render A, calendar or one detail page.

Eligible payments retain the existing identity and scope conditions: selected source import, non-null linked source row, matching canonical obligation/Total Due/Billing OSP, non-duplicate receipt, configured target period, frozen calling window, as-of date, and optional case-insensitive nickname scope. Payment amounts establish settlement eligibility; the counted OSP amount remains the frozen Billing Principal OSP, once per logical account.

Current ACTIVE manual evidence is selected by governed source identity and frozen calling window, not by deprecated V7 manual history. The evidence anchor does not inherit the report's payment-date/nickname filter. A manual assertion qualifies only when its amount plus the eligible system total on its own date reaches Total Due. Later CP cannot retroactively validate an insufficient assertion. A CP-only threshold does not manufacture ABORT. Factual ABORT has current contribution precedence, but an earlier valid manual closure remains the first calendar movement. A pre-period manual closure does not erase an in-period factual ABORT.

The aging query independently returns the SUM of immutable source Billing OSP alongside saved baseline/target configuration. Repository validation still rejects missing, invalid or mismatched baselines rather than interpreting missing data as a genuine zero.

The calendar endpoint uses the complete canonical source period. Exact-day drilldown now evaluates that same full-period effective state and then filters the selected movement day. This matters when a later valid manual verification confirms an earlier CP threshold. Truncating reconciliation at the clicked date would incorrectly hide an account already included in the calendar's daily total; a real PostgreSQL regression covers that case.

## Authorization and detail boundary

The SQL builder requires an explicit viewer predicate. Production callers supply the fail-closed predicate against the target alias: authenticated stable ID/role, live active/non-banned account, and assignment for admins. Missing viewers and ordinary users are not wildcards. Target status and expected target version are checked within the query, and public repository reads recheck authorization/version before returning data.

The detail query computes full-filter account count/OSP summary in SQL, then applies deterministic `(effective_date, aging_bucket, cycle_key)` pagination in a MATERIALIZED CTE. Wide source JSON and encrypted identity joins occur after that page. Source/classification filters retain the distinction between current automatic precedence and exact-day historical manual contribution. No new confirmed financial-scope or target-access defect was found in this review after the exact-day correction.

Exports retain the canonical validity metadata. The direct export API still supports an explicit narrower movement range, whereas the visible calendar is always full validity. Specification section 59 permits the calendar summary “where applicable”; this narrower direct-export option is therefore not classified as a demonstrated specification violation. The normal UI requests full validity, and exports do not include the removed standalone OSP Closed Accounts section.

## Resource assessment and limits

Specification sections 69–71 require set-based A/calendar calculation and bounded/indexed selected-day detail. The current structure satisfies the set-based/no application N+1 design requirements and returns bounded application data: four aging rows, at most one movement row per applicable date, and the requested detail page. The 100,000-source limit is checked by a bounded SQL count before reconciliation. Existing immutable revision/cycle and payment cycle/date ordering indexes support the joins; the main performance regression checks a ten-row materialized identity boundary at 100,000 accounts.

Important operational caveat: the 250,000 eligible-payment limit is checked **after** the grouped financial query has run. It rejects an oversized result scope, but it is not an early database-work cap. If an assigned target accumulates much more history, PostgreSQL can perform substantial grouping/window work before rejection. The actual pool applies a 30,000 ms default `statement_timeout` (configurable), which bounds individual statements rather than total multi-query request time. No unbounded account/payment array is returned to Node in this path.

This is an operational capacity limitation, not evidence of an authorization bypass or an incorrect result for an accepted scope. The specification does not mandate a separate pre-aggregation payment-count query. If real workloads approach/exceed the payment cap or SQL timeout, a bounded eligible-payment preflight and measured index/query changes are reasonable follow-up work; do not merely raise timeouts or weaken the existing performance/memory assertions. Normal execution timings and `EXPLAIN ANALYZE` timings must be distinguished; instrumented execution is not a production latency guarantee.

This review did not rerun the 100,000-account benchmark concurrently with the final suite. Its result must be taken from the main agent's actual final command output, not inferred from this document. Pool lifecycle, export memory and frontend cancellation require the broader gates/browser verification outside this bounded SQL audit.

## Exact differential evidence

Command run locally against uniquely created temporary PostgreSQL databases:

```text
node --import tsx --test server/repositories/tests/collection-osp-effective-query.postgres.test.ts
```

Latest run: **3 passed, 0 failed, 0 skipped**, total approximately 7.54 seconds.

- Thirty-one account fixtures × three nickname scopes × four as-of dates compare every effective financial state to the existing BigInt reconciliation oracle. Grouped system/manual/reconciled aging totals and ALL/D3–D6 daily sums/counts are also checked. Fixtures include automatic/multiple payments, CP-only threshold, same-day/manual threshold, insufficient/manual/future/revoked assertions, later automatic precedence, before-period/manual fallback, calling-window boundaries, duplicate receipts, unlinked/unselected/other selected imports, mismatched trusted values, zero OSP and exact-cent large money.
- A real repository calendar/detail call proves the later-verification/earlier-closure day has matching count and OSP.
- Viewer/assignment/version/target/revision denial returns no aggregate rows; independent baseline evidence detects a changed saved baseline; the narrow financial relation contains no PII/JSON/private percentage projection.

An earlier run encountered PostgreSQL 42501 during fixture teardown when attempting to signal a superuser-owned process. No financial assertion failed in that run's two completed cases. The process was already absent on subsequent read-only inspection, so its exact identity was not proven; an autovacuum worker is a plausible explanation, not an observed fact. Test cleanup now only targets `client backend` sessions owned by the current database role. It does not signal system workers or unidentified foreign sessions. The one exact generated orphan fixture database was verified owned and idle, then dropped. No application/development/production database or user data was removed. The subsequent three-test run completed successfully.

## Change scope of this audit pass

Only the isolated differential test cleanup and this audit note changed during this final review pass. No application SQL, financial semantics, authorization or production configuration was changed here. The full feature goal remains subject to the main agent's complete requirement-by-requirement audit and final gates.

## Independent final backend diff review — specification section 106

Reviewed actual tracked diffs and new/untracked implementation files at 2026-09-06 00:23 UTC, without running tests/builds or changing application code. Scope: schema/migration/runtime bootstrap, backup payload and restore, storage forwarding, source selection/assignment, saved target/private-result repository writes, exact financial helpers, and new source-detail extraction. The concurrently edited export operations/routes/contracts were deliberately excluded from this final pass.

One narrow audit-completeness finding was reported to the main agent: at review time, `COLLECTION_OSP_TARGET_CREATED` details contained revision, assigned admin, source IDs, period and percentages, but not target name; `COLLECTION_OSP_TARGET_UPDATED` contained old/new name, assignment and percentages, but omitted source IDs. Source IDs remain recoverable from the immutable revision, so this is not a financial error or access leak. Nevertheless, section 48 explicitly requests those audit fields. The suggested small correction is to include target name/initial null assignment in create details and immutable source IDs/period in update details. Treat this as open until the main agent's final diff and verification show the correction; this note alone does not close it.

No additional role broadening, private-owner fallback, incorrect target-balance formula, plaintext private-backup exposure, destructive legacy migration, debug logging, or unrelated production mutation was found in the reviewed changes. Concrete checks behind that conclusion:

- Migration 0062/runtime bootstrap add nullable stable admin assignment, encrypted detail columns and the owner/revision/aging private table with foreign keys, bounds and uniqueness. They neither assign legacy targets by display name nor backfill old global client rows into private ownership. Invalid existing FK ownership fails rather than being deleted to make migration pass.
- Private reads/writes bind the authenticated stable owner, not a nickname or submitted owner. Private save locks the live account and target, validates the complete aging submission and baseline, checks optimistic row versions, and writes only generic owner/revision/count audit metadata. Shared A edits leave the immutable source/baseline revision and existing private percentages intact. Target deletion is soft deletion only.
- Private backup rows expose only row ID plus an authenticated encrypted envelope; purpose, inner identity, owner and revision are validated when read. Restore requires the original stable owner/revision/baseline and exact derived amount, uses `ON CONFLICT DO NOTHING`, and fails the enclosing transaction when private ownership cannot be restored. It does not transfer ownership by username. Snapshot Card/IC/Phone pass through fail-closed decrypt/re-encrypt helpers.
- Account backup now retains ID, lifecycle status and password restrictions. Restore does not overwrite existing accounts and rejects malformed explicit status/restrictions; this avoids silently reactivating newly backed-up disabled accounts. Legacy archives lacking those fields retain the previous compatibility defaults, a documented compatibility boundary rather than a new role grant.
- Configured source lookup/preview require a live superuser, bind search values, use bounded pages and frozen configuration locks, and check the exact supported monetary precision. Source-claim advisory locks are ordered and shared create/reassignment checks the source/period/admin conflict inside its transaction.
- A/B derivation uses integer-sen helpers and NUMERIC; Balance OSP subtracts closed OSP from the respective target, including negative values. Private ALL sums the viewer's derived targets/closed amounts. Storage/service forwarding carries the viewer context; the old unassigned global Billing report is narrowed to superuser rather than opened to staff.
- Backup statistics/order changes and explicit SQL timestamp/array casts are in scope for preserving the new data through real restore. Display extraction adds only bounded existing detail fields and does not return arbitrary imported JSON.

This is a bounded diff review, not a blanket security guarantee. The final root audit must still use current files and its own final gate results, particularly for the export-owner changes excluded here.
