import { sql, type SQL } from "drizzle-orm";
import type { CollectionAgingBucket } from "../storage-postgres-collection-types";

export type CollectionOspEffectiveQueryScope = {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  /** Required authenticated viewer predicate, written against alias `target`. */
  viewerPredicate: SQL;
  expectedTargetVersion?: number;
};

/**
 * SQL-only financial reconciliation. The returned fragment intentionally has no
 * leading WITH so the same effective account relation can serve grouped tables,
 * calendar movements and a MATERIALIZED, SQL-paginated detail boundary.
 *
 * osp_effective_accounts contains one row per immutable revision/cycle, never
 * customer PII, imported JSON, or private client rows. Consumers must aggregate
 * or LIMIT in SQL, not return this relation wholesale to the application.
 * Baseline evidence remains an independent immutable snapshot SUM; it must not
 * be inferred from the subset of accounts with payment/closure events.
 */
export function buildCollectionOspEffectiveAccountCtes(input: CollectionOspEffectiveQueryScope): SQL {
  return sql`
    osp_scope AS MATERIALIZED (
      SELECT revision.id AS revision_id, target.id AS target_id,
        revision.period_from, revision.period_to, revision.aging_scope,
        ARRAY(SELECT lower(nickname) FROM unnest(revision.nickname_scope) nickname) AS nickname_scope,
        ${input.asOfDate}::date AS as_of_date
      FROM public.collection_osp_saved_targets target
      JOIN public.collection_osp_target_revisions revision ON revision.target_id = target.id
      WHERE target.id = ${input.targetId}::uuid AND revision.id = ${input.revisionId}::uuid
        AND target.status = 'ACTIVE' AND ${input.viewerPredicate}
        ${input.expectedTargetVersion === undefined ? sql`` : sql`AND target.version = ${input.expectedTargetVersion}`}
    ), osp_accounts AS MATERIALIZED (
      SELECT snapshot.target_revision_id, snapshot.source_import_id, snapshot.source_data_row_id,
        snapshot.cycle_key, snapshot.canonical_obligation_key, snapshot.aging_bucket,
        snapshot.calling_date, snapshot.calling_window_end_exclusive,
        snapshot.total_due, snapshot.billing_principal_osp
      FROM public.collection_osp_target_source_rows snapshot
      JOIN osp_scope scope ON scope.revision_id = snapshot.target_revision_id
      JOIN public.collection_osp_target_sources source
        ON source.target_revision_id = snapshot.target_revision_id
        AND source.source_import_id = snapshot.source_import_id
      WHERE snapshot.aging_bucket = ANY(scope.aging_scope)
    ), osp_system_payments AS (
      SELECT account.cycle_key, record.id, record.payment_date, record.amount,
        record.classification, record.collection_staff_nickname, record.created_at
      FROM osp_accounts account
      CROSS JOIN osp_scope scope
      JOIN public.collection_records record ON record.settlement_cycle_key = account.cycle_key
      JOIN public.collection_osp_target_sources source
        ON source.target_revision_id = account.target_revision_id
        AND source.source_import_id = record.source_import_id
      WHERE record.payment_date BETWEEN scope.period_from AND scope.period_to
        AND record.payment_date <= scope.as_of_date
        AND record.payment_date >= account.calling_date
        AND record.payment_date < account.calling_window_end_exclusive
        AND record.duplicate_receipt_flag = false
        AND record.source_import_id IS NOT NULL AND record.source_data_row_id IS NOT NULL
        AND record.source_obligation_key = account.canonical_obligation_key
        AND record.total_due = account.total_due
        AND record.billing_principal_osp = account.billing_principal_osp
        AND (cardinality(scope.nickname_scope) = 0
          OR lower(record.collection_staff_nickname) = ANY(scope.nickname_scope))
    ), osp_payment_days AS (
      SELECT cycle_key, payment_date, SUM(amount) AS day_amount,
        COUNT(*)::integer AS payment_count, bool_or(classification = 'abort_cp') AS has_abort
      FROM osp_system_payments
      GROUP BY cycle_key, payment_date
    ), osp_running_days AS (
      SELECT cycle_key, payment_date, day_amount, payment_count, has_abort,
        SUM(day_amount) OVER (PARTITION BY cycle_key ORDER BY payment_date
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS system_cumulative
      FROM osp_payment_days
    ), osp_active_manual AS (
      -- This is the current governed assertion, not deprecated V7 history.
      -- Its anchor need not pass the report's nickname/payment-date filter:
      -- evidence validity is source identity + calling window, as in View Collection.
      SELECT DISTINCT ON (account.cycle_key) account.cycle_key, record.id AS manual_record_id,
        record.pool_amount, record.manual_settlement_date
      FROM osp_accounts account
      JOIN public.collection_records record ON record.settlement_cycle_key = account.cycle_key
      JOIN public.collection_osp_target_sources source
        ON source.target_revision_id = account.target_revision_id
        AND source.source_import_id = record.source_import_id
      WHERE record.settlement_override_status = 'ACTIVE' AND record.pool_amount > 0
        AND record.manual_settlement_date >= account.calling_date
        AND record.manual_settlement_date < account.calling_window_end_exclusive
        AND record.duplicate_receipt_flag = false
        AND record.source_import_id IS NOT NULL AND record.source_data_row_id IS NOT NULL
        AND record.source_obligation_key = account.canonical_obligation_key
        AND record.total_due = account.total_due
        AND record.billing_principal_osp = account.billing_principal_osp
      ORDER BY account.cycle_key, record.manual_settlement_updated_at DESC NULLS LAST,
        record.manual_settlement_verified_at DESC NULLS LAST, record.id DESC
    ), osp_positions AS (
      SELECT account.cycle_key,
        COALESCE(SUM(day.day_amount), 0) AS system_cumulative,
        COALESCE(SUM(day.payment_count), 0)::integer AS payment_count,
        MIN(day.payment_date) FILTER (WHERE day.has_abort) AS system_abort_date,
        manual.manual_record_id, manual.manual_settlement_date,
        CASE WHEN manual.manual_settlement_date <= scope.as_of_date
          THEN manual.pool_amount ELSE 0 END AS manual_amount,
        COALESCE(SUM(day.day_amount) FILTER (
          WHERE day.payment_date <= manual.manual_settlement_date), 0) AS system_at_manual_date,
        MIN(day.payment_date) FILTER (WHERE day.payment_date <= manual.manual_settlement_date
          AND day.system_cumulative >= account.total_due) AS threshold_before_manual_date
      FROM osp_accounts account
      CROSS JOIN osp_scope scope
      LEFT JOIN osp_active_manual manual ON manual.cycle_key = account.cycle_key
      LEFT JOIN osp_running_days day ON day.cycle_key = account.cycle_key
      GROUP BY account.cycle_key, account.total_due, scope.as_of_date,
        manual.manual_record_id, manual.manual_settlement_date, manual.pool_amount
    ), osp_closure_candidates AS (
      SELECT position.*,
        CASE WHEN position.manual_amount > 0
          AND position.system_at_manual_date + position.manual_amount >= account.total_due
          THEN COALESCE(position.threshold_before_manual_date, position.manual_settlement_date)
          ELSE NULL END AS manual_closure_date
      FROM osp_positions position
      JOIN osp_accounts account ON account.cycle_key = position.cycle_key
    ), osp_scoped_closures AS (
      SELECT candidate.*,
        -- LEAST ignores NULL in PostgreSQL: factual ABORT and valid manual
        -- are a union, not additive account contributions.
        CASE WHEN LEAST(candidate.system_abort_date, candidate.manual_closure_date) < scope.period_from
          AND candidate.system_abort_date BETWEEN scope.period_from AND scope.period_to
          THEN candidate.system_abort_date
          ELSE LEAST(candidate.system_abort_date, candidate.manual_closure_date)
        END AS candidate_effective_date
      FROM osp_closure_candidates candidate CROSS JOIN osp_scope scope
    ), osp_effective_accounts AS (
      SELECT account.*, closure.system_cumulative, closure.payment_count,
        closure.manual_record_id, closure.manual_amount,
        CASE WHEN closure.manual_amount > 0 THEN closure.manual_settlement_date ELSE NULL END AS manual_effective_date,
        closure.system_cumulative + closure.manual_amount AS reconciled_cumulative,
        GREATEST(account.total_due - closure.system_cumulative - closure.manual_amount, 0) AS remaining_amount,
        closure.system_abort_date,
        closure.system_abort_date IS NOT NULL AS system_closed,
        CASE WHEN closure.candidate_effective_date BETWEEN scope.period_from AND scope.period_to
          THEN closure.candidate_effective_date ELSE NULL END AS effective_closure_date,
        COALESCE(closure.candidate_effective_date BETWEEN scope.period_from AND scope.period_to, false) AS reconciled_closed,
        CASE WHEN closure.system_abort_date IS NOT NULL THEN 'SYSTEM_ABORT_CP'
          WHEN closure.candidate_effective_date BETWEEN scope.period_from AND scope.period_to
            AND closure.manual_amount > 0 THEN 'MANUAL_VERIFIED_ABORT'
          ELSE 'OPEN' END AS contribution_source,
        closure.system_abort_date IS NOT NULL AND closure.manual_amount > 0 AS manual_superseded
      FROM osp_accounts account
      JOIN osp_scoped_closures closure ON closure.cycle_key = account.cycle_key
      CROSS JOIN osp_scope scope
    )
  `;
}

/** Four rows only; NUMERIC values remain exact strings across the pg boundary. */
export function buildCollectionOspAgingAggregateQuery(input: CollectionOspEffectiveQueryScope): SQL {
  return sql`
    WITH ${buildCollectionOspEffectiveAccountCtes(input)},
    osp_snapshot_baselines AS (
      SELECT snapshot.aging_bucket, COUNT(*)::integer AS source_row_count,
        SUM(snapshot.billing_principal_osp) AS snapshot_total_osp
      FROM public.collection_osp_target_source_rows snapshot
      JOIN osp_scope scope ON scope.revision_id = snapshot.target_revision_id
      GROUP BY snapshot.aging_bucket
    ), osp_aging_closures AS (
      SELECT aging_bucket, SUM(payment_count)::integer AS payment_count,
        COALESCE(SUM(billing_principal_osp) FILTER (WHERE system_closed), 0) AS system_osp_closed,
        COUNT(*) FILTER (WHERE system_closed)::integer AS system_account_count,
        COALESCE(SUM(billing_principal_osp) FILTER (WHERE reconciled_closed), 0) AS reconciled_osp_closed,
        COUNT(*) FILTER (WHERE reconciled_closed)::integer AS reconciled_account_count,
        COALESCE(SUM(billing_principal_osp) FILTER (WHERE contribution_source = 'MANUAL_VERIFIED_ABORT'), 0) AS manual_osp_closed,
        COUNT(*) FILTER (WHERE contribution_source = 'MANUAL_VERIFIED_ABORT')::integer AS manual_account_count
      FROM osp_effective_accounts GROUP BY aging_bucket
    )
    SELECT aging.aging_bucket, config.total_osp_baseline::text, config.target_percentage::text,
      config.target_osp::text, COALESCE(snapshot.snapshot_total_osp, 0)::text AS snapshot_total_osp,
      COALESCE(snapshot.source_row_count, 0)::integer AS source_row_count,
      EXISTS (SELECT 1 FROM public.collection_osp_target_sources source
        WHERE source.target_revision_id = scope.revision_id) AS has_saved_source_scope,
      COALESCE(closure.payment_count, 0)::integer AS payment_count,
      COALESCE(closure.system_osp_closed, 0)::text AS system_osp_closed,
      COALESCE(closure.system_account_count, 0)::integer AS system_account_count,
      COALESCE(closure.reconciled_osp_closed, 0)::text AS reconciled_osp_closed,
      COALESCE(closure.reconciled_account_count, 0)::integer AS reconciled_account_count,
      COALESCE(closure.manual_osp_closed, 0)::text AS manual_osp_closed,
      COALESCE(closure.manual_account_count, 0)::integer AS manual_account_count
    FROM osp_scope scope CROSS JOIN LATERAL unnest(scope.aging_scope) aging(aging_bucket)
    LEFT JOIN public.collection_osp_target_aging_rows config
      ON config.target_revision_id = scope.revision_id AND config.aging_bucket = aging.aging_bucket
    LEFT JOIN osp_snapshot_baselines snapshot ON snapshot.aging_bucket = aging.aging_bucket
    LEFT JOIN osp_aging_closures closure ON closure.aging_bucket = aging.aging_bucket
    ORDER BY aging.aging_bucket
  `;
}

/** Up to 366 populated days; callers render missing days without loading accounts. */
export function buildCollectionOspDailyAggregateQuery(
  input: CollectionOspEffectiveQueryScope & { aging?: CollectionAgingBucket },
): SQL {
  return sql`
    WITH ${buildCollectionOspEffectiveAccountCtes(input)}
    SELECT effective_closure_date::text AS date,
      SUM(billing_principal_osp)::text AS osp_closed, COUNT(*)::integer AS account_count
    FROM osp_effective_accounts
    WHERE reconciled_closed
      ${input.aging ? sql`AND aging_bucket = ${input.aging}` : sql``}
    GROUP BY effective_closure_date ORDER BY effective_closure_date
  `;
}
