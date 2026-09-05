-- Repair only from each immutable Saved Target snapshot. This deliberately
-- does not consult currently-active imports, so unticking a source cannot
-- rewrite a historical target and unrelated files can never fill a gap.
WITH expected_baseline AS (
  SELECT
    revision.id AS target_revision_id,
    aging.aging_bucket,
    COALESCE(SUM(source_row.billing_principal_osp), 0)::numeric(16,2) AS total_osp_baseline,
    COUNT(source_row.source_data_row_id)::int AS source_row_count
  FROM public.collection_osp_target_revisions revision
  CROSS JOIN LATERAL unnest(ARRAY['D3', 'D4', 'D5', 'D6']::text[]) AS aging(aging_bucket)
  LEFT JOIN public.collection_osp_target_source_rows source_row
    ON source_row.target_revision_id = revision.id
    AND source_row.aging_bucket = aging.aging_bucket
  GROUP BY revision.id, aging.aging_bucket
)
UPDATE public.collection_osp_target_aging_rows target_row
SET
  total_osp_baseline = expected.total_osp_baseline,
  target_osp = round(expected.total_osp_baseline * target_row.target_percentage / 100, 2)
FROM expected_baseline expected
WHERE target_row.target_revision_id = expected.target_revision_id
  AND target_row.aging_bucket = expected.aging_bucket
  -- No immutable row evidence means "unknown", not a confirmed RM0. Leave the
  -- old target untouched so runtime integrity checks require a controlled rebuild.
  AND expected.source_row_count > 0
  AND (
    target_row.total_osp_baseline IS DISTINCT FROM expected.total_osp_baseline
    OR target_row.target_osp IS DISTINCT FROM
      round(expected.total_osp_baseline * target_row.target_percentage / 100, 2)
  );
--> statement-breakpoint
UPDATE public.collection_osp_client_results client_result
SET osp_closed = round(
  target_row.total_osp_baseline * client_result.result_percentage / 100,
  2
)
FROM public.collection_osp_target_aging_rows target_row
WHERE target_row.target_revision_id = client_result.target_revision_id
  AND target_row.aging_bucket = client_result.aging_bucket
  AND EXISTS (
    SELECT 1
    FROM public.collection_osp_target_sources source_scope
    WHERE source_scope.target_revision_id = client_result.target_revision_id
  )
  AND client_result.osp_closed IS DISTINCT FROM round(
    target_row.total_osp_baseline * client_result.result_percentage / 100,
    2
  );
--> statement-breakpoint
ALTER TABLE public.collection_osp_target_revisions
ALTER COLUMN calculation_version SET DEFAULT 'osp-effective-settlement-v9';
--> statement-breakpoint
COMMENT ON TABLE public.collection_osp_manual_reconciliations IS
  'DEPRECATED: retained for historical audit only. V9 Billing calculations and HTTP APIs must not read or mutate this table.';
--> statement-breakpoint
COMMENT ON TABLE public.collection_osp_manual_reconciliation_audit IS
  'Append-only legacy Table C audit retained for historical evidence; zero contribution to V9 Billing Principal.';
