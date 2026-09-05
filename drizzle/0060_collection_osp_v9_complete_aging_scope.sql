-- V9 exposes one complete D3-D6 baseline in both Billing Principal tables.
-- Earlier Saved Targets could persist a UI-selected subset even though their
-- immutable aging rows were already snapshotted for every bucket.
UPDATE public.collection_osp_target_revisions
SET aging_scope = ARRAY['D3', 'D4', 'D5', 'D6']::text[]
WHERE aging_scope IS DISTINCT FROM ARRAY['D3', 'D4', 'D5', 'D6']::text[];
--> statement-breakpoint
ALTER TABLE public.collection_osp_target_revisions
  DROP CONSTRAINT IF EXISTS chk_collection_osp_target_revisions_aging_scope;
--> statement-breakpoint
ALTER TABLE public.collection_osp_target_revisions
  ADD CONSTRAINT chk_collection_osp_target_revisions_aging_scope CHECK (
    aging_scope = ARRAY['D3', 'D4', 'D5', 'D6']::text[]
  );
--> statement-breakpoint
COMMENT ON COLUMN public.collection_osp_target_revisions.aging_scope IS
  'Canonical V9 Billing scope. Every Saved Target contains D3, D4, D5, and D6; ALL is derived.';
