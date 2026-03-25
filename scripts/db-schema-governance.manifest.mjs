const hybridManaged = (allowedSources, notes) => ({
  authority: "drizzle-schema",
  mode: "hybrid-managed",
  allowedSources,
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
    account_activation_tokens: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Auth lifecycle remains bootstrapped for backward-compatible normalization.",
    ),
    admin_group_members: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Collection access tables are modeled in Drizzle but still normalized at runtime.",
    ),
    admin_groups: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Collection access tables are modeled in Drizzle but still normalized at runtime.",
    ),
    admin_visible_nicknames: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Collection access tables are modeled in Drizzle but still normalized at runtime.",
    ),
    aeon_branch_postcodes: hybridManaged(
      ["drizzle-schema", "runtime-ddl", "maintenance-script"],
      "Spatial lookup tables are shared between typed schema, bootstrap, and import utilities.",
    ),
    aeon_branches: hybridManaged(
      ["drizzle-schema", "runtime-ddl", "maintenance-script"],
      "Spatial lookup tables are shared between typed schema, bootstrap, and import utilities.",
    ),
    ai_category_rules: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "AI support tables are typed in Drizzle while runtime bootstrap keeps older environments aligned.",
    ),
    ai_category_stats: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "AI support tables are typed in Drizzle while runtime bootstrap keeps older environments aligned.",
    ),
    ai_conversations: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "AI support tables are typed in Drizzle while runtime bootstrap keeps older environments aligned.",
    ),
    ai_messages: hybridManaged(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "The conversation ordering index is already Drizzle-reviewed while the base table remains bootstrapped.",
    ),
    audit_logs: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Audit logs now have a reviewed Drizzle migration while runtime bootstrap stays additive for backward-compatible normalization.",
    ),
    backup_jobs: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Backup queue persistence now has a reviewed Drizzle migration while runtime bootstrap keeps legacy installs compatible.",
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
    collection_daily_calendar: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Daily collection calendar remains bootstrapped while still modeled in Drizzle.",
    ),
    collection_daily_targets: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Daily collection targets remain bootstrapped while still modeled in Drizzle.",
    ),
    collection_nickname_sessions: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Nickname session state remains bootstrapped while still modeled in Drizzle.",
    ),
    collection_record_receipts: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Collection record receipts are already represented in typed schema and reviewed SQL, with runtime normalization retained.",
    ),
    collection_records: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Collection records are already represented in typed schema and reviewed SQL, with runtime normalization retained.",
    ),
    collection_staff_nicknames: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Collection access tables are modeled in Drizzle but still normalized at runtime.",
    ),
    data_embeddings: hybridManaged(
      ["drizzle-schema", "runtime-ddl"],
      "Embedding tables remain bootstrapped because vector-extension setup still happens at runtime.",
    ),
    data_rows: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Data-row storage now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility.",
    ),
    feature_flags: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Enterprise settings tables have reviewed legacy SQL and runtime normalization during the transition to full Drizzle governance.",
    ),
    imports: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Import storage now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility.",
    ),
    mutation_idempotency_keys: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Mutation idempotency now has a reviewed Drizzle migration while runtime bootstrap remains the compatibility path.",
    ),
    password_reset_requests: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Auth lifecycle remains bootstrapped for backward-compatible normalization.",
    ),
    role_setting_permissions: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Enterprise settings tables have reviewed legacy SQL and runtime normalization during the transition to full Drizzle governance.",
    ),
    setting_categories: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Enterprise settings tables have reviewed legacy SQL and runtime normalization during the transition to full Drizzle governance.",
    ),
    setting_options: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Enterprise settings tables have reviewed legacy SQL and runtime normalization during the transition to full Drizzle governance.",
    ),
    setting_versions: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Enterprise settings tables have reviewed legacy SQL and runtime normalization during the transition to full Drizzle governance.",
    ),
    system_settings: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "Enterprise settings tables have reviewed legacy SQL and runtime normalization during the transition to full Drizzle governance.",
    ),
    system_stability_patterns: runtimeManaged(
      "Adaptive system-learning storage still belongs to runtime DDL because it is not yet part of the shared application schema.",
    ),
    user_activity: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "User activity now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility and cleanup.",
    ),
    users: hybridManaged(
      ["drizzle-schema", "legacy-sql", "runtime-ddl"],
      "User accounts remain bootstrapped for backward-compatible normalization while typed schema and reviewed SQL cover the main shape.",
    ),
  },
};
