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
    collection_daily_calendar: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "runtime-ddl"],
      "Daily collection calendar now has a reviewed Drizzle migration while runtime bootstrap remains additive for compatibility.",
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
    collection_records: drizzleReviewed(
      ["drizzle-schema", "drizzle-migration", "legacy-sql", "runtime-ddl"],
      "Collection records now have a reviewed Drizzle migration while runtime bootstrap remains additive for normalization and legacy receipt compatibility caching.",
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
    system_stability_patterns: runtimeManaged(
      "Adaptive system-learning storage still belongs to runtime DDL because it is not yet part of the shared application schema.",
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
