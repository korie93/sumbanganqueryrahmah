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
import {
  type MaintenanceState,
  type SystemSettingCategory,
  type SystemSettingItem,
} from "./config/system-settings";
import { shouldSeedDefaultUsers } from "./config/security";
import { BackupsBootstrap } from "./internal/backupsBootstrap";
import { SettingsBootstrap } from "./internal/settingsBootstrap";
import { SpatialBootstrap } from "./internal/spatialBootstrap";
import { AuthRepository } from "./repositories/auth.repository";
import { ImportsRepository } from "./repositories/imports.repository";
import { SearchRepository } from "./repositories/search.repository";
import { ActivityRepository } from "./repositories/activity.repository";
import { AuditRepository } from "./repositories/audit.repository";
import { BackupsRepository } from "./repositories/backups.repository";
import { AnalyticsRepository } from "./repositories/analytics.repository";
import { CollectionRepository } from "./repositories/collection.repository";
import { SettingsRepository } from "./repositories/settings.repository";
const MAX_SEARCH_LIMIT = 200;
const QUERY_PAGE_LIMIT = 1000;
const MAX_COLUMN_KEYS = 500;
const STORAGE_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
const BCRYPT_COST = 12;
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
type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";

export type CollectionRecord = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  receiptFile: string | null;
  createdByLogin: string;
  collectionStaffNickname: string;
  createdAt: Date;
};

export type CollectionMonthlySummary = {
  month: number;
  monthName: string;
  totalRecords: number;
  totalAmount: number;
};

export type CollectionStaffNickname = {
  id: string;
  nickname: string;
  isActive: boolean;
  roleScope: "admin" | "user" | "both";
  createdBy: string | null;
  createdAt: Date;
};

export type CollectionNicknameAuthProfile = {
  id: string;
  nickname: string;
  isActive: boolean;
  roleScope: "admin" | "user" | "both";
  mustChangePassword: boolean;
  passwordResetBySuperuser: boolean;
  nicknamePasswordHash: string | null;
  passwordUpdatedAt: Date | null;
};

export type CollectionAdminUser = {
  id: string;
  username: string;
  role: "admin";
  isBanned: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionAdminGroup = {
  id: string;
  leaderNickname: string;
  leaderNicknameId: string | null;
  leaderIsActive: boolean;
  leaderRoleScope: "admin" | "user" | "both" | null;
  memberNicknames: string[];
  memberNicknameIds: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionNicknameSession = {
  activityId: string;
  username: string;
  userRole: string;
  nickname: string;
  verifiedAt: Date;
  updatedAt: Date;
};

export type CreateCollectionRecordInput = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: number;
  receiptFile?: string | null;
  createdByLogin: string;
  collectionStaffNickname: string;
};

export type UpdateCollectionRecordInput = {
  customerName?: string;
  icNumber?: string;
  customerPhone?: string;
  accountNumber?: string;
  batch?: CollectionBatch;
  paymentDate?: string;
  amount?: number;
  receiptFile?: string | null;
  collectionStaffNickname?: string;
};

export type CreateCollectionStaffNicknameInput = {
  nickname: string;
  createdBy: string;
  roleScope?: "admin" | "user" | "both";
};

export type UpdateCollectionStaffNicknameInput = {
  nickname?: string;
  isActive?: boolean;
  roleScope?: "admin" | "user" | "both";
};

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
  updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
  }): Promise<User | undefined>;
  getUsersByRoles(roles: string[]): Promise<Array<{
    id: string;
    username: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    passwordChangedAt: Date | null;
    isBanned: boolean | null;
  }>>;
  updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void>;
  updateUserBan(username: string, isBanned: boolean): Promise<User | undefined>;
  getAccounts(): Promise<Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }>>;
  createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord>;
  listCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
    limit?: number;
  }): Promise<CollectionRecord[]>;
  getCollectionMonthlySummary(filters: {
    year: number;
    nicknames?: string[];
    createdByLogin?: string;
  }): Promise<CollectionMonthlySummary[]>;
  getCollectionStaffNicknames(filters?: {
    activeOnly?: boolean;
    allowedRole?: "admin" | "user";
  }): Promise<CollectionStaffNickname[]>;
  getCollectionAdminUsers(): Promise<CollectionAdminUser[]>;
  getCollectionAdminUserById(adminUserId: string): Promise<CollectionAdminUser | undefined>;
  getCollectionAdminAssignedNicknameIds(adminUserId: string): Promise<string[]>;
  getCollectionAdminVisibleNicknames(
    adminUserId: string,
    filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
  ): Promise<CollectionStaffNickname[]>;
  setCollectionAdminAssignedNicknameIds(params: {
    adminUserId: string;
    nicknameIds: string[];
    createdBySuperuser: string;
  }): Promise<string[]>;
  getCollectionAdminGroups(): Promise<CollectionAdminGroup[]>;
  getCollectionAdminGroupById(groupId: string): Promise<CollectionAdminGroup | undefined>;
  createCollectionAdminGroup(params: {
    leaderNicknameId: string;
    memberNicknameIds: string[];
    createdBy: string;
  }): Promise<CollectionAdminGroup>;
  updateCollectionAdminGroup(params: {
    groupId: string;
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
    updatedBy: string;
  }): Promise<CollectionAdminGroup | undefined>;
  deleteCollectionAdminGroup(groupId: string): Promise<boolean>;
  getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname: string): Promise<string[]>;
  setCollectionNicknameSession(params: {
    activityId: string;
    username: string;
    userRole: string;
    nickname: string;
  }): Promise<void>;
  getCollectionNicknameSessionByActivity(activityId: string): Promise<CollectionNicknameSession | undefined>;
  clearCollectionNicknameSessionByActivity(activityId: string): Promise<void>;
  getCollectionStaffNicknameById(id: string): Promise<CollectionStaffNickname | undefined>;
  getCollectionStaffNicknameByName(nickname: string): Promise<CollectionStaffNickname | undefined>;
  getCollectionNicknameAuthProfileByName(nickname: string): Promise<CollectionNicknameAuthProfile | undefined>;
  setCollectionNicknamePassword(params: {
    nicknameId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordUpdatedAt?: Date | null;
  }): Promise<void>;
  createCollectionStaffNickname(data: CreateCollectionStaffNicknameInput): Promise<CollectionStaffNickname>;
  updateCollectionStaffNickname(id: string, data: UpdateCollectionStaffNicknameInput): Promise<CollectionStaffNickname | undefined>;
  deleteCollectionStaffNickname(id: string): Promise<{ deleted: boolean; deactivated: boolean }>;
  isCollectionStaffNicknameActive(nickname: string): Promise<boolean>;
  getCollectionRecordById(id: string): Promise<CollectionRecord | undefined>;
  updateCollectionRecord(id: string, data: UpdateCollectionRecordInput): Promise<CollectionRecord | undefined>;
  deleteCollectionRecord(id: string): Promise<boolean>;

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
  getActiveActivitiesByUsername(username: string): Promise<UserActivity[]>;
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
  findBranchesByPostcode(params: { postcode: string; limit: number }): Promise<Array<{
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
  getSettingsForRole(role: string): Promise<SystemSettingCategory[]>;
  getBooleanSystemSetting(key: string, fallback?: boolean): Promise<boolean>;
  getRoleTabVisibility(role: string): Promise<Record<string, boolean>>;
  updateSystemSetting(params: {
    role: string;
    settingKey: string;
    value: string | number | boolean | null;
    confirmCritical?: boolean;
    updatedBy: string;
  }): Promise<{
    status: "updated" | "unchanged" | "forbidden" | "not_found" | "requires_confirmation" | "invalid";
    message: string;
    setting?: SystemSettingItem;
    shouldBroadcast?: boolean;
  }>;
  getMaintenanceState(now?: Date): Promise<MaintenanceState>;
  getAppConfig(): Promise<{
    systemName: string;
    sessionTimeoutMinutes: number;
    heartbeatIntervalMinutes: number;
    wsIdleMinutes: number;
    aiEnabled: boolean;
    semanticSearchEnabled: boolean;
    aiTimeoutMs: number;
    searchResultLimit: number;
    viewerRowsPerPage: number;
  }>;

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

export class PostgresStorage implements IStorage {
  private readonly authRepository = new AuthRepository();
  private readonly importsRepository = new ImportsRepository();
  private readonly searchRepository = new SearchRepository();
  private readonly activityRepository = new ActivityRepository({
    ensureBannedSessionsTable: () => this.ensureBannedSessionsTable(),
  });
  private readonly auditRepository = new AuditRepository();
  private readonly backupsBootstrap = new BackupsBootstrap();
  private readonly backupsRepository = new BackupsRepository({
    ensureBackupsTable: () => this.backupsBootstrap.ensureTable(),
    parseBackupMetadataSafe: (raw) => this.parseBackupMetadataSafe(raw),
  });
  private readonly analyticsRepository = new AnalyticsRepository();
  private readonly collectionRepository = new CollectionRepository();
  private readonly settingsRepository = new SettingsRepository();
  private readonly settingsBootstrap = new SettingsBootstrap();
  private readonly spatialBootstrap = new SpatialBootstrap();

  constructor() {}

  public async init() {
    await this.ensureUsersTable();
    await this.ensureImportsTable();
    await this.ensureDataRowsTable();
    await this.ensureUserActivityTable();
    await this.ensureAuditLogsTable();
    await this.ensureCollectionRecordsTable();
    await this.ensureCollectionStaffNicknamesTable();
    await this.ensureCollectionAdminGroupsTables();
    await this.ensureCollectionNicknameSessionsTable();
    await this.ensureCollectionAdminVisibleNicknamesTable();
    await this.seedDefaultUsers();
    await this.ensureBackupsTable();
    await this.ensurePerformanceIndexes();
    await this.ensureBannedSessionsTable();
    await this.ensureAiTables();
    await this.ensureSpatialTables();
    await this.ensureCategoryRulesTable();
    await this.ensureCategoryStatsTable();
    await this.ensureSettingsTables();
  }

  private async ensureUsersTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.users (
          id text PRIMARY KEY,
          username text NOT NULL,
          role text NOT NULL DEFAULT 'user',
          password_hash text,
          password text,
          is_banned boolean DEFAULT false,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now(),
          password_changed_at timestamp
        )
      `);
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text`);
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text`);
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password text`);
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false`);
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp`);

      // Migrate legacy column naming: password -> password_hash.
      await db.execute(sql`
        UPDATE public.users
        SET password_hash = password
        WHERE password_hash IS NULL
          AND password IS NOT NULL
      `);

      const missingHashRows = await db.execute(sql`
        SELECT id
        FROM public.users
        WHERE password_hash IS NULL
      `);
      for (const row of missingHashRows.rows as Array<{ id?: string }>) {
        const userId = String(row.id || "").trim();
        if (!userId) continue;
        const fallbackHash = await bcrypt.hash(randomUUID(), BCRYPT_COST);
        await db.execute(sql`
          UPDATE public.users
          SET password_hash = ${fallbackHash}
          WHERE id = ${userId}
        `);
      }

      await db.execute(sql`
        UPDATE public.users
        SET
          role = COALESCE(NULLIF(role, ''), 'user'),
          created_at = COALESCE(created_at, now()),
          updated_at = COALESCE(updated_at, now()),
          is_banned = COALESCE(is_banned, false)
      `);

      await db.execute(sql`ALTER TABLE public.users ALTER COLUMN username SET NOT NULL`);
      await db.execute(sql`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
      await db.execute(sql`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);

      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON public.users (lower(username))`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (lower(username))`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role)`);
    } catch (err: any) {
      console.error("❌ Failed to ensure users table:", err?.message || err);
      throw err;
    }
  }

  private async ensureImportsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.imports (
          id text PRIMARY KEY,
          name text NOT NULL,
          filename text NOT NULL,
          created_at timestamp DEFAULT now(),
          is_deleted boolean DEFAULT false,
          created_by text
        )
      `);
      await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS name text`);
      await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS filename text`);
      await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
      await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false`);
      await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_by text`);
      await db.execute(sql`
        UPDATE public.imports
        SET
          name = COALESCE(NULLIF(name, ''), NULLIF(filename, ''), 'Untitled Import'),
          filename = COALESCE(NULLIF(filename, ''), COALESCE(NULLIF(name, ''), 'unknown.csv')),
          created_at = COALESCE(created_at, now()),
          is_deleted = COALESCE(is_deleted, false)
      `);
      await db.execute(sql`ALTER TABLE public.imports ALTER COLUMN name SET NOT NULL`);
      await db.execute(sql`ALTER TABLE public.imports ALTER COLUMN filename SET NOT NULL`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_at ON public.imports(created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON public.imports(is_deleted)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_by ON public.imports(created_by)`);
    } catch (err: any) {
      console.error("Failed to ensure imports table:", err?.message || err);
      throw err;
    }
  }

  private async ensureDataRowsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.data_rows (
          id text PRIMARY KEY,
          import_id text NOT NULL,
          json_data jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `);
      await db.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS import_id text`);
      await db.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS json_data jsonb DEFAULT '{}'::jsonb`);
      await db.execute(sql`
        UPDATE public.data_rows
        SET json_data = COALESCE(json_data, '{}'::jsonb)
      `);
      await db.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN import_id SET NOT NULL`);
      await db.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN json_data SET NOT NULL`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON public.data_rows(import_id)`);
    } catch (err: any) {
      console.error("Failed to ensure data_rows table:", err?.message || err);
      throw err;
    }
  }

  private async ensureUserActivityTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.user_activity (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          username text NOT NULL,
          role text NOT NULL,
          pc_name text,
          browser text,
          fingerprint text,
          ip_address text,
          login_time timestamp,
          logout_time timestamp,
          last_activity_time timestamp,
          is_active boolean DEFAULT true,
          logout_reason text
        )
      `);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS user_id text`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS username text`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS role text`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS pc_name text`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS browser text`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS fingerprint text`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS ip_address text`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS login_time timestamp`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_time timestamp`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS last_activity_time timestamp`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
      await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_reason text`);
      await db.execute(sql`
        UPDATE public.user_activity
        SET
          is_active = COALESCE(is_active, true),
          login_time = COALESCE(login_time, now()),
          last_activity_time = COALESCE(last_activity_time, login_time, now())
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_username ON public.user_activity(username)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON public.user_activity(is_active)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON public.user_activity(login_time DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_last_activity_time ON public.user_activity(last_activity_time DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_fingerprint ON public.user_activity(fingerprint)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_ip_address ON public.user_activity(ip_address)`);
    } catch (err: any) {
      console.error("Failed to ensure user_activity table:", err?.message || err);
      throw err;
    }
  }

  private async ensureAuditLogsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.audit_logs (
          id text PRIMARY KEY,
          action text NOT NULL,
          performed_by text NOT NULL,
          target_user text,
          target_resource text,
          details text,
          timestamp timestamp DEFAULT now()
        )
      `);
      await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text`);
      await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performed_by text`);
      await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user text`);
      await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_resource text`);
      await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text`);
      await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS timestamp timestamp DEFAULT now()`);
      await db.execute(sql`
        UPDATE public.audit_logs
        SET timestamp = COALESCE(timestamp, now())
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by)`);
    } catch (err: any) {
      console.error("Failed to ensure audit_logs table:", err?.message || err);
      throw err;
    }
  }

  private async ensureCollectionRecordsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.collection_records (
          id uuid PRIMARY KEY,
          customer_name text NOT NULL,
          ic_number text NOT NULL,
          customer_phone text NOT NULL,
          account_number text NOT NULL,
          batch text NOT NULL,
          payment_date date NOT NULL,
          amount numeric(14,2) NOT NULL,
          receipt_file text,
          created_by_login text NOT NULL,
          collection_staff_nickname text NOT NULL,
          staff_username text NOT NULL,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2)`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text`);
      await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
      await db.execute(sql`
        UPDATE public.collection_records
        SET customer_phone = COALESCE(NULLIF(customer_phone, ''), '-')
      `);
      await db.execute(sql`
        UPDATE public.collection_records
        SET created_by_login = COALESCE(NULLIF(created_by_login, ''), NULLIF(staff_username, ''), 'unknown')
      `);
      await db.execute(sql`
        UPDATE public.collection_records
        SET collection_staff_nickname = COALESCE(NULLIF(collection_staff_nickname, ''), NULLIF(staff_username, ''), NULLIF(created_by_login, ''), 'unknown')
      `);
      await db.execute(sql`
        UPDATE public.collection_records
        SET staff_username = COALESCE(NULLIF(staff_username, ''), NULLIF(collection_staff_nickname, ''), NULLIF(created_by_login, ''), 'unknown')
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date ON public.collection_records(payment_date)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_at ON public.collection_records(created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username ON public.collection_records(staff_username)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login ON public.collection_records(created_by_login)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname ON public.collection_records(collection_staff_nickname)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone ON public.collection_records(customer_phone)`);
    } catch (err: any) {
      console.error("❌ Failed to ensure collection_records table:", err?.message || err);
      throw err;
    }
  }

  private async ensureCollectionStaffNicknamesTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.collection_staff_nicknames (
          id uuid PRIMARY KEY,
          nickname text NOT NULL,
          is_active boolean NOT NULL DEFAULT true,
          role_scope text NOT NULL DEFAULT 'both',
          nickname_password_hash text,
          must_change_password boolean NOT NULL DEFAULT true,
          password_reset_by_superuser boolean NOT NULL DEFAULT false,
          password_updated_at timestamp,
          created_by text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname text`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS role_scope text DEFAULT 'both'`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname_password_hash text`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_updated_at timestamp`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_by text`);
      await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
      await db.execute(sql`
        UPDATE public.collection_staff_nicknames
        SET
          nickname = trim(COALESCE(nickname, '')),
          is_active = COALESCE(is_active, true),
          role_scope = CASE
            WHEN lower(trim(COALESCE(role_scope, ''))) IN ('admin', 'user', 'both')
              THEN lower(trim(COALESCE(role_scope, '')))
            ELSE 'both'
          END,
          nickname_password_hash = NULLIF(trim(COALESCE(nickname_password_hash, '')), ''),
          must_change_password = COALESCE(
            must_change_password,
            CASE
              WHEN NULLIF(trim(COALESCE(nickname_password_hash, '')), '') IS NULL THEN true
              ELSE false
            END
          ),
          password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),
          created_at = COALESCE(created_at, now())
      `);
      await db.execute(sql`DELETE FROM public.collection_staff_nicknames WHERE nickname = ''`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_staff_nicknames_lower_unique ON public.collection_staff_nicknames(lower(nickname))`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_active ON public.collection_staff_nicknames(is_active)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_role_scope ON public.collection_staff_nicknames(role_scope)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_must_change_password ON public.collection_staff_nicknames(must_change_password)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_password_reset ON public.collection_staff_nicknames(password_reset_by_superuser)`);

      // Seed master nickname list from existing records to keep old workflows valid.
      const seedRows = await db.execute(sql`
        SELECT DISTINCT trim(collection_staff_nickname) AS nickname
        FROM public.collection_records
        WHERE collection_staff_nickname IS NOT NULL
          AND trim(collection_staff_nickname) <> ''
        LIMIT 5000
      `);
      for (const row of seedRows.rows as Array<{ nickname?: string }>) {
        const nickname = String(row.nickname || "").trim();
        if (!nickname) continue;
        await db.execute(sql`
          INSERT INTO public.collection_staff_nicknames (
            id,
            nickname,
            is_active,
            nickname_password_hash,
            must_change_password,
            password_reset_by_superuser,
            password_updated_at,
            created_by,
            created_at
          )
          VALUES (
            ${crypto.randomUUID()}::uuid,
            ${nickname},
            true,
            NULL,
            true,
            false,
            NULL,
            'system-seed',
            now()
          )
          ON CONFLICT ((lower(nickname))) DO NOTHING
        `);
      }
    } catch (err: any) {
      console.error("❌ Failed to ensure collection_staff_nicknames table:", err?.message || err);
      throw err;
    }
  }

  private async ensureCollectionAdminGroupsTables() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.admin_groups (
          id uuid PRIMARY KEY,
          leader_nickname text NOT NULL,
          created_by text NOT NULL,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.admin_group_members (
          id uuid PRIMARY KEY,
          admin_group_id uuid NOT NULL,
          member_nickname text NOT NULL,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);

      await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname text`);
      await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_by text`);
      await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
      await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);

      await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS admin_group_id uuid`);
      await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname text`);
      await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);

      await db.execute(sql`
        UPDATE public.admin_groups
        SET
          leader_nickname = trim(COALESCE(leader_nickname, '')),
          created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), 'system-seed'),
          created_at = COALESCE(created_at, now()),
          updated_at = COALESCE(updated_at, now())
      `);
      await db.execute(sql`DELETE FROM public.admin_groups WHERE trim(COALESCE(leader_nickname, '')) = ''`);

      await db.execute(sql`
        UPDATE public.admin_group_members
        SET
          member_nickname = trim(COALESCE(member_nickname, '')),
          created_at = COALESCE(created_at, now())
      `);
      await db.execute(sql`DELETE FROM public.admin_group_members WHERE trim(COALESCE(member_nickname, '')) = ''`);
      await db.execute(sql`
        DELETE FROM public.admin_group_members m
        WHERE m.admin_group_id IS NULL
           OR NOT EXISTS (
            SELECT 1
            FROM public.admin_groups g
            WHERE g.id = m.admin_group_id
          )
      `);

      await db.execute(sql`
        DELETE FROM public.admin_group_members m
        USING public.admin_groups g
        WHERE g.id = m.admin_group_id
          AND lower(g.leader_nickname) = lower(m.member_nickname)
      `);

      await db.execute(sql`
        DELETE FROM public.admin_groups a
        USING public.admin_groups b
        WHERE lower(a.leader_nickname) = lower(b.leader_nickname)
          AND a.ctid > b.ctid
      `);

      await db.execute(sql`
        DELETE FROM public.admin_group_members a
        USING public.admin_group_members b
        WHERE a.admin_group_id = b.admin_group_id
          AND lower(a.member_nickname) = lower(b.member_nickname)
          AND a.ctid > b.ctid
      `);

      await db.execute(sql`
        DELETE FROM public.admin_group_members a
        USING public.admin_group_members b
        WHERE lower(a.member_nickname) = lower(b.member_nickname)
          AND a.ctid > b.ctid
      `);

      await db.execute(sql`
        DELETE FROM public.admin_group_members m
        WHERE EXISTS (
          SELECT 1
          FROM public.admin_groups g
          WHERE lower(g.leader_nickname) = lower(m.member_nickname)
            AND g.id <> m.admin_group_id
        )
      `);

      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_groups_leader_nickname_unique
        ON public.admin_groups (lower(leader_nickname))
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_group_member_unique
        ON public.admin_group_members (admin_group_id, lower(member_nickname))
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_member_unique
        ON public.admin_group_members (lower(member_nickname))
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_admin_group_members_group
        ON public.admin_group_members (admin_group_id)
      `);
    } catch (err: any) {
      console.error("❌ Failed to ensure admin group tables:", err?.message || err);
      throw err;
    }
  }

  private async ensureCollectionNicknameSessionsTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.collection_nickname_sessions (
          activity_id text PRIMARY KEY,
          username text NOT NULL,
          user_role text NOT NULL,
          nickname text NOT NULL,
          verified_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS username text`);
      await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS user_role text`);
      await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS nickname text`);
      await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS verified_at timestamp DEFAULT now()`);
      await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
      await db.execute(sql`
        UPDATE public.collection_nickname_sessions
        SET
          username = trim(COALESCE(username, '')),
          user_role = trim(COALESCE(user_role, '')),
          nickname = trim(COALESCE(nickname, '')),
          verified_at = COALESCE(verified_at, now()),
          updated_at = COALESCE(updated_at, now())
      `);
      await db.execute(sql`
        DELETE FROM public.collection_nickname_sessions
        WHERE trim(COALESCE(username, '')) = ''
          OR trim(COALESCE(user_role, '')) = ''
          OR trim(COALESCE(nickname, '')) = ''
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_username
        ON public.collection_nickname_sessions (username)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_nickname
        ON public.collection_nickname_sessions (lower(nickname))
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_updated_at
        ON public.collection_nickname_sessions (updated_at DESC)
      `);
    } catch (err: any) {
      console.error("❌ Failed to ensure collection nickname session table:", err?.message || err);
      throw err;
    }
  }

  private async ensureCollectionAdminVisibleNicknamesTable() {
    try {
      await db.execute(sql`SET search_path TO public`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.admin_visible_nicknames (
          id uuid PRIMARY KEY,
          admin_user_id text NOT NULL,
          nickname_id uuid NOT NULL,
          created_by_superuser text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS admin_user_id text`);
      await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS nickname_id uuid`);
      await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_by_superuser text`);
      await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
      await db.execute(sql`
        UPDATE public.admin_visible_nicknames
        SET created_at = COALESCE(created_at, now())
      `);
      await db.execute(sql`
        DELETE FROM public.admin_visible_nicknames avn
        WHERE avn.admin_user_id IS NULL
          OR avn.nickname_id IS NULL
      `);
      await db.execute(sql`
        DELETE FROM public.admin_visible_nicknames avn
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.users u
          WHERE u.id = avn.admin_user_id
            AND u.role = 'admin'
        )
      `);
      await db.execute(sql`
        DELETE FROM public.admin_visible_nicknames avn
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.collection_staff_nicknames c
          WHERE c.id = avn.nickname_id
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin_nickname_unique
        ON public.admin_visible_nicknames(admin_user_id, nickname_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin
        ON public.admin_visible_nicknames(admin_user_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_nickname
        ON public.admin_visible_nicknames(nickname_id)
      `);

      const existingCount = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM public.admin_visible_nicknames
        LIMIT 1
      `);
      const total = Number(existingCount.rows?.[0]?.total ?? 0);
      if (total === 0) {
        const admins = await db.execute(sql`
          SELECT id
          FROM public.users
          WHERE role = 'admin'
          ORDER BY username ASC
          LIMIT 5000
        `);
        const nicknames = await db.execute(sql`
          SELECT id
          FROM public.collection_staff_nicknames
          WHERE is_active = true
          ORDER BY lower(nickname) ASC
          LIMIT 5000
        `);

        const adminIds = (admins.rows || [])
          .map((row: any) => String(row.id || "").trim())
          .filter(Boolean);
        const nicknameIds = (nicknames.rows || [])
          .map((row: any) => String(row.id || "").trim())
          .filter(Boolean);

        for (const adminUserId of adminIds) {
          for (const nicknameId of nicknameIds) {
            await db.execute(sql`
              INSERT INTO public.admin_visible_nicknames (
                id,
                admin_user_id,
                nickname_id,
                created_by_superuser,
                created_at
              )
              VALUES (
                ${randomUUID()}::uuid,
                ${adminUserId},
                ${nicknameId}::uuid,
                'system-seed',
                now()
              )
              ON CONFLICT (admin_user_id, nickname_id) DO NOTHING
            `);
          }
        }
      }
    } catch (err: any) {
      console.error("❌ Failed to ensure admin_visible_nicknames table:", err?.message || err);
      throw err;
    }
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

  private async ensureSettingsTables() {
    await this.settingsBootstrap.ensureTables();
  }

  private async ensureSpatialTables() {
    await this.spatialBootstrap.ensureTables();
  }

  private async ensureBackupsTable() {
    await this.backupsBootstrap.ensureTable();
  }

  async ensureBackupsReady(): Promise<void> {
    await this.ensureBackupsTable();
  }

  private parseBackupMetadataSafe(raw: unknown): Record<string, any> | null {
    if (!raw) return null;
    if (typeof raw === "object") return raw as Record<string, any>;
    if (typeof raw !== "string") return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Guard against pathological legacy rows that can break JSON parsing/allocation.
    if (trimmed.length > 200_000) return null;

    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  parseBackupMetadata(raw: unknown): Record<string, any> | null {
    return this.parseBackupMetadataSafe(raw);
  }

  private async seedDefaultUsers() {
    const shouldSeedConfiguredUsers = shouldSeedDefaultUsers();
    const [{ value: existingUserCount }] = await db.select({ value: count() }).from(users);
    const isFreshLocalBootstrap =
      !shouldSeedConfiguredUsers
      && Number(existingUserCount || 0) === 0
      && process.env.NODE_ENV !== "production";

    const defaultUsers = [
      {
        username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
        password: process.env.SEED_SUPERUSER_PASSWORD || "",
        role: "superuser",
      },
      {
        username: process.env.SEED_ADMIN_USERNAME || "admin1",
        password: process.env.SEED_ADMIN_PASSWORD || "",
        role: "admin",
      },
      {
        username: process.env.SEED_USER_USERNAME || "user1",
        password: process.env.SEED_USER_PASSWORD || "",
        role: "user",
      },
    ].filter((user) => user.password);

    if (isFreshLocalBootstrap) {
      defaultUsers.push({
        username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
        password: process.env.SEED_SUPERUSER_PASSWORD || "0441024k",
        role: "superuser",
      });
      console.warn(
        "[AUTH] No users found. Bootstrapped local superuser account for first login.",
      );
    } else if (!shouldSeedConfiguredUsers) {
      return;
    }

    for (const user of defaultUsers) {
      const existing = await this.getUserByUsername(user.username);
      if (!existing) {
        const now = new Date();
        const hashedPassword = await bcrypt.hash(user.password, BCRYPT_COST);
        await db.insert(users).values({
          id: crypto.randomUUID(),
          username: user.username,
          passwordHash: hashedPassword,
          role: user.role,
          createdAt: now,
          updatedAt: now,
          passwordChangedAt: now,
          isBanned: false,
        });
      }
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.authRepository.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.authRepository.getUserByUsername(username);
  }

  async createUser(user: InsertUser): Promise<User> {
    return this.authRepository.createUser(user);
  }

  async updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
  }): Promise<User | undefined> {
    return this.authRepository.updateUserCredentials(params);
  }

  async getUsersByRoles(roles: string[]): Promise<Array<{
    id: string;
    username: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    passwordChangedAt: Date | null;
    isBanned: boolean | null;
  }>> {
    return this.authRepository.getUsersByRoles(roles);
  }

  async updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void> {
    return this.authRepository.updateActivitiesUsername(oldUsername, newUsername);
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
      if (idx === 0 && STORAGE_DEBUG_LOGS) {
        console.log(`🔍 DEBUG first row keys: ${Object.keys(row).join(", ")}`);
        console.log(`🔍 DEBUG json_data type: ${typeof jsonData}, isArray: ${Array.isArray(jsonData)}, value sample: ${JSON.stringify(jsonData).substring(0, 100)}`);
      }

      if (typeof jsonData === "string") {
        try {
          jsonData = JSON.parse(jsonData);
        } catch (e) {
          if (STORAGE_DEBUG_LOGS) {
            console.log(`🔍 Failed to parse json_data as JSON, treating as string`);
          }
        }
      }

      if (Array.isArray(jsonData)) {
        // Map array elements to generic column names col_1, col_2, etc.
        const obj: Record<string, any> = {};
        for (let i = 0; i < jsonData.length; i++) {
          obj[`col_${i + 1}`] = jsonData[i];
        }
        jsonData = obj;
        if (idx === 0 && STORAGE_DEBUG_LOGS) {
          console.log(`🔍 Converted array to object with keys: ${Object.keys(jsonData).join(",")}`);
        }
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
    return this.authRepository.updateUserBan(username, isBanned);
  }

  async createImport(data: InsertImport & { createdBy?: string }): Promise<Import> {
    return this.importsRepository.createImport(data);
  }

  async getImports(): Promise<Import[]> {
    return this.importsRepository.getImports();
  }

  async getImportById(id: string): Promise<Import | undefined> {
    return this.importsRepository.getImportById(id);
  }

  async updateImportName(id: string, name: string): Promise<Import | undefined> {
    return this.importsRepository.updateImportName(id, name);
  }

  async deleteImport(id: string): Promise<boolean> {
    return this.importsRepository.deleteImport(id);
  }

  async createDataRow(data: InsertDataRow): Promise<DataRow> {
    return this.importsRepository.createDataRow(data);
  }

  async getDataRowsByImport(importId: string): Promise<DataRow[]> {
    if (STORAGE_DEBUG_LOGS) {
      console.log("🧪 VIEWER importId received:", importId);
    }

    const rows = await this.importsRepository.getDataRowsByImport(importId);

    if (STORAGE_DEBUG_LOGS) {
      console.log("🧪 ROW COUNT:", rows.length);
    }

    return rows;
  }

  async getDataRowCountByImport(importId: string): Promise<number> {
    return this.importsRepository.getDataRowCountByImport(importId);
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

    if (STORAGE_DEBUG_LOGS) {
      console.log(`🔍 searchDataRows called: search="${search}" -> trimmed="${trimmedSearch}"`);
    }

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

      if (STORAGE_DEBUG_LOGS) {
        console.log("🔍 searchDataRows (no search) - returned:", rows.length, "rows");
      }

      return { rows, total: Number(count) };
    }

    // When using raw SQL, need to convert column names
    if (STORAGE_DEBUG_LOGS) {
      console.log(`🔍 Executing search query for: "${trimmedSearch}"`);
    }
    
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
    if (STORAGE_DEBUG_LOGS) {
      console.log(`🔍 Search results: ${rowsResult.rows.length} rows found (total: ${totalCount})`);
    }

    const convertedRows = rowsResult.rows.map((row: any) => {
      let jsonData = row.json_data;

      if (Array.isArray(jsonData)) {
        // Map array elements to generic column names col_1, col_2, etc.
        const obj: Record<string, any> = {};
        for (let i = 0; i < jsonData.length; i++) {
          obj[`col_${i + 1}`] = jsonData[i];
        }
        jsonData = obj;
        if (STORAGE_DEBUG_LOGS) {
          console.log(`🔍 Converted array row id=${row.id} to object with keys: ${Object.keys(jsonData).join(",")}`);
        }
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
    const result = await db.execute(sql`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE i.is_deleted = false
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_COLUMN_KEYS}
    `);

    return (result.rows || [])
      .map((row: any) => String(row.column_name || "").trim())
      .filter((name: string) => name.length > 0);
  }

  async createActivity(data: InsertUserActivity): Promise<UserActivity> {
    return this.activityRepository.createActivity(data);
  }

  async touchActivity(activityId: string): Promise<void> {
    return this.activityRepository.touchActivity(activityId);
  }

  async getActiveActivitiesByUsername(username: string): Promise<UserActivity[]> {
    return this.activityRepository.getActiveActivitiesByUsername(username);
  }

  async updateActivity(id: string, data: Partial<UserActivity>): Promise<UserActivity | undefined> {
    return this.activityRepository.updateActivity(id, data);
  }

  async getActivityById(id: string): Promise<UserActivity | undefined> {
    return this.activityRepository.getActivityById(id);
  }

  async getActiveActivities(): Promise<UserActivity[]> {
    return this.activityRepository.getActiveActivities();
  }

  async getAllActivities(): Promise<(UserActivity & { status: string })[]> {
    return this.activityRepository.getAllActivities();
  }

  async deleteActivity(id: string): Promise<boolean> {
    return this.activityRepository.deleteActivity(id);
  }

  async getFilteredActivities(filters: {
    status?: string[];
    username?: string;
    ipAddress?: string;
    browser?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<UserActivity[]> {
    return this.activityRepository.getFilteredActivities(filters);
  }

  async deactivateUserActivities(username: string, reason?: string): Promise<void> {
    return this.activityRepository.deactivateUserActivities(username, reason);
  }

  async deactivateUserSessionsByFingerprint(username: string, fingerprint: string): Promise<void> {
    return this.activityRepository.deactivateUserSessionsByFingerprint(username, fingerprint);
  }

  async getBannedUsers(): Promise<
    Array<User & { banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null } }>
  > {
    return this.activityRepository.getBannedUsers();
  }

  async isVisitorBanned(fingerprint?: string | null, ipAddress?: string | null): Promise<boolean> {
    return this.activityRepository.isVisitorBanned(fingerprint, ipAddress);
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
    return this.activityRepository.banVisitor(params);
  }

  async unbanVisitor(banId: string): Promise<void> {
    return this.activityRepository.unbanVisitor(banId);
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
    return this.activityRepository.getBannedSessions();
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
    const q = String(params.query || "");
    const digits = q.replace(/[^0-9]/g, "");
    const limit = Math.max(1, Math.min(50, params.limit || 10));
    if (digits.length < 6) return [];

    const isIc = digits.length === 12;
    const isPhone = digits.length >= 9 && digits.length <= 11;
    const icFields = ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"];
    const phoneFields = ["No. Telefon Rumah", "No. Telefon Bimbit", "Telefon", "Phone", "HP", "Handphone", "OfficePhone"];
    const accountFields = ["Nombor Akaun Bank Pemohon", "Account No", "Account Number", "No Akaun", "Card No"];

    const primaryFields: string[] = isIc
      ? icFields
      : isPhone
        ? phoneFields
        : accountFields;

    if (primaryFields.length === 0) return [];

    const perFieldMatch = sql.join(
      primaryFields.map((key) =>
        sql`coalesce((dr.json_data::jsonb)->>${key}, '') = ${digits}`
      ),
      sql` OR `
    );
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
        AND (${perFieldMatch})
      ORDER BY dr.id
      LIMIT ${limit}
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

  async findBranchesByPostcode(params: { postcode: string; limit: number }): Promise<Array<{
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
      await this.ensureSpatialTables();
      const rawDigits = String(params.postcode || "").replace(/\D/g, "");
      const postcode = rawDigits.length === 4 ? `0${rawDigits}` : rawDigits.slice(0, 5);
      if (postcode.length !== 5) return [];
      const limit = Math.max(1, Math.min(5, params.limit));

      let result = await db.execute(sql`
        (
          SELECT DISTINCT
            b.name,
            b.branch_address,
            b.phone_number,
            b.fax_number,
            b.business_hour,
            b.day_open,
            b.atm_cdm,
            b.inquiry_availability,
            b.application_availability,
            b.aeon_lounge
          FROM public.aeon_branch_postcodes p
          JOIN public.aeon_branches b
            ON lower(b.name) = lower(p.source_branch)
          WHERE p.postcode = ${postcode}
        )
        UNION
        (
          SELECT
            b.name,
            b.branch_address,
            b.phone_number,
            b.fax_number,
            b.business_hour,
            b.day_open,
            b.atm_cdm,
            b.inquiry_availability,
            b.application_availability,
            b.aeon_lounge
          FROM public.aeon_branches b
          WHERE coalesce(b.branch_address, '') ~ ('(^|\\D)' || ${postcode} || '(\\D|$)')
        )
        ORDER BY name
        LIMIT ${limit}
      `);

      // If exact postcode is missing, we may still infer nearest branch by numeric postcode.
      // This is especially important when source data lost leading zero (e.g. 6200 -> 06200).
      if ((result.rows as any[]).length === 0) {
        result = await db.execute(sql`
          SELECT
            b.name,
            b.branch_address,
            b.phone_number,
            b.fax_number,
            b.business_hour,
            b.day_open,
            b.atm_cdm,
            b.inquiry_availability,
            b.application_availability,
            b.aeon_lounge
          FROM public.aeon_branch_postcodes p
          JOIN public.aeon_branches b
            ON lower(b.name) = lower(p.source_branch)
          WHERE p.postcode ~ '^[0-9]{5}$'
          ORDER BY abs((p.postcode)::int - (${postcode})::int), b.name
          LIMIT ${limit}
        `);
      }

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
      }));
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
    const postcodeNorm = (() => {
      const digits = String(postcode || "").replace(/\D/g, "");
      if (digits.length === 4) return `0${digits}`;
      return digits.length >= 5 ? digits.slice(0, 5) : digits;
    })();
    if (!postcodeNorm) return null;
    const lookup = async () => {
      const result = await db.execute(sql`
        SELECT lat, lng
        FROM public.aeon_branch_postcodes
        WHERE postcode = ${postcodeNorm}
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
        const match5 = address.match(/\b\d{5}\b/);
        const match4 = address.match(/\b\d{4}\b/);
        const pc = match5 ? match5[0] : match4 ? `0${match4[0]}` : null;
        if (!pc) continue;
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
        const normalizePostcode = (value: unknown): string | null => {
          if (value === undefined || value === null) return null;
          const raw = String(value);
          const five = raw.match(/\b\d{5}\b/);
          if (five) return five[0];
          const four = raw.match(/\b\d{4}\b/);
          if (four) return `0${four[0]}`;
          return null;
        };

        let postcode: string | null = null;
        if (postcodeVal) {
          postcode = normalizePostcode(postcodeVal);
        }
        if (!postcode && addressVal) {
          postcode = normalizePostcode(addressVal);
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

  async getSettingsForRole(role: string): Promise<SystemSettingCategory[]> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getSettingsForRole(role);
  }

  async getBooleanSystemSetting(key: string, fallback = false): Promise<boolean> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getBooleanSystemSetting(key, fallback);
  }

  async getRoleTabVisibility(role: string): Promise<Record<string, boolean>> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getRoleTabVisibility(role);
  }

  async updateSystemSetting(params: {
    role: string;
    settingKey: string;
    value: string | number | boolean | null;
    confirmCritical?: boolean;
    updatedBy: string;
  }): Promise<{
    status: "updated" | "unchanged" | "forbidden" | "not_found" | "requires_confirmation" | "invalid";
    message: string;
    setting?: SystemSettingItem;
    shouldBroadcast?: boolean;
  }> {
    await this.ensureSettingsTables();
    return this.settingsRepository.updateSystemSetting(params);
  }

  async getMaintenanceState(now: Date = new Date()): Promise<MaintenanceState> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getMaintenanceState(now);
  }

  async getAppConfig(): Promise<{
    systemName: string;
    sessionTimeoutMinutes: number;
    heartbeatIntervalMinutes: number;
    wsIdleMinutes: number;
    aiEnabled: boolean;
    semanticSearchEnabled: boolean;
    aiTimeoutMs: number;
    searchResultLimit: number;
    viewerRowsPerPage: number;
  }> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getAppConfig();
  }

  async getAccounts(): Promise<Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }>> {
    return this.authRepository.getAccounts();
  }

  async getCollectionStaffNicknames(filters?: {
    activeOnly?: boolean;
    allowedRole?: "admin" | "user";
  }): Promise<CollectionStaffNickname[]> {
    return this.collectionRepository.getCollectionStaffNicknames(filters);
  }

  async getCollectionAdminUsers(): Promise<CollectionAdminUser[]> {
    return this.collectionRepository.getCollectionAdminUsers();
  }

  async getCollectionAdminUserById(adminUserId: string): Promise<CollectionAdminUser | undefined> {
    return this.collectionRepository.getCollectionAdminUserById(adminUserId);
  }

  async getCollectionAdminAssignedNicknameIds(adminUserId: string): Promise<string[]> {
    return this.collectionRepository.getCollectionAdminAssignedNicknameIds(adminUserId);
  }

  async getCollectionAdminVisibleNicknames(
    adminUserId: string,
    filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
  ): Promise<CollectionStaffNickname[]> {
    return this.collectionRepository.getCollectionAdminVisibleNicknames(adminUserId, filters);
  }

  async setCollectionAdminAssignedNicknameIds(params: {
    adminUserId: string;
    nicknameIds: string[];
    createdBySuperuser: string;
  }): Promise<string[]> {
    return this.collectionRepository.setCollectionAdminAssignedNicknameIds(params);
  }

  async getCollectionAdminGroups(): Promise<CollectionAdminGroup[]> {
    return this.collectionRepository.getCollectionAdminGroups();
  }

  async getCollectionAdminGroupById(groupId: string): Promise<CollectionAdminGroup | undefined> {
    return this.collectionRepository.getCollectionAdminGroupById(groupId);
  }

  async createCollectionAdminGroup(params: {
    leaderNicknameId: string;
    memberNicknameIds: string[];
    createdBy: string;
  }): Promise<CollectionAdminGroup> {
    return this.collectionRepository.createCollectionAdminGroup(params);
  }

  async updateCollectionAdminGroup(params: {
    groupId: string;
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
    updatedBy: string;
  }): Promise<CollectionAdminGroup | undefined> {
    return this.collectionRepository.updateCollectionAdminGroup(params);
  }

  async deleteCollectionAdminGroup(groupId: string): Promise<boolean> {
    return this.collectionRepository.deleteCollectionAdminGroup(groupId);
  }

  async getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname: string): Promise<string[]> {
    return this.collectionRepository.getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname);
  }

  async setCollectionNicknameSession(params: {
    activityId: string;
    username: string;
    userRole: string;
    nickname: string;
  }): Promise<void> {
    return this.collectionRepository.setCollectionNicknameSession(params);
  }

  async getCollectionNicknameSessionByActivity(activityId: string): Promise<CollectionNicknameSession | undefined> {
    return this.collectionRepository.getCollectionNicknameSessionByActivity(activityId);
  }

  async clearCollectionNicknameSessionByActivity(activityId: string): Promise<void> {
    return this.collectionRepository.clearCollectionNicknameSessionByActivity(activityId);
  }

  async getCollectionStaffNicknameById(id: string): Promise<CollectionStaffNickname | undefined> {
    return this.collectionRepository.getCollectionStaffNicknameById(id);
  }

  async getCollectionStaffNicknameByName(nickname: string): Promise<CollectionStaffNickname | undefined> {
    return this.collectionRepository.getCollectionStaffNicknameByName(nickname);
  }

  async getCollectionNicknameAuthProfileByName(nickname: string): Promise<CollectionNicknameAuthProfile | undefined> {
    return this.collectionRepository.getCollectionNicknameAuthProfileByName(nickname);
  }

  async setCollectionNicknamePassword(params: {
    nicknameId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordUpdatedAt?: Date | null;
  }): Promise<void> {
    return this.collectionRepository.setCollectionNicknamePassword(params);
  }

  async createCollectionStaffNickname(data: CreateCollectionStaffNicknameInput): Promise<CollectionStaffNickname> {
    return this.collectionRepository.createCollectionStaffNickname(data);
  }

  async updateCollectionStaffNickname(
    id: string,
    data: UpdateCollectionStaffNicknameInput,
  ): Promise<CollectionStaffNickname | undefined> {
    return this.collectionRepository.updateCollectionStaffNickname(id, data);
  }

  async deleteCollectionStaffNickname(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    return this.collectionRepository.deleteCollectionStaffNickname(id);
  }

  async isCollectionStaffNicknameActive(nickname: string): Promise<boolean> {
    return this.collectionRepository.isCollectionStaffNicknameActive(nickname);
  }

  async createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord> {
    return this.collectionRepository.createCollectionRecord(data);
  }

  async listCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
    limit?: number;
  }): Promise<CollectionRecord[]> {
    return this.collectionRepository.listCollectionRecords(filters);
  }

  async getCollectionMonthlySummary(filters: {
    year: number;
    nicknames?: string[];
    createdByLogin?: string;
  }): Promise<CollectionMonthlySummary[]> {
    return this.collectionRepository.getCollectionMonthlySummary(filters);
  }

  async getCollectionRecordById(id: string): Promise<CollectionRecord | undefined> {
    return this.collectionRepository.getCollectionRecordById(id);
  }

  async updateCollectionRecord(id: string, data: UpdateCollectionRecordInput): Promise<CollectionRecord | undefined> {
    return this.collectionRepository.updateCollectionRecord(id, data);
  }

  async deleteCollectionRecord(id: string): Promise<boolean> {
    return this.collectionRepository.deleteCollectionRecord(id);
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    return this.auditRepository.createAuditLog(data);
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return this.auditRepository.getAuditLogs();
  }

  async createBackup(data: InsertBackup): Promise<Backup> {
    return this.backupsRepository.createBackup(data);
  }

  async getBackups(): Promise<Backup[]> {
    return this.backupsRepository.getBackups();
  }

  async getBackupById(id: string): Promise<Backup | undefined> {
    return this.backupsRepository.getBackupById(id);
  }

  async deleteBackup(id: string): Promise<boolean> {
    return this.backupsRepository.deleteBackup(id);
  }

  async getBackupDataForExport(): Promise<{
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash: string }>;
    auditLogs: AuditLog[];
  }> {
    return this.backupsRepository.getBackupDataForExport();
  }

  async restoreFromBackup(backupData: {
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash?: string }>;
    auditLogs: AuditLog[];
  }): Promise<{ success: boolean; stats: { imports: number; dataRows: number; users: number; auditLogs: number } }> {
    return this.backupsRepository.restoreFromBackup(backupData);
  }

  async getDashboardSummary(): Promise<{
    totalUsers: number;
    activeSessions: number;
    loginsToday: number;
    totalDataRows: number;
    totalImports: number;
    bannedUsers: number;
  }> {
    return this.analyticsRepository.getDashboardSummary();
  }

  async getLoginTrends(
    days: number = 7
  ): Promise<Array<{ date: string; logins: number; logouts: number }>> {
    return this.analyticsRepository.getLoginTrends(days);
  }

  async getTopActiveUsers(
    limit: number = 10
  ): Promise<Array<{
    username: string;
    role: string;
    loginCount: number;
    lastLogin: string | null;
  }>> {
    return this.analyticsRepository.getTopActiveUsers(limit);
  }

  async getPeakHours(): Promise<Array<{ hour: number; count: number }>> {

    return this.analyticsRepository.getPeakHours();


    // Pastikan 0–23 lengkap (untuk chart cantik)
  }

  async getRoleDistribution(): Promise<Array<{ role: string; count: number }>> {
    return this.analyticsRepository.getRoleDistribution();
  }
}
