import {
  type User,
  type InsertUser,
  type Import,
  type InsertImport,
  type DataRow,
  type InsertDataRow,
  type UserActivity,
  type InsertUserActivity,
  type AuditLog,
  type InsertAuditLog,
  type Backup,
  type InsertBackup,
  users,
  imports,
  dataRows,
  userActivity,
  auditLogs,
  backups,
} from "../shared/schema-postgres";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { db } from "./db-postgres";
import { eq, desc, and, or, gte, lte, count, sql, inArray } from "drizzle-orm";
import crypto from "crypto";
const MAX_SEARCH_LIMIT = 200;
const ANALYTICS_TZ = process.env.ANALYTICS_TZ || "Asia/Kuala_Lumpur";
const ALLOWED_OPERATORS = new Set([
  "contains",
  "equals",
  "notEquals",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
  "isEmpty",
  "isNotEmpty",
]);
const BACKUP_CHUNK_SIZE = 500;

function detectValueType(value: string): "number" | "date" | "string" {
  if (!value) return "string";

  // number (integer / decimal)
  if (!isNaN(Number(value))) {
    return "number";
  }

  // date (ISO / yyyy-mm-dd)
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return "date";
  }

  return "string";
}

function buildSqlCondition(
  field: string,
  operator: string,
  value: string
) {
  // json_data_jsonb ->> 'field'
  const column = sql`json_data_jsonb ->> ${field}`;
  const valueType = detectValueType(value);

  switch (operator) {
    case "contains":
      return sql`${column} ILIKE ${"%" + value + "%"}`;

    case "equals":
      return sql`${column} = ${value}`;

    case "notEquals":
      return sql`${column} <> ${value}`;

    case "startsWith":
      return sql`${column} ILIKE ${value + "%"}`;

    case "endsWith":
      return sql`${column} ILIKE ${"%" + value}`;

    case "greaterThan":
      if (valueType === "number") {
        return sql`(${column})::numeric > ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date > ${value}`;
      }
      return sql`false`;

    case "lessThan":
      if (valueType === "number") {
        return sql`(${column})::numeric < ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date < ${value}`;
      }
      return sql`false`;

    case "greaterThanOrEqual":
      if (valueType === "number") {
        return sql`(${column})::numeric >= ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date >= ${value}`;
      }
      return sql`false`;

    case "lessThanOrEqual":
      if (valueType === "number") {
        return sql`(${column})::numeric <= ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date <= ${value}`;
      }
      return sql`false`;
  }
}

type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

function ensureObject(value: unknown): Record<string, any> | null {
  if (value && typeof value === "object") {
    return value as Record<string, any>;
  }
  return null;
}

  export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBan(username: string, isBanned: boolean): Promise<User | undefined>;
  getAccounts(): Promise<Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }>>;

  createImport(data: InsertImport & { createdBy?: string }): Promise<Import>;
  getImports(): Promise<Import[]>;
  getImportById(id: string): Promise<Import | undefined>;
  updateImportName(id: string, name: string): Promise<Import | undefined>;
  deleteImport(id: string): Promise<boolean>;

  createDataRow(data: InsertDataRow): Promise<DataRow>;
  getDataRowsByImport(importId: string): Promise<DataRow[]>;
  getDataRowCountByImport(importId: string): Promise<number>;
  advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number
  ): Promise<{ rows: DataRow[]; total: number }>;
  getAllColumnNames(): Promise<string[]>;

  createActivity(data: InsertUserActivity): Promise<UserActivity>;
  updateActivity(id: string, data: Partial<UserActivity>): Promise<UserActivity | undefined>;
  getActivityById(id: string): Promise<UserActivity | undefined>;
  getActiveActivities(): Promise<UserActivity[]>;
  getAllActivities(): Promise<UserActivity[]>;
  deleteActivity(id: string): Promise<boolean>;
  getFilteredActivities(filters: {
    status?: string[];
    username?: string;
    ipAddress?: string;
    browser?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<UserActivity[]>;
  deactivateUserActivities(username: string, reason?: string): Promise<void>;
  deactivateUserSessionsByFingerprint(username: string, fingerprint: string): Promise<void>;
  getBannedUsers(): Promise<Array<User & { banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null } }>>;
  isVisitorBanned(fingerprint?: string | null, ipAddress?: string | null): Promise<boolean>;
  banVisitor(params: { username: string; role: string; activityId: string; fingerprint?: string | null; ipAddress?: string | null; browser?: string | null; pcName?: string | null }): Promise<void>;
  unbanVisitor(banId: string): Promise<void>;
  getBannedSessions(): Promise<Array<{
    banId: string;
    username: string;
    role: string;
    fingerprint: string | null;
    ipAddress: string | null;
    browser: string | null;
    bannedAt: Date | null;
  }>>;

  createConversation(createdBy: string): Promise<string>;
  saveConversationMessage(conversationId: string, role: "user" | "assistant" | "system", content: string): Promise<void>;
  getConversationMessages(conversationId: string, limit?: number): Promise<Array<{ role: string; content: string }>>;
  saveEmbedding(params: { importId: string; rowId: string; content: string; embedding: number[] }): Promise<void>;
  semanticSearch(params: { embedding: number[]; limit: number; importId?: string | null }): Promise<Array<{
    rowId: string;
    importId: string;
    content: string;
    score: number;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>>;
  aiKeywordSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>>;
  aiNameSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>>;
  aiDigitsSearch(params: { digits: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>>;
  aiFuzzySearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
    score: number;
  }>>;
  findBranchesByText(params: { query: string; limit: number }): Promise<Array<{
    name: string;
    address: string | null;
    phone: string | null;
    fax: string | null;
    businessHour: string | null;
    dayOpen: string | null;
    atmCdm: string | null;
    inquiryAvailability: string | null;
    applicationAvailability: string | null;
    aeonLounge: string | null;
  }>>;
  countRowsByKeywords(params: { groups: Array<CategoryRule> }): Promise<{
    totalRows: number;
    counts: Record<string, number>;
  }>;
  getCategoryRules(): Promise<Array<{
    key: string;
    terms: string[];
    fields: string[];
    matchMode: string;
    enabled: boolean;
  }>>;
  getCategoryStats(keys: string[]): Promise<Array<{
    key: string;
    total: number;
    samples: Array<{ name: string; ic: string; source: string | null }>;
    updatedAt: Date | null;
  }>>;
  computeCategoryStatsForKeys(keys: string[], groups: Array<CategoryRule>): Promise<Array<{
    key: string;
    total: number;
    samples: Array<{ name: string; ic: string; source: string | null }>;
    updatedAt: Date | null;
  }>>;
  rebuildCategoryStats(groups: Array<CategoryRule>): Promise<void>;
  getNearestBranches(params: { lat: number; lng: number; limit?: number }): Promise<Array<{
    name: string;
    address: string | null;
    phone: string | null;
    fax: string | null;
    businessHour: string | null;
    dayOpen: string | null;
    atmCdm: string | null;
    inquiryAvailability: string | null;
    applicationAvailability: string | null;
    aeonLounge: string | null;
    distanceKm: number;
  }>>;
  getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null>;
  importBranchesFromRows(params: { importId: string; nameKey?: string | null; latKey?: string | null; lngKey?: string | null }): Promise<{ inserted: number; skipped: number; usedKeys: { nameKey: string; latKey: string; lngKey: string } }>;

  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;

  createBackup(data: InsertBackup): Promise<Backup>;
  getBackups(): Promise<Backup[]>;
  getBackupById(id: string): Promise<Backup | undefined>;
  deleteBackup(id: string): Promise<boolean>;
  getBackupDataForExport(): Promise<{
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash: string }>;
    auditLogs: AuditLog[];
  }>;
  restoreFromBackup(backupData: {
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash?: string }>;
    auditLogs: AuditLog[];
  }): Promise<{ success: boolean; stats: { imports: number; dataRows: number; users: number; auditLogs: number } }>;
}

type TopActiveUserRow = {
  username: string;
  role: string;
  loginCount: number;
  lastLogin: Date | null;
};

export class PostgresStorage implements IStorage {
  constructor() {
    this.seedDefaultUsers();
  }

  public async init() {
    await this.ensureBackupsTable();
    await this.ensurePerformanceIndexes();
    await this.ensureBannedSessionsTable();
    await this.ensureAiTables();
    await this.ensureSpatialTables();
    await this.ensureCategoryRulesTable();
    await this.ensureCategoryStatsTable();
  }

  private async ensurePerformanceIndexes() {
    try {
      await db.execute(sql`SET search_path TO public`);

      // Basic indexes for common filters/joins
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON data_rows(import_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON imports(is_deleted)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON user_activity(login_time)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_logout_time ON user_activity(logout_time)`);

      // Optional text search optimization for global search (requires pg_trgm)
      try {
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_json_text_trgm
          ON data_rows
          USING GIN ((json_data::text) gin_trgm_ops)
        `);
        // Digit search (IC/phone/account) expression indexes for speed
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. MyKad',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_idno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'ID No',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Pengenalan',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_ic_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'IC',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Card No',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account No',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account Number',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Nombor Akaun Bank Pemohon',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Akaun',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Rumah',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Bimbit',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_phone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Phone',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Handphone',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'OfficePhone',''), '[^0-9]', '', 'g')))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nob_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'NOB') gin_trgm_ops)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_employer_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'EMPLOYER NAME') gin_trgm_ops)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nature_business_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'NATURE OF BUSINESS') gin_trgm_ops)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nama_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'Nama') gin_trgm_ops)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_customer_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'Customer Name') gin_trgm_ops)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'name') gin_trgm_ops)
        `);
        // Exact-match indexes for key numeric fields (fast lookup)
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_exact
          ON data_rows (((json_data::jsonb)->>'No. MyKad'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_idno_exact
          ON data_rows (((json_data::jsonb)->>'ID No'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_exact
          ON data_rows (((json_data::jsonb)->>'No Pengenalan'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_ic_exact
          ON data_rows (((json_data::jsonb)->>'IC'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_exact
          ON data_rows (((json_data::jsonb)->>'Account No'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_exact
          ON data_rows (((json_data::jsonb)->>'Account Number'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_exact
          ON data_rows (((json_data::jsonb)->>'Card No'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_exact
          ON data_rows (((json_data::jsonb)->>'No Akaun'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_exact
          ON data_rows (((json_data::jsonb)->>'Nombor Akaun Bank Pemohon'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_exact
          ON data_rows (((json_data::jsonb)->>'No. Telefon Rumah'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_exact
          ON data_rows (((json_data::jsonb)->>'No. Telefon Bimbit'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_phone_exact
          ON data_rows (((json_data::jsonb)->>'Phone'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_exact
          ON data_rows (((json_data::jsonb)->>'Handphone'))
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_exact
          ON data_rows (((json_data::jsonb)->>'OfficePhone'))
        `);
      } catch (err: any) {
        console.warn("⚠️ pg_trgm not available; skipping trigram index:", err?.message || err);
      }
    } catch (err: any) {
      console.error("❌ Failed to ensure performance indexes:", err?.message || err);
    }
  }

  private async ensureBannedSessionsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.banned_sessions (
          id text PRIMARY KEY,
          username text NOT NULL,
          role text NOT NULL,
          activity_id text NOT NULL,
          fingerprint text,
          ip_address text,
          browser text,
          pc_name text,
          banned_at timestamp DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_fingerprint ON public.banned_sessions(fingerprint)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_ip ON public.banned_sessions(ip_address)`);
    } catch (err: any) {
      console.error("❌ Failed to ensure banned_sessions table:", err?.message || err);
    }
  }

  private async ensureAiTables() {
    try {
      await db.execute(sql`SET search_path TO public`);
      let vectorAvailable = true;
      try {
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
      } catch (err: any) {
        vectorAvailable = false;
        console.warn("⚠️ pgvector extension not available. Embeddings disabled until installed.");
      }

      if (vectorAvailable) {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.data_embeddings (
            id text PRIMARY KEY,
            import_id text NOT NULL,
            row_id text NOT NULL UNIQUE,
            content text NOT NULL,
            embedding vector(768) NOT NULL,
            created_at timestamp DEFAULT now()
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_embeddings_import_id ON public.data_embeddings(import_id)`);
        try {
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_embeddings_vector
            ON public.data_embeddings
            USING ivfflat (embedding vector_cosine_ops)
          `);
        } catch (err: any) {
          console.warn("⚠️ Failed to create ivfflat index:", err?.message || err);
        }
      }

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_conversations (
          id text PRIMARY KEY,
          created_by text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_messages (
          id text PRIMARY KEY,
          conversation_id text NOT NULL,
          role text NOT NULL,
          content text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id)`);
    } catch (err: any) {
      console.error("❌ Failed to ensure AI tables:", err?.message || err);
    }
  }

  private async ensureCategoryStatsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_category_stats (
          key text PRIMARY KEY,
          total integer NOT NULL,
          samples jsonb,
          updated_at timestamp DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_stats_updated_at ON public.ai_category_stats(updated_at)`);
    } catch (err: any) {
      console.error("❌ Failed to ensure ai_category_stats table:", err?.message || err);
    }
  }

  private async ensureCategoryRulesTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_category_rules (
          key text PRIMARY KEY,
          terms text[] NOT NULL DEFAULT '{}',
          fields text[] NOT NULL DEFAULT '{}',
          match_mode text NOT NULL DEFAULT 'contains',
          enabled boolean NOT NULL DEFAULT true,
          updated_at timestamp DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_rules_updated_at ON public.ai_category_rules(updated_at)`);

      const defaultFields = [
        "NOB",
        "NATURE OF BUSINESS",
        "Nature of Business",
        "EMPLOYER NAME",
        "EmployerName",
        "Company",
        "Nama Majikan",
        "Majikan",
        "Department",
        "Agensi",
      ];
      const defaults: CategoryRule[] = [
        {
          key: "kerajaan",
          terms: [
            "GOVERNMENT",
            "KERAJAAN",
            "PUBLIC SECTOR",
            "SECTOR AWAM",
            "KEMENTERIAN",
            "JABATAN",
            "AGENSI",
            "PERSEKUTUAN",
            "NEGERI",
            "MAJLIS",
            "KKM",
            "KPM",
            "KPT",
            "MOE",
            "MOH",
            "SEKOLAH",
            "GURU",
            "TEACHER",
            "CIKGU",
            "PENDIDIKAN",
          ],
          fields: defaultFields,
          matchMode: "contains",
          enabled: true,
        },
        {
          key: "hospital",
          terms: [
            "HEALTHCARE",
            "HOSPITAL",
            "CLINIC",
            "KLINIK",
            "KESIHATAN",
            "MEDICAL",
            "HEALTH",
          ],
          fields: defaultFields,
          matchMode: "contains",
          enabled: true,
        },
        {
          key: "hotel",
          terms: [
            "HOTEL",
            "HOSPITALITY",
            "RESORT",
            "INN",
            "MOTEL",
            "RESTAURANT",
            "SERVICE LINE",
            "HOTEL,RESTAURANT",
            "HOTEL & RESTAURANT",
          ],
          fields: defaultFields,
          matchMode: "contains",
          enabled: true,
        },
        {
          key: "polis",
          terms: ["POLIS", "POLICE", "PDRM", "IPD", "IPK", "ROYAL MALAYSIA POLICE"],
          fields: defaultFields,
          matchMode: "contains",
          enabled: true,
        },
        {
          key: "tentera",
          terms: [
            "TENTERA",
            "ARMY",
            "MILITARY",
            "ARMED FORCES",
            "ATM",
            "TUDM",
            "TLDM",
            "TENTERA DARAT",
            "TENTERA LAUT",
            "TENTERA UDARA",
            "ANGKATAN TENTERA",
            "ANGKATAN TENTERA MALAYSIA",
            "MINDEF",
            "MINISTRY OF DEFENCE",
            "KEMENTERIAN PERTAHANAN",
            "DEFENCE",
            "PERTAHANAN",
          ],
          fields: defaultFields,
          matchMode: "contains",
          enabled: true,
        },
        {
          key: "swasta",
          terms: ["SWASTA", "PRIVATE", "SDN BHD", "BHD", "ENTERPRISE", "TRADING", "LTD", "PLC"],
          fields: defaultFields,
          matchMode: "complement",
          enabled: true,
        },
      ];
      const toTextArray = (values: string[]) => {
        if (!values.length) return sql`'{}'::text[]`;
        const joined = sql.join(values.map((v) => sql`${v}`), sql`, `);
        return sql`ARRAY[${joined}]::text[]`;
      };
      for (const rule of defaults) {
        const termsSql = toTextArray(rule.terms || []);
        const fieldsSql = toTextArray(rule.fields || []);
        await db.execute(sql`
          INSERT INTO public.ai_category_rules (key, terms, fields, match_mode, enabled, updated_at)
          VALUES (${rule.key}, ${termsSql}, ${fieldsSql}, ${rule.matchMode ?? "contains"}, ${rule.enabled ?? true}, now())
          ON CONFLICT (key) DO UPDATE SET
            terms = EXCLUDED.terms,
            fields = EXCLUDED.fields,
            match_mode = EXCLUDED.match_mode,
            enabled = EXCLUDED.enabled,
            updated_at = now()
        `);
      }
    } catch (err: any) {
      console.error("❌ Failed to ensure ai_category_rules table:", err?.message || err);
    }
  }

  private async ensureSpatialTables() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.aeon_branches (
          id text PRIMARY KEY,
          name text NOT NULL,
          branch_address text,
          phone_number text,
          fax_number text,
          business_hour text,
          day_open text,
          atm_cdm text,
          inquiry_availability text,
          application_availability text,
          aeon_lounge text,
          branch_lat double precision NOT NULL,
          branch_lng double precision NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.aeon_branch_postcodes (
          postcode text PRIMARY KEY,
          lat double precision NOT NULL,
          lng double precision NOT NULL,
          source_branch text,
          state text
        )
      `);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS branch_address text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS phone_number text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS fax_number text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS business_hour text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS day_open text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS atm_cdm text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS inquiry_availability text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS application_availability text`);
      await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS aeon_lounge text`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_aeon_branches_lat_lng ON public.aeon_branches (branch_lat, branch_lng)`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_aeon_branches_name_unique ON public.aeon_branches (lower(name))`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_aeon_postcodes ON public.aeon_branch_postcodes (postcode)`);
    } catch (err: any) {
      console.warn("⚠️ Failed to ensure PostGIS tables:", err?.message || err);
    }
  }

  private async ensureBackupsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.backups (
          id text PRIMARY KEY,
          name text NOT NULL,
          created_at timestamp DEFAULT now(),
          created_by text NOT NULL,
          backup_data text NOT NULL,
          metadata text
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS backups (
          id text PRIMARY KEY,
          name text NOT NULL,
          created_at timestamp DEFAULT now(),
          created_by text NOT NULL,
          backup_data text NOT NULL,
          metadata text
        )
      `);
      await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS name text`);
      await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_at timestamp`);
      await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_by text`);
      await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS backup_data text`);
      await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS metadata text`);
      const idTypeResult = await db.execute(sql`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'backups'
          AND column_name = 'id'
        LIMIT 1
      `);
      const idType = (idTypeResult.rows?.[0] as { data_type?: string } | undefined)?.data_type;
      if (idType && idType !== "text") {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.backups_new (
            id text PRIMARY KEY,
            name text NOT NULL,
            created_at timestamp DEFAULT now(),
            created_by text NOT NULL,
            backup_data text NOT NULL,
            metadata text
          )
        `);
        await db.execute(sql`
          INSERT INTO public.backups_new (id, name, created_at, created_by, backup_data, metadata)
          SELECT
            id::text,
            COALESCE(name, 'backup')::text,
            COALESCE(created_at, now()),
            COALESCE(created_by, 'system')::text,
            COALESCE(backup_data, '{}')::text,
            metadata
          FROM public.backups
          ON CONFLICT (id) DO NOTHING
        `);
        await db.execute(sql`DROP TABLE public.backups`);
        await db.execute(sql`ALTER TABLE public.backups_new RENAME TO backups`);
      }
      const info = await db.execute(sql`SELECT current_database() AS db, current_schema() AS schema`);
      const row = info.rows?.[0] as { db?: string; schema?: string } | undefined;
      console.log(`🧾 DB info: database=${row?.db ?? "unknown"}, schema=${row?.schema ?? "unknown"}`);
    } catch (err: any) {
      console.error("❌ Failed to ensure backups table:", err?.message || err);
    }
  }

  private async seedDefaultUsers() {
    const defaultUsers = [
      { username: "superuser", password: "0441024k", role: "superuser" },
      { username: "admin1", password: "admin123", role: "admin" },
      { username: "user1", password: "user123", role: "user" },
    ];

    for (const user of defaultUsers) {
      const existing = await this.getUserByUsername(user.username);
      if (!existing) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await db.insert(users).values({
          id: crypto.randomUUID(),
          username: user.username,
          password: hashedPassword,
          role: user.role,
          isBanned: false,
        });
      }
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    const hashedPassword = await bcrypt.hash(user.password, 10);

    await db.insert(users).values({
      id,
      username: user.username,
      password: hashedPassword,
      role: user.role ?? "user",
      isBanned: false,
    });

    return {
      id,
      username: user.username,
      password: hashedPassword,
      role: user.role ?? "user",
      isBanned: false,
    };
  }

  async searchGlobalDataRows(params: {
    search: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: any[]; total: number }> {

    const { search, limit, offset } = params;

    const rowsResult = await db.execute(sql`
    SELECT
      dr.id,
      dr.import_id,
      dr.json_data as json_data_jsonb,
      i.name as import_name,
      i.filename as import_filename
    FROM data_rows dr
    JOIN imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND dr.json_data::text ILIKE ${'%' + search + '%'}
    ORDER BY dr.id
    LIMIT ${limit} OFFSET ${offset}
  `);

    const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM data_rows dr
    JOIN imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND dr.json_data::text ILIKE ${'%' + search + '%'}
  `);

    // Convert snake_case to camelCase and normalize json_data
    const convertedRows = rowsResult.rows.map((row: any, idx: number) => {
      let jsonData = row.json_data_jsonb;
      
      // Debug first row
      if (idx === 0) {
        console.log(`🔍 DEBUG first row keys: ${Object.keys(row).join(', ')}`);
        console.log(`🔍 DEBUG json_data type: ${typeof jsonData}, isArray: ${Array.isArray(jsonData)}, value sample: ${JSON.stringify(jsonData).substring(0, 100)}`);
      }

      if (typeof jsonData === "string") {
        try {
          jsonData = JSON.parse(jsonData);
        } catch (e) {
          console.log(`🔍 Failed to parse json_data as JSON, treating as string`);
        }
      }

      if (Array.isArray(jsonData)) {
        // Map array elements to generic column names col_1, col_2, etc.
        const obj: Record<string, any> = {};
        for (let i = 0; i < jsonData.length; i++) {
          obj[`col_${i + 1}`] = jsonData[i];
        }
        jsonData = obj;
        if (idx === 0) console.log(`🔍 Converted array to object with keys: ${Object.keys(jsonData).join(',')}`);
      }

      return {
        id: row.id,
        importId: row.import_id,
        importName: row.import_name,
        importFilename: row.import_filename,
        jsonDataJsonb: jsonData,
      };
    });

    const total = totalResult.rows && totalResult.rows[0] ? Number(totalResult.rows[0].total) : 0;
    return {
      rows: convertedRows,
      total,
    };
  }

  async searchSimpleDataRows(search: string) {
    return await db.execute(sql`
    SELECT
      dr.import_id as "importId",
      i.name as "importName",
      dr.json_data_jsonb as "jsonDataJsonb"
    FROM data_rows dr
    JOIN imports i ON i.id = dr.import_id
    WHERE dr.json_data_jsonb::text ILIKE ${'%' + search + '%'}
    LIMIT 200
  `);
  }

  async updateUserBan(username: string, isBanned: boolean): Promise<User | undefined> {
    await db
      .update(users)
      .set({ isBanned: isBanned })
      .where(eq(users.username, username));

    const result = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return result[0];
  }

  async createImport(data: InsertImport & { createdBy?: string }): Promise<Import> {
    const now = new Date();

    const result = await db
      .insert(imports)
      .values({
        id: crypto.randomUUID(),
        name: data.name,
        filename: data.filename,
        createdBy: data.createdBy || null,
        createdAt: new Date(),
        isDeleted: false,
      })
      .returning();

    return result[0];
  }

  async getImports(): Promise<Import[]> {
    return await db.select().from(imports).where(eq(imports.isDeleted, false)).orderBy(desc(imports.createdAt));
  }

  async getImportById(id: string): Promise<Import | undefined> {
    const result = await db
      .select()
      .from(imports)
      .where(and(eq(imports.id, id), eq(imports.isDeleted, false)))
      .limit(1);

    return result[0];
  }

  async updateImportName(id: string, name: string): Promise<Import | undefined> {
    await db.update(imports).set({ name }).where(eq(imports.id, id));
    return this.getImportById(id);
  }

  async deleteImport(id: string): Promise<boolean> {
    await db.update(imports).set({ isDeleted: true }).where(eq(imports.id, id));
    return true;
  }

  async createDataRow(data: InsertDataRow): Promise<DataRow> {
    if (!data.jsonDataJsonb || typeof data.jsonDataJsonb !== "object") {
      throw new Error("Invalid jsonDataJsonb");
    }

    const result = await db
      .insert(dataRows)
      .values({
        id: crypto.randomUUID(),
        importId: data.importId,
        jsonDataJsonb: data.jsonDataJsonb,
      })
      .returning();

    return result[0];
  }

  async getDataRowsByImport(importId: string): Promise<DataRow[]> {
    console.log("🧪 VIEWER importId received:", importId);

    const rows = await db
      .select()
      .from(dataRows)
      .where(eq(dataRows.importId, importId));

    console.log("🧪 ROW COUNT:", rows.length);

    return rows;
  }

  async getDataRowCountByImport(importId: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dataRows)
      .where(eq(dataRows.importId, importId));
    return Number(count);
  }

  async searchDataRows(params: {
    importId: string;
    search?: string | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: any[]; total: number }> {

    const { importId, search, limit, offset } = params;
    // Properly handle empty string - convert to null
    const trimmedSearch = search && search.trim() ? search.trim() : null;

    console.log(`🔍 searchDataRows called: search="${search}" -> trimmed="${trimmedSearch}"`);

    const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT);
    const safeOffset = Math.max(offset, 0);

    if (trimmedSearch && trimmedSearch.length < 2) {
      return { rows: [], total: 0 };
    }

    if (!trimmedSearch) {
      const rows = await db
        .select()
        .from(dataRows)
        .where(eq(dataRows.importId, importId))
        .limit(safeLimit)
        .offset(safeOffset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(dataRows)
        .where(eq(dataRows.importId, importId));

      console.log("🔍 searchDataRows (no search) - returned:", rows.length, "rows");

      return { rows, total: Number(count) };
    }

    // When using raw SQL, need to convert column names
    console.log(`🔍 Executing search query for: "${trimmedSearch}"`);
    
    // Cast json_data to ensure it's properly returned as object (not array)
    const rowsResult = await db.execute(sql`
    SELECT 
      id,
      import_id,
      json_data::jsonb as json_data
    FROM data_rows
    WHERE import_id = ${importId}
      AND json_data::text ILIKE ${'%' + trimmedSearch + '%'}
    ORDER BY id
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `);

    const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM data_rows
    WHERE import_id = ${importId}
      AND json_data::text ILIKE ${'%' + trimmedSearch + '%'}
  `);

    const totalCount = totalResult.rows && totalResult.rows[0] ? Number(totalResult.rows[0].total) : 0;
    console.log(`🔍 Search results: ${rowsResult.rows.length} rows found (total: ${totalCount})`);

    const convertedRows = rowsResult.rows.map((row: any) => {
      let jsonData = row.json_data;

      if (Array.isArray(jsonData)) {
        // Map array elements to generic column names col_1, col_2, etc.
        const obj: Record<string, any> = {};
        for (let i = 0; i < jsonData.length; i++) {
          obj[`col_${i + 1}`] = jsonData[i];
        }
        jsonData = obj;
        console.log(`🔍 Converted array row id=${row.id} to object with keys: ${Object.keys(jsonData).join(',')}`);
      }

      return {
        id: row.id,
        importId: row.import_id,
        jsonDataJsonb: jsonData,
      };
    });

    return {
      rows: convertedRows,
      total: totalCount,
    };
  }

  private async getAllowedSearchColumns(): Promise<Set<string>> {
    const columns = await this.getAllColumnNames();
    return new Set(columns);
  }

  async advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number
  ): Promise<{ rows: DataRow[]; total: number }> {

    // 1️⃣ Ambil import aktif
    const activeImports = await this.getImports();
    const activeImportIds = activeImports.map((imp) => imp.id);

    if (activeImportIds.length === 0) {
      return { rows: [], total: 0 };
    }

    const allowedColumns = await this.getAllowedSearchColumns();

    const safeFilters = filters.filter((f) =>
      allowedColumns.has(f.field) &&
      ALLOWED_OPERATORS.has(f.operator)
    );

    // Jika tiada filter sah, terus return kosong
    if (safeFilters.length === 0) {
      return { rows: [], total: 0 };
    }

    const conditions = safeFilters.map((filter) =>
      buildSqlCondition(filter.field, filter.operator, filter.value)
    );

    // 3️⃣ AND / OR logic
    const combinedCondition =
      logic === "AND"
        ? and(...conditions)
        : or(...conditions);

    // 4️⃣ Query terus PostgreSQL
    const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT);
    const safeOffset = Math.max(offset, 0);

    const rows = await db
      .select()
      .from(dataRows)
      .where(
        and(
          inArray(dataRows.importId, activeImportIds),
          combinedCondition
        )
      )
      .limit(safeLimit)
      .offset(safeOffset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dataRows)
      .where(
        and(
          inArray(dataRows.importId, activeImportIds),
          combinedCondition
        )
      );

    return { rows, total: Number(count) };
  }

  async getAllColumnNames(): Promise<string[]> {
    const columnSet = new Set<string>();

    // Ambil import yang masih aktif sahaja
    const activeImports = await this.getImports();
    const activeImportIds = new Set(activeImports.map((imp) => imp.id));

    const allRows = await db.select().from(dataRows);

    for (const row of allRows) {
      if (!activeImportIds.has(row.importId)) continue;

      const data = row.jsonDataJsonb;

      // 🔒 STEP 6.5.4.1 — TYPE GUARD
      if (!data || typeof data !== "object") continue;

      // 🔒 STEP 6.5.4.2 — AMBIL KEY TERUS DARI JSONB
      for (const key of Object.keys(data as Record<string, unknown>)) {
        columnSet.add(key);
      }
    }

    return Array.from(columnSet).sort();
  }

  async createActivity(data: InsertUserActivity): Promise<UserActivity> {
    const now = new Date();

    const result = await db
      .insert(userActivity)
      .values({
        id: crypto.randomUUID(),
        userId: data.userId,
        username: data.username,
        role: data.role,
        pcName: data.pcName ?? null,
        browser: data.browser ?? null,
        fingerprint: data.fingerprint ?? null,
        ipAddress: data.ipAddress ?? null,

        loginTime: now,
        logoutTime: null,
        lastActivityTime: new Date(),
        isActive: true,
        logoutReason: null,
      })
      .returning();

    return result[0];
  }

  async touchActivity(activityId: string): Promise<void> {
    await db
      .update(userActivity)
      .set({
        lastActivityTime: new Date(),
      })
      .where(eq(userActivity.id, activityId));
  }

  async updateActivity(id: string, data: Partial<UserActivity>): Promise<UserActivity | undefined> {
    const updateData: any = {};
    if (data.lastActivityTime !== undefined) updateData.lastActivityTime = data.lastActivityTime;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.logoutTime !== undefined) updateData.logoutTime = data.logoutTime;
    if (data.logoutReason !== undefined) updateData.logoutReason = data.logoutReason;

    if (Object.keys(updateData).length > 0) {
      await db.update(userActivity).set(updateData).where(eq(userActivity.id, id));
    }
    const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
    return result[0];
  }

  async getActivityById(id: string): Promise<UserActivity | undefined> {
    const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
    return result[0];
  }

  async getActiveActivities(): Promise<UserActivity[]> {
    return await db.select().from(userActivity).where(eq(userActivity.isActive, true)).orderBy(desc(userActivity.loginTime));
  }

  async getAllActivities(): Promise<(UserActivity & { status: string })[]> {
    const activities = await db
      .select()
      .from(userActivity)
      .orderBy(desc(userActivity.loginTime));

    return activities.map(a => ({
      ...a,
      status: this.computeActivityStatus(a),
    }));
  }

  async deleteActivity(id: string): Promise<boolean> {
    await db.delete(userActivity).where(eq(userActivity.id, id));
    return true;
  }

  private computeActivityStatus(activity: UserActivity): string {
    if (!activity.isActive) {
      if (activity.logoutReason === "KICKED") return "KICKED";
      if (activity.logoutReason === "BANNED") return "BANNED";
      return "LOGOUT";
    }
    if (activity.lastActivityTime) {
      const lastActive = new Date(activity.lastActivityTime).getTime();
      const now = Date.now();
      const diffMins = Math.floor((now - lastActive) / 60000);
      if (diffMins >= 5) return "IDLE";
    }
    return "ONLINE";
  }

  async getFilteredActivities(filters: {
    status?: string[];
    username?: string;
    ipAddress?: string;
    browser?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<UserActivity[]> {

    const whereConditions = [];

    if (filters.username) {
      whereConditions.push(eq(userActivity.username, filters.username));
    }

    if (filters.ipAddress) {
      whereConditions.push(eq(userActivity.ipAddress, filters.ipAddress));
    }

    if (filters.browser) {
      whereConditions.push(eq(userActivity.browser, filters.browser));
    }

    if (filters.dateFrom) {
      whereConditions.push(gte(userActivity.loginTime, filters.dateFrom));
    }

    if (filters.dateTo) {
      const endOfDay = new Date(filters.dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      whereConditions.push(lte(userActivity.loginTime, endOfDay));
    }

    const activities = await db
      .select()
      .from(userActivity)
      .where(whereConditions.length ? and(...whereConditions) : undefined)
      .orderBy(desc(userActivity.loginTime));

    if (filters.status?.length) {
      return activities.filter(a =>
        filters.status!.includes(this.computeActivityStatus(a))
      );
    }

    return activities;
  }

  async deactivateUserActivities(username: string, reason?: string): Promise<void> {
    const updateData: any = {
      isActive: false,
      logoutTime: new Date(),
    };

    if (reason) {
      updateData.logoutReason = reason;
    }

    await db
      .update(userActivity)
      .set(updateData)
      .where(
        and(
          eq(userActivity.isActive, true),
          eq(userActivity.username, username)
        )
      );
  }

  async deactivateUserSessionsByFingerprint(username: string, fingerprint: string): Promise<void> {
    await db
      .update(userActivity)
      .set({
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "NEW_SESSION",
      })
      .where(
        and(
          eq(userActivity.username, username),
          eq(userActivity.fingerprint, fingerprint),
          eq(userActivity.isActive, true)
        )
      );
  }

  async getBannedUsers(): Promise<
    Array<User & { banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null } }>
  > {
    const bannedUsers = await db
      .select()
      .from(users)
      .where(eq(users.isBanned, true));

    const enrichedUsers: Array<
      User & { banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null } }
    > = [];

    for (const user of bannedUsers) {
      const activities = await db
        .select()
        .from(userActivity)
        .where(eq(userActivity.logoutReason, "BANNED"))
        .orderBy(desc(userActivity.logoutTime));

      const lastBannedActivity = activities.find(
        (a) => a.username.toLowerCase() === user.username.toLowerCase()
      );

      const banInfo = lastBannedActivity
        ? {
          ipAddress: lastBannedActivity.ipAddress,
          browser: lastBannedActivity.browser,
          bannedAt: lastBannedActivity.logoutTime
            ? new Date(lastBannedActivity.logoutTime)
            : null,
        }
        : undefined;

      enrichedUsers.push({ ...user, banInfo });
    }

    return enrichedUsers;
  }

  async isVisitorBanned(fingerprint?: string | null, ipAddress?: string | null): Promise<boolean> {
    await this.ensureBannedSessionsTable();
    if (!fingerprint && !ipAddress) return false;
    const fp = fingerprint ?? null;
    const ip = ipAddress ?? null;
    const result = await db.execute(sql`
      SELECT id
      FROM public.banned_sessions
      WHERE (${fp}::text IS NOT NULL AND fingerprint = ${fp}::text)
         OR (${ip}::text IS NOT NULL AND ip_address = ${ip}::text)
      LIMIT 1
    `);
    return (result.rows?.length || 0) > 0;
  }

  async banVisitor(params: {
    username: string;
    role: string;
    activityId: string;
    fingerprint?: string | null;
    ipAddress?: string | null;
    browser?: string | null;
    pcName?: string | null;
  }): Promise<void> {
    await this.ensureBannedSessionsTable();
    const banId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO public.banned_sessions
        (id, username, role, activity_id, fingerprint, ip_address, browser, pc_name, banned_at)
      VALUES
        (${banId}, ${params.username}, ${params.role}, ${params.activityId},
         ${params.fingerprint ?? null}, ${params.ipAddress ?? null}, ${params.browser ?? null}, ${params.pcName ?? null},
         ${new Date()})
      ON CONFLICT DO NOTHING
    `);
  }

  async unbanVisitor(banId: string): Promise<void> {
    await this.ensureBannedSessionsTable();
    await db.execute(sql`DELETE FROM public.banned_sessions WHERE id = ${banId}`);
  }

  async getBannedSessions(): Promise<Array<{
    banId: string;
    username: string;
    role: string;
    fingerprint: string | null;
    ipAddress: string | null;
    browser: string | null;
    bannedAt: Date | null;
  }>> {
    await this.ensureBannedSessionsTable();
    const result = await db.execute(sql`
      SELECT
        id as "banId",
        username,
        role,
        fingerprint,
        ip_address as "ipAddress",
        browser,
        banned_at as "bannedAt"
      FROM public.banned_sessions
      ORDER BY banned_at DESC
    `);
    return (result.rows as any[]).map((row) => {
      let jsonData = row.jsonDataJsonb;
      if (typeof jsonData === "string") {
        try {
          jsonData = JSON.parse(jsonData);
        } catch {
          // keep as string
        }
      }
      return { ...row, jsonDataJsonb: jsonData };
    }) as any;
  }

  async createConversation(createdBy: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO public.ai_conversations (id, created_by, created_at)
      VALUES (${id}, ${createdBy}, ${new Date()})
    `);
    return id;
  }

  async saveConversationMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string
  ): Promise<void> {
    await db.execute(sql`
      INSERT INTO public.ai_messages (id, conversation_id, role, content, created_at)
      VALUES (${crypto.randomUUID()}, ${conversationId}, ${role}, ${content}, ${new Date()})
    `);
  }

  async getConversationMessages(
    conversationId: string,
    limit: number = 20
  ): Promise<Array<{ role: string; content: string }>> {
    const result = await db.execute(sql`
      SELECT role, content
      FROM public.ai_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
    return result.rows as Array<{ role: string; content: string }>;
  }

  async saveEmbedding(params: {
    importId: string;
    rowId: string;
    content: string;
    embedding: number[];
  }): Promise<void> {
    const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
    await db.execute(sql`
      INSERT INTO public.data_embeddings (id, import_id, row_id, content, embedding, created_at)
      VALUES (${crypto.randomUUID()}, ${params.importId}, ${params.rowId}, ${params.content}, ${embeddingLiteral}::vector, ${new Date()})
      ON CONFLICT (row_id) DO UPDATE SET
        import_id = EXCLUDED.import_id,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding
    `);
  }

  async semanticSearch(params: {
    embedding: number[];
    limit: number;
    importId?: string | null;
  }): Promise<Array<{
    rowId: string;
    importId: string;
    content: string;
    score: number;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>> {
    const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
    const importFilter = params.importId
      ? sql`AND e.import_id = ${params.importId}`
      : sql``;

    // reduce ivfflat probes for speed (can be tuned)
    try {
      await db.execute(sql`SET ivfflat.probes = 5`);
    } catch {
      // ignore if not supported
    }

    const result = await db.execute(sql`
      SELECT
        e.row_id as "rowId",
        e.import_id as "importId",
        e.content as "content",
        (1 - (e.embedding <=> ${embeddingLiteral}::vector))::float as "score",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_embeddings e
      JOIN data_rows dr ON dr.id = e.row_id
      LEFT JOIN imports i ON i.id = e.import_id
      WHERE (i.is_deleted = false OR i.is_deleted IS NULL)
      ${importFilter}
      ORDER BY e.embedding <=> ${embeddingLiteral}::vector
      LIMIT ${params.limit}
    `);

    return (result.rows as any[]).map((row) => {
      let jsonData = row.jsonDataJsonb;
      if (typeof jsonData === "string") {
        try {
          jsonData = JSON.parse(jsonData);
        } catch {
          // keep as string
        }
      }
      return { ...row, jsonDataJsonb: jsonData };
    }) as any;
  }

  async aiKeywordSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>> {
    const q = params.query;
    const digits = q.replace(/[^0-9]/g, "");
    const hasDigits = digits.length >= 6;
    const icKeysMatch = hasDigits
      ? sql`
        (
          coalesce((dr.json_data::jsonb)->>'No. MyKad','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No Pengenalan','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No. IC','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'IC','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'NRIC','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'MyKad','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'ID No','') = ${digits}
        )
      `
      : sql`FALSE`;
    const phoneKeysMatch = hasDigits
      ? sql`
        (
          coalesce((dr.json_data::jsonb)->>'No. Telefon Rumah','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No. Telefon Bimbit','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Telefon','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Phone','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'HP','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Handphone','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'OfficePhone','') = ${digits}
        )
      `
      : sql`FALSE`;
    const accountKeysMatch = hasDigits
      ? sql`
        (
          coalesce((dr.json_data::jsonb)->>'Nombor Akaun Bank Pemohon','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Account No','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Account Number','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No Akaun','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Card No','') = ${digits}
        )
      `
      : sql`FALSE`;

    const isIc = digits.length === 12;
    const isPhone = digits.length >= 9 && digits.length <= 11;
    const isAccount = digits.length >= 10 && digits.length <= 16;

    const whereCondition = isIc
      ? sql`(${icKeysMatch})`
      : isPhone
        ? sql`(${phoneKeysMatch})`
        : isAccount
          ? sql`(${accountKeysMatch})`
          : sql`FALSE`;
    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND ${whereCondition}
      ORDER BY dr.id
      LIMIT ${params.limit}
    `);
    return result.rows as any;
  }

  async aiNameSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>> {
    const q = String(params.query || "").trim();
    if (!q) return [];
    const nameKeysMatch = sql`
      (
        coalesce((dr.json_data::jsonb)->>'Nama','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'Customer Name','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'name','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'MAKLUMAT PEMOHON','') ILIKE ${"%" + q + "%"}
      )
    `;
    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND ${nameKeysMatch}
      ORDER BY dr.id
      LIMIT ${params.limit}
    `);
    return result.rows as any;
  }

  async aiDigitsSearch(params: { digits: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>> {
    const digits = params.digits;
    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND regexp_replace(dr.json_data::text, '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
      ORDER BY dr.id
      LIMIT ${params.limit}
    `);
    return result.rows as any;
  }

  async aiFuzzySearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
    score: number;
  }>> {
    const raw = String(params.query || "").toLowerCase().trim();
    const tokens = raw
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/gi, ""))
      .filter((t) => t.length >= 3);

    if (tokens.length === 0) return [];

    const scoreParts = tokens.map((t) =>
      sql`CASE WHEN dr.json_data::text ILIKE ${"%" + t + "%"} THEN 1 ELSE 0 END`
    );
    const whereParts = tokens.map((t) =>
      sql`dr.json_data::text ILIKE ${"%" + t + "%"}`
    );
    const scoreSql = sql.join(scoreParts, sql` + `);
    const whereSql = sql.join(whereParts, sql` OR `);

    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb",
        (${scoreSql})::int as "score"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${whereSql})
      ORDER BY "score" DESC, dr.id
      LIMIT ${params.limit}
    `);
    return result.rows as any;
  }

  async findBranchesByText(params: { query: string; limit: number }): Promise<Array<{
      name: string;
      address: string | null;
      phone: string | null;
      fax: string | null;
      businessHour: string | null;
      dayOpen: string | null;
      atmCdm: string | null;
      inquiryAvailability: string | null;
      applicationAvailability: string | null;
      aeonLounge: string | null;
    }>> {
      const q = String(params.query || "").trim();
      if (!q) return [];
      const limit = Math.max(1, Math.min(5, params.limit));
      try {
        const result = await db.execute(sql`
          SELECT
            name,
            branch_address,
            phone_number,
            fax_number,
            business_hour,
            day_open,
            atm_cdm,
            inquiry_availability,
            application_availability,
            aeon_lounge,
            GREATEST(
              similarity(coalesce(name, ''), ${q}),
              similarity(coalesce(branch_address, ''), ${q})
            ) AS score
          FROM public.aeon_branches
          WHERE
            name ILIKE ${"%" + q + "%"}
            OR branch_address ILIKE ${"%" + q + "%"}
            OR GREATEST(
              similarity(coalesce(name, ''), ${q}),
              similarity(coalesce(branch_address, ''), ${q})
            ) > 0.1
          ORDER BY
            CASE
              WHEN name ILIKE ${"%" + q + "%"} OR branch_address ILIKE ${"%" + q + "%"} THEN 0
              ELSE 1
            END,
            score DESC,
            name
          LIMIT ${limit}
        `);
        return (result.rows as any[]).map((row) => ({
          name: row.name,
          address: row.branch_address,
          phone: row.phone_number,
          fax: row.fax_number,
          businessHour: row.business_hour,
          dayOpen: row.day_open,
          atmCdm: row.atm_cdm,
          inquiryAvailability: row.inquiry_availability,
          applicationAvailability: row.application_availability,
          aeonLounge: row.aeon_lounge,
        }));
      } catch {
        const result = await db.execute(sql`
          SELECT
            name,
            branch_address,
            phone_number,
            fax_number,
            business_hour,
            day_open,
            atm_cdm,
            inquiry_availability,
            application_availability,
            aeon_lounge
          FROM public.aeon_branches
          WHERE name ILIKE ${"%" + q + "%"}
             OR branch_address ILIKE ${"%" + q + "%"}
          ORDER BY name
          LIMIT ${limit}
        `);
        return (result.rows as any[]).map((row) => ({
          name: row.name,
          address: row.branch_address,
          phone: row.phone_number,
          fax: row.fax_number,
          businessHour: row.business_hour,
          dayOpen: row.day_open,
          atmCdm: row.atm_cdm,
          inquiryAvailability: row.inquiry_availability,
          applicationAvailability: row.application_availability,
          aeonLounge: row.aeon_lounge,
        }));
      }
    }

  async countRowsByKeywords(params: { groups: Array<CategoryRule> }): Promise<{
    totalRows: number;
    counts: Record<string, number>;
  }> {
    const groups = params.groups || [];
    const countSqls: Array<any> = [];
    const matchSqlByKey = new Map<string, any>();

    for (const group of groups) {
      const terms = (group.terms || []).filter((t) => t.trim().length > 0);
      const fields = (group.fields || []).filter((f) => f.trim().length > 0);
      const matchMode = String(group.matchMode || "contains").toLowerCase();
      if (matchMode === "complement") {
        continue;
      }
      if (terms.length === 0 || fields.length === 0) {
        countSqls.push(sql`0::int as "${sql.raw(group.key)}"`);
        continue;
      }
      const termSql = matchMode === "exact"
        ? sql.join(
            fields.map((f) => {
              const list = sql.join(
                terms.map((v) => sql`${v.toUpperCase()}`),
                sql`, `
              );
              return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
            }),
            sql` OR `
          )
        : sql.join(
            terms.map((t) => {
              const perField = sql.join(
                fields.map((f) => sql`coalesce((dr.json_data::jsonb)->>${f}, '') ILIKE ${"%" + t + "%"}`),
                sql` OR `
              );
              // Fallback to full-row text so variant schemas still match (e.g., SERVICE LINE).
              return sql`((${perField}) OR dr.json_data::text ILIKE ${"%" + t + "%"})`;
            }),
            sql` OR `
          );
      matchSqlByKey.set(group.key, termSql);
      countSqls.push(
        sql`COUNT(*) FILTER (WHERE (${termSql}))::int as "${sql.raw(group.key)}"`
      );
    }

    const complementGroups = groups.filter((g) => String(g.matchMode || "").toLowerCase() === "complement");
    if (complementGroups.length > 0) {
      if (matchSqlByKey.size > 0) {
        const combined = sql.join(Array.from(matchSqlByKey.values()).map((v) => sql`(${v})`), sql` OR `);
        for (const group of complementGroups) {
          countSqls.push(
            sql`COUNT(*) FILTER (WHERE NOT (${combined}))::int as "${sql.raw(group.key)}"`
          );
        }
      } else {
        for (const group of complementGroups) {
          countSqls.push(
            sql`COUNT(*)::int as "${sql.raw(group.key)}"`
          );
        }
      }
    }

    const selectParts = countSqls.length > 0 ? sql.join(countSqls, sql`, `) : sql``;
    const res = await db.execute(sql`
      SELECT
        COUNT(*)::int as "total",
        ${selectParts}
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
    `);
    const row = (res.rows as any[])[0] || {};
    const totalRows = Number(row.total ?? 0);
    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.key] = Number(row[group.key] ?? 0);
    }
    return { totalRows, counts };
  }

  async getCategoryRules(): Promise<Array<{
    key: string;
    terms: string[];
    fields: string[];
    matchMode: string;
    enabled: boolean;
  }>> {
    const normalizeArray = (value: any): string[] => {
      if (Array.isArray(value)) {
        return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          return trimmed
            .slice(1, -1)
            .split(",")
            .map((v) => v.replace(/^\"|\"$/g, "").trim())
            .filter((v) => v.length > 0);
        }
        return [trimmed];
      }
      return [];
    };

    const result = await db.execute(sql`
      SELECT key, terms, fields, match_mode, enabled
      FROM public.ai_category_rules
      ORDER BY key
    `);
    return (result.rows as any[]).map((row) => ({
      key: String(row.key),
      terms: normalizeArray(row.terms),
      fields: normalizeArray(row.fields),
      matchMode: String(row.match_mode || "contains"),
      enabled: row.enabled !== false,
    }));
  }

  async getCategoryRulesMaxUpdatedAt(): Promise<Date | null> {
    const result = await db.execute(sql`
      SELECT MAX(updated_at) as updated_at
      FROM public.ai_category_rules
    `);
    const row = (result.rows as any[])[0];
    return row?.updated_at ? new Date(row.updated_at) : null;
  }

  async getCategoryStats(keys: string[]): Promise<Array<{
    key: string;
    total: number;
    samples: Array<{ name: string; ic: string; source: string | null }>;
    updatedAt: Date | null;
  }>> {
    if (!keys.length) return [];
    const quoted = keys.map((k) => `'${k.replace(/'/g, "''")}'`).join(",");
    const result = await db.execute(sql`
      SELECT key, total, samples, updated_at
      FROM public.ai_category_stats
      WHERE key IN (${sql.raw(quoted)})
    `);
    return (result.rows as any[]).map((row) => ({
      key: row.key,
      total: Number(row.total ?? 0),
      samples: Array.isArray(row.samples) ? row.samples : [],
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    }));
  }

  async computeCategoryStatsForKeys(keys: string[], groups: Array<CategoryRule>): Promise<Array<{
    key: string;
    total: number;
    samples: Array<{ name: string; ic: string; source: string | null }>;
    updatedAt: Date | null;
  }>> {
    if (!keys.length) return [];
    const uniqueKeys = Array.from(new Set(keys));
    const ruleMap = new Map(groups.map((g) => [g.key, g]));
    const requestedGroups = uniqueKeys
      .filter((k) => k !== "__all__")
      .map((k) => ruleMap.get(k))
      .filter((g): g is CategoryRule => Boolean(g && g.enabled !== false));

    const extractName = (data: any): string => {
      return (
        data?.["Nama"] ||
        data?.["Customer Name"] ||
        data?.["name"] ||
        data?.["MAKLUMAT PEMOHON"] ||
        "-"
      );
    };

    const extractIc = (data: any): string => {
      return (
        data?.["No. MyKad"] ||
        data?.["ID No"] ||
        data?.["No Pengenalan"] ||
        data?.["IC"] ||
        "-"
      );
    };

    const buildMatchSql = (terms: string[], fields: string[], matchMode: string) => {
      if (terms.length === 0) return null;
      if (fields.length === 0) {
        return sql.join(
          terms.map((t) => sql`dr.json_data::text ILIKE ${"%" + t + "%"}`),
          sql` OR `
        );
      }
      if (matchMode === "exact") {
        return sql.join(
          fields.map((f) => {
            const list = sql.join(
              terms.map((v) => sql`${v.toUpperCase()}`),
              sql`, `
            );
            return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
          }),
          sql` OR `
        );
      }
      return sql.join(
        terms.map((t) => {
          const perField = sql.join(
            fields.map((f) => sql`(dr.json_data::jsonb)->>${f} ILIKE ${"%" + t + "%"}`),
            sql` OR `
          );
          return sql`(${perField})`;
        }),
        sql` OR `
      );
    };

    if (uniqueKeys.includes("__all__")) {
      const totalRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
      `);
      const totalRows = Number((totalRes.rows as any[])[0]?.count ?? 0);
      await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES ('__all__', ${totalRows}, '[]'::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, updated_at = now()
      `);
    }

    for (const group of requestedGroups) {
      const terms = (group.terms || []).filter((t) => t.trim().length > 0);
      const fields = (group.fields || []).filter((f) => f.trim().length > 0);
      const matchMode = String(group.matchMode || "contains").toLowerCase();
      const termSql = buildMatchSql(terms, fields, matchMode);
      if (!termSql) {
        await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
        continue;
      }

      const countRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
      const total = Number((countRes.rows as any[])[0]?.count ?? 0);

      let samples: Array<{ name: string; ic: string; source: string | null }> = [];
      if (total > 0) {
        const sampleRes = await db.execute(sql`
          SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
          FROM data_rows dr
          JOIN imports i ON i.id = dr.import_id
          WHERE i.is_deleted = false
            AND (${termSql})
          LIMIT 10
        `);
        samples = (sampleRes.rows as any[]).map((row) => {
          let data = row.jsonData;
          if (typeof data === "string") {
            try {
              data = JSON.parse(data);
            } catch {
              data = {};
            }
          }
          const name = extractName(data);
          const ic = extractIc(data);
          const source = row.importName || row.importFilename || null;
          return { name: String(name || "-"), ic: String(ic || "-"), source };
        });
      }

      await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
    }

    return this.getCategoryStats(uniqueKeys);
  }

  async rebuildCategoryStats(groups: Array<CategoryRule>): Promise<void> {
    if (!groups.length) return;

    const totalRes = await db.execute(sql`
      SELECT COUNT(*)::int as "count"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
    `);
    const totalRows = Number((totalRes.rows as any[])[0]?.count ?? 0);
    await db.execute(sql`
      DELETE FROM public.ai_category_stats
      WHERE key <> '__all__'
    `);
    await db.execute(sql`
      INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
      VALUES ('__all__', ${totalRows}, '[]'::jsonb, now())
      ON CONFLICT (key)
    DO UPDATE SET total = EXCLUDED.total, updated_at = now()
  `);

    const extractName = (data: any): string => {
      return (
        data?.["Nama"] ||
        data?.["Customer Name"] ||
        data?.["name"] ||
        data?.["MAKLUMAT PEMOHON"] ||
        "-"
      );
    };

      const extractIc = (data: any): string => {
        return (
          data?.["No. MyKad"] ||
          data?.["ID No"] ||
          data?.["No Pengenalan"] ||
          data?.["IC"] ||
          "-"
        );
      };

    const enabledGroups = groups.filter((g) => g.enabled !== false);
    const matchSqlByKey = new Map<string, any>();

    const buildMatchSql = (terms: string[], fields: string[], matchMode: string) => {
      if (terms.length === 0) return null;
      if (fields.length === 0) {
        return sql.join(
          terms.map((t) => sql`dr.json_data::text ILIKE ${"%" + t + "%"}`),
          sql` OR `
        );
      }
      if (matchMode === "exact") {
        return sql.join(
          fields.map((f) => {
            const list = sql.join(
              terms.map((v) => sql`${v.toUpperCase()}`),
              sql`, `
            );
            return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
          }),
          sql` OR `
        );
      }
      return sql.join(
        terms.map((t) => {
          const perField = sql.join(
            fields.map((f) => sql`(dr.json_data::jsonb)->>${f} ILIKE ${"%" + t + "%"}`),
            sql` OR `
          );
          return sql`(${perField})`;
        }),
        sql` OR `
      );
    };

    const baseGroups = enabledGroups.filter((g) => String(g.matchMode || "").toLowerCase() !== "complement");
    const complementGroups = enabledGroups.filter((g) => String(g.matchMode || "").toLowerCase() === "complement");

    for (const group of baseGroups) {
      const terms = (group.terms || []).filter((t) => t.trim().length > 0);
      const fields = (group.fields || []).filter((f) => f.trim().length > 0);
      const matchMode = String(group.matchMode || "contains").toLowerCase();
      const termSql = buildMatchSql(terms, fields, matchMode);
      if (!termSql) {
        await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
        continue;
      }
      matchSqlByKey.set(group.key, termSql);

      const countRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
      const total = Number((countRes.rows as any[])[0]?.count ?? 0);

      const sampleRes = await db.execute(sql`
        SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
        LIMIT 10
      `);
      const samples = (sampleRes.rows as any[]).map((row) => {
        let data = row.jsonData;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {
            data = {};
          }
        }
        const name = extractName(data);
        const ic = extractIc(data);
        const source = row.importName || row.importFilename || null;
        return { name: String(name || "-"), ic: String(ic || "-"), source };
      });

      await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
    }

    if (complementGroups.length > 0) {
      const combined = matchSqlByKey.size > 0
        ? sql.join(Array.from(matchSqlByKey.values()).map((v) => sql`(${v})`), sql` OR `)
        : null;
      for (const group of complementGroups) {
        let total = totalRows;
        let samples: Array<{ name: string; ic: string; source: string | null }> = [];
        if (combined) {
          const countRes = await db.execute(sql`
            SELECT COUNT(*)::int as "count"
            FROM data_rows dr
            JOIN imports i ON i.id = dr.import_id
            WHERE i.is_deleted = false
              AND NOT (${combined})
          `);
          total = Number((countRes.rows as any[])[0]?.count ?? 0);

          const sampleRes = await db.execute(sql`
            SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
            FROM data_rows dr
            JOIN imports i ON i.id = dr.import_id
            WHERE i.is_deleted = false
              AND NOT (${combined})
            LIMIT 10
          `);
          samples = (sampleRes.rows as any[]).map((row) => {
            let data = row.jsonData;
            if (typeof data === "string") {
              try {
                data = JSON.parse(data);
              } catch {
                data = {};
              }
            }
            const name = extractName(data);
            const ic = extractIc(data);
            const source = row.importName || row.importFilename || null;
            return { name: String(name || "-"), ic: String(ic || "-"), source };
          });
        }

        await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
      }
    }
  }

  async getNearestBranches(params: { lat: number; lng: number; limit?: number }): Promise<Array<{
    name: string;
    address: string | null;
    phone: string | null;
    fax: string | null;
    businessHour: string | null;
    dayOpen: string | null;
    atmCdm: string | null;
    inquiryAvailability: string | null;
    applicationAvailability: string | null;
    aeonLounge: string | null;
    distanceKm: number;
  }>> {
    const limit = Math.max(1, Math.min(5, params.limit ?? 3));
    const result = await db.execute(sql`
      SELECT
        name,
        branch_address,
        phone_number,
        fax_number,
        business_hour,
        day_open,
        atm_cdm,
        inquiry_availability,
        application_availability,
        aeon_lounge,
        ST_DistanceSphere(
          ST_MakePoint(${params.lng}, ${params.lat}),
          ST_MakePoint(branch_lng, branch_lat)
        ) / 1000 AS distance_km
      FROM public.aeon_branches
      ORDER BY distance_km
      LIMIT ${limit}
    `);
    return (result.rows as any[]).map((row) => ({
      name: row.name,
      address: row.branch_address ?? null,
      phone: row.phone_number ?? null,
      fax: row.fax_number ?? null,
      businessHour: row.business_hour ?? null,
      dayOpen: row.day_open ?? null,
      atmCdm: row.atm_cdm ?? null,
      inquiryAvailability: row.inquiry_availability ?? null,
      applicationAvailability: row.application_availability ?? null,
      aeonLounge: row.aeon_lounge ?? null,
      distanceKm: Number(row.distance_km),
    }));
  }

  async getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null> {
    await this.ensureSpatialTables();
    const lookup = async () => {
      const result = await db.execute(sql`
        SELECT lat, lng
        FROM public.aeon_branch_postcodes
        WHERE postcode = ${postcode}
        LIMIT 1
      `);
      return result.rows?.[0] as any;
    };

    let row = await lookup();
    if (row) return { lat: Number(row.lat), lng: Number(row.lng) };

    // Backfill postcode table from branch addresses if empty.
    const countRes = await db.execute(sql`
      SELECT COUNT(*)::int as "count"
      FROM public.aeon_branch_postcodes
    `);
    const count = Number((countRes.rows as any[])[0]?.count ?? 0);
    if (count === 0) {
      const branches = await db.execute(sql`
        SELECT name, branch_address, branch_lat, branch_lng
        FROM public.aeon_branches
      `);
      for (const b of branches.rows as any[]) {
        const address = String(b.branch_address || "");
        const match = address.match(/\b\d{5}\b/);
        if (!match) continue;
        const pc = match[0];
        await db.execute(sql`
          INSERT INTO public.aeon_branch_postcodes (postcode, lat, lng, source_branch, state)
          VALUES (${pc}, ${Number(b.branch_lat)}, ${Number(b.branch_lng)}, ${String(b.name)}, null)
          ON CONFLICT (postcode) DO NOTHING
        `);
      }
      row = await lookup();
      if (row) return { lat: Number(row.lat), lng: Number(row.lng) };
    }

    return null;
  }

  async importBranchesFromRows(params: {
    importId: string;
    nameKey?: string | null;
    latKey?: string | null;
    lngKey?: string | null;
  }): Promise<{ inserted: number; skipped: number; usedKeys: { nameKey: string; latKey: string; lngKey: string } }> {
    await this.ensureSpatialTables();
    const rows = await db.execute(sql`
      SELECT id, json_data as "jsonDataJsonb"
      FROM data_rows
      WHERE import_id = ${params.importId}
    `);

    const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const detectKeys = (sample: Record<string, any>) => {
        const keys = Object.keys(sample);
        const normalized = keys.map((k) => ({ raw: k, norm: normalizeKey(k) }));
        const findBy = (candidates: string[]) => {
          const hit = normalized.find((k) => candidates.some((c) => k.norm.includes(c)));
          return hit?.raw || null;
        };
        const nameKey =
          findBy(["branchnames", "branchname", "cawangan", "branch", "nama"]) || null;
        const latKey = findBy(["latitude", "lat"]) || null;
        const lngKey = findBy(["longitude", "lng", "long"]) || null;
        const addressKey = findBy(["branchaddress", "address", "alamat"]) || null;
        const postcodeKey = findBy(["postcode", "poskod", "postalcode", "zip"]) || null;
        const phoneKey = findBy(["phonenumber", "phone", "telefon", "tel"]) || null;
        const faxKey = findBy(["faxnumber", "fax"]) || null;
        const businessHourKey = findBy(["businesshour", "operatinghour", "waktu", "jam"]) || null;
        const dayOpenKey = findBy(["dayopen", "dayopen", "day", "hari"]) || null;
      const atmKey = findBy(["atmcdm", "atm", "cdm"]) || null;
      const inquiryKey = findBy(["inquiryavailability", "inquiry"]) || null;
      const applicationKey = findBy(["applicationavailability", "application"]) || null;
        const loungeKey = findBy(["aeonlounge", "lounge"]) || null;
        const stateKey = findBy(["state", "negeri"]) || null;
        return {
          nameKey,
          latKey,
          lngKey,
          addressKey,
          postcodeKey,
          phoneKey,
          faxKey,
          businessHourKey,
          dayOpenKey,
          atmKey,
          inquiryKey,
        applicationKey,
        loungeKey,
        stateKey,
      };
    };

    const firstRow = (rows.rows as any[])[0];
    const sample = firstRow && firstRow.jsonDataJsonb && typeof firstRow.jsonDataJsonb === "object"
      ? firstRow.jsonDataJsonb
      : {};
    const detected = detectKeys(sample);

      const nameKey = params.nameKey || detected.nameKey;
      const latKey = params.latKey || detected.latKey;
      const lngKey = params.lngKey || detected.lngKey;
      const addressKey = detected.addressKey;
      const postcodeKey = detected.postcodeKey;
      const phoneKey = detected.phoneKey;
      const faxKey = detected.faxKey;
      const businessHourKey = detected.businessHourKey;
      const dayOpenKey = detected.dayOpenKey;
      const atmKey = detected.atmKey;
    const inquiryKey = detected.inquiryKey;
    const applicationKey = detected.applicationKey;
    const loungeKey = detected.loungeKey;
    const stateKey = detected.stateKey;

    if (!nameKey || !latKey || !lngKey) {
      return {
        inserted: 0,
        skipped: (rows.rows as any[]).length,
        usedKeys: { nameKey: nameKey || "", latKey: latKey || "", lngKey: lngKey || "" },
      };
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of rows.rows as any[]) {
      const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
        const nameVal = data[nameKey];
        const latVal = data[latKey];
        const lngVal = data[lngKey];
        const addressVal = addressKey ? data[addressKey] : null;
        const postcodeVal = postcodeKey ? data[postcodeKey] : null;
        const phoneVal = phoneKey ? data[phoneKey] : null;
        const faxVal = faxKey ? data[faxKey] : null;
        const businessHourVal = businessHourKey ? data[businessHourKey] : null;
        const dayOpenVal = dayOpenKey ? data[dayOpenKey] : null;
        const atmVal = atmKey ? data[atmKey] : null;
      const inquiryVal = inquiryKey ? data[inquiryKey] : null;
      const applicationVal = applicationKey ? data[applicationKey] : null;
      const loungeVal = loungeKey ? data[loungeKey] : null;
      const stateVal = stateKey ? data[stateKey] : null;
      if (!nameVal || latVal === undefined || lngVal === undefined) {
        skipped += 1;
        continue;
      }
      const lat = Number(String(latVal).replace(/[^0-9.\-]/g, ""));
      const lng = Number(String(lngVal).replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        skipped += 1;
        continue;
      }
      const id = crypto.randomUUID();
        await db.execute(sql`
          INSERT INTO public.aeon_branches (
            id, name, branch_address, phone_number, fax_number, business_hour, day_open,
            atm_cdm, inquiry_availability, application_availability, aeon_lounge,
            branch_lat, branch_lng
        )
        VALUES (
          ${id},
          ${String(nameVal)},
          ${addressVal ? String(addressVal) : null},
          ${phoneVal ? String(phoneVal) : null},
          ${faxVal ? String(faxVal) : null},
          ${businessHourVal ? String(businessHourVal) : null},
          ${dayOpenVal ? String(dayOpenVal) : null},
          ${atmVal ? String(atmVal) : null},
          ${inquiryVal ? String(inquiryVal) : null},
          ${applicationVal ? String(applicationVal) : null},
          ${loungeVal ? String(loungeVal) : null},
          ${lat},
          ${lng}
        )
        ON CONFLICT DO NOTHING
        `);
        let postcode: string | null = null;
        if (postcodeVal) {
          const pcDigits = String(postcodeVal).match(/\d{5}/)?.[0] || null;
          postcode = pcDigits;
        }
        if (!postcode && addressVal) {
          const addressStr = String(addressVal);
          const postcodeMatch = addressStr.match(/\b\d{5}\b/);
          postcode = postcodeMatch ? postcodeMatch[0] : null;
        }
        if (postcode) {
          await db.execute(sql`
            INSERT INTO public.aeon_branch_postcodes (postcode, lat, lng, source_branch, state)
            VALUES (${postcode}, ${lat}, ${lng}, ${String(nameVal)}, ${stateVal ? String(stateVal) : null})
            ON CONFLICT (postcode) DO NOTHING
          `);
        }
        inserted += 1;
      }

    return { inserted, skipped, usedKeys: { nameKey, latKey, lngKey } };
  }

  async getDataRowsForEmbedding(
    importId: string,
    limit: number,
    offset: number
  ): Promise<Array<{ id: string; jsonDataJsonb: any }>> {
    const result = await db.execute(sql`
      SELECT id, json_data as "jsonDataJsonb"
      FROM data_rows
      WHERE import_id = ${importId}
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `);
    return result.rows as Array<{ id: string; jsonDataJsonb: any }>;
  }

  async getAccounts(): Promise<Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }>> {
    return await db
      .select({
        username: users.username,
        role: users.role,
        isBanned: users.isBanned,
      })
      .from(users)
      .orderBy(users.role);
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const result = await db
      .insert(auditLogs)
      .values({
        id: crypto.randomUUID(),
        action: data.action,
        performedBy: data.performedBy,
        targetUser: data.targetUser ?? null,
        targetResource: data.targetResource ?? null,
        details: data.details ?? null,
        timestamp: new Date(),
      })
      .returning();

    return result[0];
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp));
  }

  async createBackup(data: InsertBackup): Promise<Backup> {
    await this.ensureBackupsTable();
    const id = crypto.randomUUID();
    const result = await db.execute(sql`
      INSERT INTO public.backups (id, name, created_at, created_by, backup_data, metadata)
      VALUES (${id}, ${data.name}, ${new Date()}, ${data.createdBy}, ${data.backupData}, ${data.metadata ?? null})
      RETURNING
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        backup_data as "backupData",
        metadata
    `);

    return result.rows[0] as Backup;
  }

  async getBackups(): Promise<Backup[]> {
    await this.ensureBackupsTable();
    const result = await db.execute(sql`
      SELECT
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        backup_data as "backupData",
        metadata
      FROM public.backups
      ORDER BY created_at DESC
    `);
    return (result.rows as Backup[]).map((row: any) => {
      let metadata = row.metadata;
      if (typeof metadata === "string") {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = null;
        }
      }
      return { ...row, metadata };
    });
  }

  async getBackupById(id: string): Promise<Backup | undefined> {
    await this.ensureBackupsTable();
    const result = await db.execute(sql`
      SELECT
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        backup_data as "backupData",
        metadata
      FROM public.backups
      WHERE id = ${id}
      LIMIT 1
    `);
    const row = result.rows[0] as any;
    if (!row) return undefined;
    let metadata = row.metadata;
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }
    return { ...row, metadata } as Backup;
  }

  async deleteBackup(id: string): Promise<boolean> {
    await this.ensureBackupsTable();
    await db.execute(sql`DELETE FROM public.backups WHERE id = ${id}`);
    return true;
  }

  async getBackupDataForExport(): Promise<{
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash: string }>;
    auditLogs: AuditLog[];
  }> {
    const allImports = await db.select().from(imports).where(eq(imports.isDeleted, false));
    const allDataRows = await db.select().from(dataRows);
    const allUsersFromDb = await db.select().from(users);
    const allUsers = allUsersFromDb.map((u) => ({
      username: u.username,
      role: u.role,
      isBanned: u.isBanned,
      passwordHash: u.password,
    }));

    const allAuditLogs = await db.select().from(auditLogs);

    return {
      imports: allImports,
      dataRows: allDataRows,
      users: allUsers,
      auditLogs: allAuditLogs,
    };
  }

  async restoreFromBackup(backupData: {
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash?: string }>;
    auditLogs: AuditLog[];
  }): Promise<{ success: boolean; stats: { imports: number; dataRows: number; users: number; auditLogs: number } }> {
    const stats = {
      imports: 0,
      dataRows: 0,
      users: 0,
      auditLogs: 0,
    };

    const toDate = (value: unknown): Date | null => {
      if (!value) return null;
      if (value instanceof Date) return value;
      const d = new Date(value as any);
      return isNaN(d.getTime()) ? null : d;
    };

    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    await db.transaction(async (tx) => {
      if (backupData.imports.length > 0) {
        for (const chunk of chunkArray(backupData.imports, BACKUP_CHUNK_SIZE)) {
          const rows = chunk.map((imp) => ({
            id: imp.id,
            name: imp.name,
            filename: imp.filename,
            createdAt: toDate((imp as any).createdAt) ?? new Date(),
            isDeleted: (imp as any).isDeleted ?? false,
            createdBy: (imp as any).createdBy ?? null,
          }));
          // Revive deleted imports (if they already exist)
          for (const row of rows) {
            await tx
              .update(imports)
              .set({ isDeleted: false })
              .where(eq(imports.id, row.id));
          }
          await tx.insert(imports).values(rows).onConflictDoNothing();
          stats.imports += rows.length;
        }
      }

      if (backupData.dataRows.length > 0) {
        for (const chunk of chunkArray(backupData.dataRows, BACKUP_CHUNK_SIZE)) {
          const rowsToInsert = chunk.map((row) => ({
            id: row.id ?? crypto.randomUUID(),
            importId: row.importId,
            jsonDataJsonb: row.jsonDataJsonb,
          }));
          await tx.insert(dataRows).values(rowsToInsert).onConflictDoNothing();
          stats.dataRows += rowsToInsert.length;
        }
      }

      if (backupData.users.length > 0) {
        const userRows = backupData.users
          .filter((u) => u.passwordHash)
          .map((u) => ({
            id: crypto.randomUUID(),
            username: u.username,
            password: u.passwordHash!,
            role: u.role,
            isBanned: u.isBanned ?? false,
          }));
        for (const chunk of chunkArray(userRows, BACKUP_CHUNK_SIZE)) {
          await tx.insert(users).values(chunk).onConflictDoNothing();
          stats.users += chunk.length;
        }
      }

      if (backupData.auditLogs.length > 0) {
        for (const chunk of chunkArray(backupData.auditLogs, BACKUP_CHUNK_SIZE)) {
          const rows = chunk.map((log) => ({
            id: (log as any).id ?? crypto.randomUUID(),
            action: log.action,
            performedBy: log.performedBy,
            targetUser: log.targetUser ?? null,
            targetResource: log.targetResource ?? null,
            details: log.details ?? null,
            timestamp: toDate((log as any).timestamp) ?? new Date(),
          }));
          await tx.insert(auditLogs).values(rows).onConflictDoNothing();
          stats.auditLogs += rows.length;
        }
      }
    });

    return { success: true, stats };
  }

  async getDashboardSummary(): Promise<{
    totalUsers: number;
    activeSessions: number;
    loginsToday: number;
    totalDataRows: number;
    totalImports: number;
    bannedUsers: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsers] = await db
      .select({ value: count() })
      .from(users);

    const [activeSessions] = await db
      .select({ value: count() })
      .from(userActivity)
      .where(eq(userActivity.isActive, true));

    const [loginsToday] = await db
      .select({ value: count() })
      .from(userActivity)
      .where(gte(userActivity.loginTime, today));

    const [totalDataRows] = await db
      .select({ value: count() })
      .from(dataRows);

    const [totalImports] = await db
      .select({ value: count() })
      .from(imports)
      .where(eq(imports.isDeleted, false));

    const [bannedUsers] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.isBanned, true));

    return {
      totalUsers: totalUsers.value,
      activeSessions: activeSessions.value,
      loginsToday: loginsToday.value,
      totalDataRows: totalDataRows.value,
      totalImports: totalImports.value,
      bannedUsers: bannedUsers.value,
    };
  }

  async getLoginTrends(
    days: number = 7
  ): Promise<Array<{ date: string; logins: number; logouts: number }>> {

    const result = await db.execute(sql`
    WITH bounds AS (
      SELECT (NOW() AT TIME ZONE ${ANALYTICS_TZ})::date AS end_date
    ),
    days AS (
      SELECT generate_series(
        (SELECT end_date FROM bounds) - (${days} - 1) * INTERVAL '1 day',
        (SELECT end_date FROM bounds),
        INTERVAL '1 day'
      )::date AS day
    ),
    logins AS (
      SELECT
        (login_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
        COUNT(*)::int AS logins
      FROM user_activity
      WHERE login_time IS NOT NULL
      GROUP BY day
    ),
    logouts AS (
      SELECT
        (logout_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
        COUNT(*)::int AS logouts
      FROM user_activity
      WHERE logout_time IS NOT NULL
      GROUP BY day
    )
    SELECT
      days.day AS date,
      COALESCE(logins.logins, 0)::int AS logins,
      COALESCE(logouts.logouts, 0)::int AS logouts
    FROM days
    LEFT JOIN logins ON logins.day = days.day
    LEFT JOIN logouts ON logouts.day = days.day
    ORDER BY days.day ASC
  `);

    const rows = result.rows as Array<{
      date: string;
      logins: number;
      logouts: number;
    }>;

    return rows.map(r => ({
      date: r.date,
      logins: r.logins,
      logouts: r.logouts,
    }));
  }

  async getTopActiveUsers(
    limit: number = 10
  ): Promise<Array<{
    username: string;
    role: string;
    loginCount: number;
    lastLogin: string | null;
  }>> {

    const result = await db.execute(sql`
    SELECT
      username,
      role,
      COUNT(*)::int AS "loginCount",
      MAX(login_time) AS "lastLogin"
    FROM user_activity
    GROUP BY username, role
    ORDER BY "loginCount" DESC
    LIMIT ${limit}
  `);

    const rows = result.rows as TopActiveUserRow[];

    return rows.map((row) => ({
      username: row.username,
      role: row.role,
      loginCount: row.loginCount,
      lastLogin: row.lastLogin
        ? new Date(row.lastLogin).toISOString()
        : null,
    }));
  }

  async getPeakHours(): Promise<Array<{ hour: number; count: number }>> {

    const result = await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM (login_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ}))::int AS hour,
      COUNT(*)::int AS count
    FROM user_activity
    WHERE login_time IS NOT NULL
    GROUP BY hour
    ORDER BY hour ASC
  `);

    const rows = result.rows as Array<{
      hour: number;
      count: number;
    }>;

    // Pastikan 0–23 lengkap (untuk chart cantik)
    const hoursMap = new Map<number, number>();
    for (let i = 0; i < 24; i++) {
      hoursMap.set(i, 0);
    }

    for (const r of rows) {
      hoursMap.set(r.hour, r.count);
    }

    return Array.from(hoursMap.entries()).map(([hour, count]) => ({
      hour,
      count,
    }));
  }

  async getRoleDistribution(): Promise<Array<{ role: string; count: number }>> {

    const result = await db.execute(sql`
    SELECT
      role,
      COUNT(*)::int AS count
    FROM users
    GROUP BY role
    ORDER BY role ASC
  `);

    const rows = result.rows as Array<{
      role: string;
      count: number;
    }>;

    return rows;
  }
}
