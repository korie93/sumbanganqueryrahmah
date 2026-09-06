const BACKUP_RESTORE_PRECONDITIONS = Object.freeze([
  "A verified database backup exists from immediately before npm run db:migrate.",
  "The application release artifact and previous stable artifact are both available.",
  "No new writes are allowed while the rollback restore is in progress.",
]);

const BACKUP_RESTORE_STEPS = Object.freeze([
  "Stop application workers or put the service into maintenance mode.",
  "Restore the verified pre-migration PostgreSQL backup into the target database.",
  "Restart the previous stable application artifact against the restored database.",
]);

const BACKUP_RESTORE_VALIDATION_STEPS = Object.freeze([
  "Run npm run smoke:preflight against the restored application.",
  "Verify login, dashboard read paths, collection list/read paths, and receipt preview/download.",
  "Confirm public.__drizzle_migrations no longer contains migrations newer than the restored backup.",
]);

const MIGRATION_TAGS = Object.freeze([
  "0000_ai_messages_conversation_created_at_idx",
  "0001_banned_sessions_and_schema_governance",
  "0002_reviewed_ops_tables",
  "0003_reviewed_storage_tables",
  "0004_reviewed_collection_access_tables",
  "0005_reviewed_collection_daily_tables",
  "0006_reviewed_ai_support_tables",
  "0007_reviewed_spatial_lookup_tables",
  "0008_reviewed_data_embeddings",
  "0009_reviewed_auth_lifecycle_tables",
  "0010_reviewed_settings_tables",
  "0011_reviewed_collection_record_tables",
  "0012_reviewed_users_table",
  "0013_reviewed_users_two_factor",
  "0014_reviewed_collection_record_daily_rollups",
  "0015_reviewed_collection_record_daily_rollup_refresh_queue",
  "0016_reviewed_monitor_and_monthly_rollups",
  "0017_reviewed_users_login_lockout",
  "0018_reviewed_collection_receipt_validation",
  "0019_reviewed_collection_receipt_extraction_status",
  "0020_reviewed_collection_receipt_soft_delete",
  "0021_reviewed_system_stability_patterns",
  "0022_reviewed_settings_fk_not_null",
  "0023_dusty_naoko",
  "0024_stormy_mockingbird",
  "0025_milky_albert_cleary",
  "0026_shallow_mimic",
  "0027_dear_black_widow",
  "0028_nervous_spitfire",
  "0029_dazzling_meteorite",
  "0030_fearless_agent_brand",
  "0031_backup_payload_chunk_primary_key",
  "0032_reviewed_collection_audit_foreign_keys",
  "0033_reviewed_collection_record_actor_integrity",
  "0034_reviewed_collection_record_created_by_foreign_key",
  "0035_reviewed_collection_record_created_by_delete_restrict",
  "0036_collection_daily_nickname_calendar",
  "0037_collection_daily_calendar_off_leave_type",
  "0038_collection_daily_calendar_audit",
  "0039_settings_fk_not_null_idempotency_audit",
  "0041_pii_xor_check_constraints",
  "0042_debug_audit_log",
  "0043_manager_role_permission_seed",
  "0044_import_content_hash",
  "0045_activity_device_audit",
  "0046_import_last_opened",
  "0047_collection_record_source_import",
  "0048_collection_record_source_data_row",
  "0049_collection_record_purge_history",
  "0050_collection_saved_match_details",
  "0051_collection_calling_window_settlement",
  "0052_collection_source_governance_osp",
  "0053_collection_source_governance_deferred_foreign_keys",
  "0054_collection_osp_reconciliation_persistence",
  "0055_collection_manual_verified_settlement",
  "0056_collection_osp_v9_baseline_integrity",
  "0057_collection_purge_canonical_history",
  "0058_collection_team_stable_nickname_ids",
  "0059_collection_purge_manual_settlement_history",
  "0060_collection_osp_v9_complete_aging_scope",
  "0061_collection_v9_history_lookup_indexes",
  "0062_collection_osp_private_client_ownership",
]);

export const migrationRollbackManifest = Object.freeze(
  MIGRATION_TAGS.map((migration) => {
    const isV7PersistenceMigration = migration === "0054_collection_osp_reconciliation_persistence";
    return Object.freeze({
      backupRequired: true,
      migration,
      preconditions: isV7PersistenceMigration
        ? Object.freeze([
            ...BACKUP_RESTORE_PRECONDITIONS,
            "Preserve the append-only manual-reconciliation audit ledger; do not attempt row-level rollback or disable its database triggers.",
          ])
        : BACKUP_RESTORE_PRECONDITIONS,
      rollbackSteps: BACKUP_RESTORE_STEPS,
      strategy: "backup-restore",
      validationSteps: isV7PersistenceMigration
        ? Object.freeze([
            ...BACKUP_RESTORE_VALIDATION_STEPS,
            "Verify collection_osp_manual_reconciliation_audit rejects UPDATE, DELETE, and TRUNCATE after the restored release is started.",
          ])
        : BACKUP_RESTORE_VALIDATION_STEPS,
    });
  }),
);
