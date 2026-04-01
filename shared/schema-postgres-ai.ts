import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dataRows, imports } from "./schema-postgres-core";

export const dataEmbeddings = pgTable("data_embeddings", {
  id: text("id").primaryKey(),
  importId: text("import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade", onUpdate: "cascade" }),
  rowId: text("row_id")
    .notNull()
    .references(() => dataRows.id, { onDelete: "cascade", onUpdate: "cascade" }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  rowIdUnique: uniqueIndex("data_embeddings_row_id_unique").on(table.rowId),
  importIdIdx: index("idx_data_embeddings_import_id").on(table.importId),
  vectorIdx: index("idx_data_embeddings_vector").using("ivfflat", table.embedding.op("vector_cosine_ops")),
}));

export const aiConversations = pgTable("ai_conversations", {
  id: text("id").primaryKey(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => aiConversations.id, { onDelete: "cascade", onUpdate: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  conversationIdx: index("idx_ai_messages_conversation_id").on(table.conversationId),
  conversationCreatedAtIdx: index("idx_ai_messages_conversation_created_at").on(
    table.conversationId,
    table.createdAt,
  ),
}));

export const aiCategoryStats = pgTable("ai_category_stats", {
  key: text("key").primaryKey(),
  total: integer("total").notNull(),
  samples: jsonb("samples").$type<Array<{ name: string; ic: string; source: string | null }>>(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  updatedAtIdx: index("idx_ai_category_stats_updated_at").on(table.updatedAt),
}));

export const aiCategoryRules = pgTable("ai_category_rules", {
  key: text("key").primaryKey(),
  terms: text("terms").array().notNull().default(sql`'{}'::text[]`),
  fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
  matchMode: text("match_mode").notNull().default("contains"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  updatedAtIdx: index("idx_ai_category_rules_updated_at").on(table.updatedAt),
}));

export const aeonBranches = pgTable("aeon_branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  branchAddress: text("branch_address"),
  phoneNumber: text("phone_number"),
  faxNumber: text("fax_number"),
  businessHour: text("business_hour"),
  dayOpen: text("day_open"),
  atmCdm: text("atm_cdm"),
  inquiryAvailability: text("inquiry_availability"),
  applicationAvailability: text("application_availability"),
  aeonLounge: text("aeon_lounge"),
  branchLat: doublePrecision("branch_lat").notNull(),
  branchLng: doublePrecision("branch_lng").notNull(),
}, (table) => ({
  latLngIdx: index("idx_aeon_branches_lat_lng").on(table.branchLat, table.branchLng),
  nameLowerUnique: uniqueIndex("idx_aeon_branches_name_unique").using(
    "btree",
    sql`lower(${table.name})`,
  ),
}));

export const aeonBranchPostcodes = pgTable("aeon_branch_postcodes", {
  postcode: text("postcode").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  sourceBranch: text("source_branch"),
  state: text("state"),
}, (table) => ({
  postcodeIdx: index("idx_aeon_postcodes").on(table.postcode),
}));
