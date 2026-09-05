-- General Search retrieves a canonical obligation's history in this exact
-- descending order. Keep it partial so unmatched legacy rows do not bloat it.
CREATE INDEX IF NOT EXISTS idx_collection_records_obligation_history_order
ON public.collection_records(
  source_obligation_key,
  payment_date DESC,
  created_at DESC,
  id DESC
)
WHERE source_obligation_key IS NOT NULL;
--> statement-breakpoint
-- Manual settlement history is a narrow audit-log workload. Index only its
-- three immutable action types and match the repository sort order.
CREATE INDEX IF NOT EXISTS idx_audit_logs_manual_settlement_target_order
ON public.audit_logs(target_resource, timestamp DESC, id DESC)
WHERE action IN (
  'COLLECTION_MANUAL_SETTLEMENT_VERIFIED',
  'COLLECTION_MANUAL_SETTLEMENT_UPDATED',
  'COLLECTION_MANUAL_SETTLEMENT_REVOKED'
);
