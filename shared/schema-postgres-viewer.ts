import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { imports, users } from "./schema-postgres-core";
import type { ImportDataColumnFilter } from "./common/import-data-filters";
import type { ImportDataNumericSort } from "./common/import-data-sort";

export const viewerFilterPresets = pgTable("viewer_filter_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  importId: text("import_id").notNull().references(() => imports.id, { onDelete: "cascade", onUpdate: "cascade" }),
  name: text("name").notNull(),
  columnFilters: jsonb("column_filters").$type<ImportDataColumnFilter[]>().notNull(),
  numericSort: jsonb("numeric_sort").$type<ImportDataNumericSort | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  ownerImportNameUnique: uniqueIndex("idx_viewer_presets_owner_import_name").on(table.ownerUserId, table.importId, sql`lower(${table.name})`),
  importIdx: index("idx_viewer_presets_import").on(table.importId),
  nameCheck: check("chk_viewer_presets_name", sql`char_length(${table.name}) BETWEEN 1 AND 60 AND ${table.name} = btrim(${table.name}) AND ${table.name} !~ '[[:cntrl:]]'`),
  payloadCheck: check("chk_viewer_presets_payload", sql`CASE WHEN jsonb_typeof(${table.columnFilters}) = 'array' THEN jsonb_array_length(${table.columnFilters}) <= 10 ELSE false END
    AND octet_length(${table.columnFilters}::text) <= 131072
    AND (${table.numericSort} IS NULL OR (jsonb_typeof(${table.numericSort}) = 'object' AND octet_length(${table.numericSort}::text) <= 1024))`),
}));
