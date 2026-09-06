const hybridManaged = (allowedSources, notes, migrationRoadmap) => ({
  authority: "drizzle-schema",
  mode: "hybrid-managed",
  allowedSources,
  migrationRoadmap,
  notes,
});

const drizzleReviewed = (allowedSources, notes) => ({
  authority: "drizzle-schema",
  mode: "drizzle-reviewed",
  allowedSources,
  notes,
});

const runtimeManaged = (notes) => ({
  authority: "runtime-ddl",
  mode: "runtime-managed",
  allowedSources: ["runtime-ddl"],
  notes,
});

const runtimeTransitional = (notes) => ({
  authority: "runtime-ddl",
  mode: "runtime-transitional",
  allowedSources: ["runtime-ddl"],
  notes,
});

export const schemaGovernanceManifest = {
  version: 1,
  tables: {
    account_activation_tokens: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Account activation tokens now have a reviewed Drizzle migration while runtime bootstrap remains additive for backward-compatible cleanup and foreign-key enforcement.",
    ),
    admin_group_members: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Collection access membership now has a reviewed Drizzle migration while runtime bootstrap remains additive for cleanup and compatibility.",
    ),
    admin_groups: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Collection access groups now have a reviewed Drizzle migration while runtime bootstrap remains additive for cleanup and compatibility.",
    ),
    admin_visible_nicknames: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Admin nickname visibility now has a reviewed Drizzle migration while runtime bootstrap remains additive for cleanup and seeding compatibility.",
    ),
    aeon_branch_postcodes: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl", "maintenance-script"],
      "Spatial postcode lookup tables now have a reviewed Drizzle migration while runtime bootstrap and import utilities remain additive compatibility paths.",
    ),
    aeon_branches: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl", "maintenance-script"],
      "Spatial branch lookup tables now have a reviewed Drizzle migration while runtime bootstrap and import utilities remain additive compatibility paths.",
    ),
    ai_category_rules: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "AI support rules now have a reviewed Drizzle migration while runtime bootstrap keeps older environments aligned and seeds defaults.",
    ),
    ai_category_stats: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "AI support stats now have a reviewed Drizzle migration while runtime bootstrap keeps older environments aligned.",
    ),
    ai_conversations: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "AI support conversations now have a reviewed Drizzle migration while runtime bootstrap keeps older environments aligned.",
    ),
    ai_messages: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "AI support messages now have a reviewed Drizzle migration while runtime bootstrap keeps older environments aligned.",
    ),
    audit_logs: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Audit logs now have a reviewed Drizzle migration while runtime bootstrap stays additive for backward-compatible normalization.",
    ),
    audit_migration_log: hybridManaged(
      ["drizzle-migration"],
      "Forward-only migration audit ledger records reviewed remediation decisions without mutating historical migration SQL.",
      "SKIPPED_REQUIRES_HUMAN_REVIEW: keep this forward-only migration ledger hybrid-managed until a reviewed Drizzle schema model and non-destructive migration plan are approved; target mode is drizzle-reviewed without rewriting historical audit rows.",
    ),
    debug_audit_log: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration"],
      "Operations debug route access attempts use a dedicated audit stream separate from user-facing audit logs.",
    ),
    backup_jobs: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Backup queue persistence now has a reviewed Drizzle migration while runtime bootstrap keeps legacy installs compatible.",
    ),
    backup_payload_chunks: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Chunked backup payload storage now has a reviewed Drizzle migration while runtime bootstrap remains additive for legacy installs that still rely on backup_data compatibility.",
    ),
    backups: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Backup storage now has a reviewed Drizzle migration while runtime bootstrap still handles rare legacy id normalization.",
    ),
    backups_new: runtimeTransitional(
      "Temporary swap table used only during runtime backup id normalization; not part of the steady-state schema.",
    ),
    banned_sessions: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Session-ban persistence now has a reviewed Drizzle migration while runtime bootstrap stays idempotent.",
    ),
    collection_daily_calendar: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Daily collection calendar now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility.",
    ),
    collection_daily_calendar_audit: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl", "maintenance-script"],
      "Daily collection calendar audit history now has a reviewed Drizzle migration while runtime bootstrap and the reviewed repair script remain additive for compatibility and older installs.",
    ),
    collection_daily_targets: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Daily collection targets now have a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility.",
    ),
    collection_nickname_sessions: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Nickname session state now has a reviewed Drizzle migration while runtime bootstrap remains additive for cleanup and compatibility.",
    ),
    collection_record_receipts: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Collection record receipts now have a reviewed Drizzle migration while runtime bootstrap remains additive for normalization and legacy receipt promotion compatibility.",
    ),
    collection_record_daily_rollups: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Collection reporting rollups now have a reviewed Drizzle migration while runtime bootstrap remains additive for backfill and compatibility refreshes.",
    ),
    collection_record_monthly_rollups: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Second-level collection monthly rollups now have a reviewed Drizzle migration while runtime bootstrap remains additive for backfill and compatibility refreshes.",
    ),
    collection_record_purge_history: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration"],
      "Collection retention purge history stores non-plaintext audit metadata so Saved search results can retain an authorization-scoped historical status.",
    ),
    collection_record_daily_rollup_refresh_queue: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Collection rollup refresh queue now has a reviewed Drizzle migration while runtime bootstrap remains additive for recovery and compatibility.",
    ),
    collection_records: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Collection records now have a reviewed Drizzle migration while runtime bootstrap remains additive for normalization and legacy receipt compatibility caching.",
    ),
    collection_source_configs: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Collection source validity and compatibility are governed by reviewed schema and additive runtime bootstrap.",
    ),
    collection_source_rows: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Normalized hashed Collection matching rows are governed by reviewed schema and additive runtime bootstrap.",
    ),
    collection_osp_client_results: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Versioned client-provided Billing Principal results are constrained to an immutable saved-target revision and retain actor attribution.",
    ),
    collection_osp_manual_reconciliation_audit: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Append-only superuser audit snapshots preserve every Billing Principal manual reconciliation mutation and request context; PostgreSQL triggers reject UPDATE, DELETE, and TRUNCATE at the database boundary.",
    ),
    collection_osp_manual_reconciliations: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Manual prior-payment reconciliation state is revision-scoped, versioned, PII-protected, and governed by reviewed constraints.",
    ),
    collection_osp_saved_targets: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Stable named Billing Principal target identities use soft deletion while immutable child revisions preserve reporting history.",
    ),
    collection_osp_private_client_results: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Stable authenticated account ownership isolates private Billing TABLE B target/result percentages. Legacy shared results remain separate audit-only history, without fabricated ownership or private target backfill.",
    ),
    collection_osp_target_aging_rows: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Immutable per-aging Billing OSP baselines retain the exact denominator; versioned and audited shared target-percentage edits do not overwrite viewer-private percentages.",
    ),
    collection_osp_target_revisions: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Immutable Billing Principal target revisions preserve source scope, reporting period, tracking dates, and calculation version.",
    ),
    collection_osp_target_source_rows: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Encrypted and hashed row snapshots keep saved-target reports deterministic after source configuration or import lifecycle changes.",
    ),
    collection_osp_target_sources: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Immutable source metadata snapshots keep saved-target labels and source identity independent from later import deletion.",
    ),
    collection_osp_targets: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Auditable Billing Principal target settings are governed by reviewed schema and additive runtime bootstrap.",
    ),
    collection_staff_nicknames: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Collection staff nickname access now has a reviewed Drizzle migration while runtime bootstrap remains additive for cleanup and seeding compatibility.",
    ),
    data_embeddings: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Embedding tables now have a reviewed Drizzle migration while runtime bootstrap still handles pgvector extension availability and compatibility setup.",
    ),
    data_rows: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Data-row storage now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility.",
    ),
    feature_flags: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Feature flags now have a reviewed Drizzle migration while runtime bootstrap remains additive for seeding and normalization compatibility.",
    ),
    imports: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Import storage now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility.",
    ),
    mutation_idempotency_keys: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Mutation idempotency now has a reviewed Drizzle migration while runtime bootstrap remains the compatibility path.",
    ),
    monitor_alert_incidents: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Persistent monitor alert history now has a reviewed Drizzle migration while runtime bootstrap remains additive for backfill and compatibility.",
    ),
    password_reset_requests: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Password reset requests now have a reviewed Drizzle migration while runtime bootstrap remains additive for backward-compatible cleanup and auth-lifecycle normalization.",
    ),
    role_setting_permissions: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Role setting permissions now have a reviewed Drizzle migration while runtime bootstrap remains additive for seeding and normalization compatibility.",
    ),
    setting_categories: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Setting categories now have a reviewed Drizzle migration while runtime bootstrap remains additive for seeding and normalization compatibility.",
    ),
    setting_options: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Setting options now have a reviewed Drizzle migration while runtime bootstrap remains additive for dedupe, seeding, and normalization compatibility.",
    ),
    setting_versions: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Setting versions now have a reviewed Drizzle migration while runtime bootstrap remains additive for normalization compatibility.",
    ),
    system_settings: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "System settings now have a reviewed Drizzle migration while runtime bootstrap remains additive for seeding and normalization compatibility.",
    ),
    system_stability_patterns: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Adaptive system-learning storage now has reviewed Drizzle coverage while runtime DDL remains idempotent so learning writes never break runtime flow.",
    ),
    user_activity: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "User activity now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility and cleanup.",
    ),
    users: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "User accounts now have a reviewed Drizzle migration while runtime bootstrap remains additive for legacy password-hash remediation and backward-compatible normalization.",
    ),
  },
};
