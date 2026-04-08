import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

export const settingCategories = pgTable("setting_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  nameUnique: uniqueIndex("setting_categories_name_unique").on(table.name),
}));

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => settingCategories.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  value: text("value").notNull(),
  defaultValue: text("default_value"),
  isCritical: boolean("is_critical").default(false),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  keyUnique: uniqueIndex("system_settings_key_unique").on(table.key),
  categoryIdx: index("system_settings_category_id_idx").on(table.categoryId),
}));

export const settingOptions = pgTable("setting_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  settingId: uuid("setting_id").notNull().references(() => systemSettings.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  value: text("value").notNull(),
  label: text("label").notNull(),
}, (table) => ({
  settingValueUnique: uniqueIndex("idx_setting_options_unique_value").on(table.settingId, table.value),
  settingIdx: index("idx_setting_options_setting_id").on(table.settingId),
}));

export const roleSettingPermissions = pgTable("role_setting_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: text("role").notNull(),
  settingKey: text("setting_key").notNull(),
  canView: boolean("can_view").default(false),
  canEdit: boolean("can_edit").default(false),
}, (table) => ({
  roleSettingUnique: uniqueIndex("idx_role_setting_permissions_unique").on(table.role, table.settingKey),
}));

export const settingVersions = pgTable("setting_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  settingKey: text("setting_key").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: utcTimestamp("changed_at").defaultNow().notNull(),
}, (table) => ({
  settingKeyChangedAtIdx: index("idx_setting_versions_key_time").on(table.settingKey, table.changedAt.desc()),
}));

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  keyUnique: uniqueIndex("feature_flags_key_unique").on(table.key),
}));
