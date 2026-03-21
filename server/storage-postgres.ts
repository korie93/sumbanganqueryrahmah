import {
  type AccountActivationToken,
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
  type PasswordResetRequest,
  imports,
  dataRows,
  userActivity,
  auditLogs,
  backups,
} from "../shared/schema-postgres";
import { db } from "./db-postgres";
import { eq, desc, and, or, gte, lte, sql, inArray } from "drizzle-orm";
import {
  type MaintenanceState,
  type SystemSettingCategory,
  type SystemSettingItem,
} from "./config/system-settings";
import { AiBootstrap } from "./internal/aiBootstrap";
import { parseBackupMetadataSafe } from "./internal/backupMetadata";
import { BackupsBootstrap } from "./internal/backupsBootstrap";
import { CollectionBootstrap } from "./internal/collectionBootstrap";
import { CoreSchemaBootstrap } from "./internal/coreSchemaBootstrap";
import { SettingsBootstrap } from "./internal/settingsBootstrap";
import { SpatialBootstrap } from "./internal/spatialBootstrap";
import { UsersBootstrap } from "./internal/usersBootstrap";
import {
  AuthRepository,
  type ActivationTokenRecord,
  type ManagedUserRecord,
  type PendingPasswordResetRequestRecord,
  type PasswordResetTokenRecord,
} from "./repositories/auth.repository";
import { ImportsRepository } from "./repositories/imports.repository";
import { SearchRepository } from "./repositories/search.repository";
import { ActivityRepository } from "./repositories/activity.repository";
import { AuditRepository } from "./repositories/audit.repository";
import { AiRepository } from "./repositories/ai.repository";
import { AiCategoryRepository } from "./repositories/ai-category.repository";
import { BackupsRepository } from "./repositories/backups.repository";
import { AnalyticsRepository } from "./repositories/analytics.repository";
import { CollectionRepository } from "./repositories/collection.repository";
import { SettingsRepository } from "./repositories/settings.repository";
import { logger } from "./lib/logger";
const QUERY_PAGE_LIMIT = 1000;
const STORAGE_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";

export type CollectionRecordReceipt = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  createdAt: Date;
};

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
  receipts: CollectionRecordReceipt[];
  createdByLogin: string;
  collectionStaffNickname: string;
  createdAt: Date;
};

export type CollectionRecordAggregate = {
  totalRecords: number;
  totalAmount: number;
};

export type CollectionNicknameAggregate = {
  nickname: string;
  totalRecords: number;
  totalAmount: number;
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

export type CollectionDailyUser = {
  id: string;
  username: string;
  role: string;
};

export type CollectionDailyTarget = {
  id: string;
  username: string;
  year: number;
  month: number;
  monthlyTarget: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionDailyCalendarDay = {
  id: string;
  year: number;
  month: number;
  day: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionDailyPaidCustomer = {
  id: string;
  customerName: string;
  accountNumber: string;
  amount: number;
  collectionStaffNickname: string;
};

export type ManagedUserAccount = ManagedUserRecord;
export type PendingPasswordResetRequestSummary = PendingPasswordResetRequestRecord;
export type AccountActivationTokenSummary = ActivationTokenRecord;
export type PasswordResetTokenSummary = PasswordResetTokenRecord;

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

export type CreateCollectionRecordReceiptInput = {
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
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

type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

  export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createManagedUserAccount(params: {
    username: string;
    fullName?: string | null;
    email?: string | null;
    role: "admin" | "user";
    passwordHash: string;
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    createdBy: string;
    activatedAt?: Date | null;
    passwordChangedAt?: Date | null;
  }): Promise<User>;
  updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
  }): Promise<User | undefined>;
  updateUserAccount(params: {
    userId: string;
    username?: string;
    fullName?: string | null;
    email?: string | null;
    role?: "admin" | "user";
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    isBanned?: boolean;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordHash?: string;
    passwordChangedAt?: Date | null;
    activatedAt?: Date | null;
    lastLoginAt?: Date | null;
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
  getManagedUsers(): Promise<ManagedUserAccount[]>;
  deleteManagedUserAccount(userId: string): Promise<boolean>;
  updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void>;
  updateUserBan(username: string, isBanned: boolean): Promise<User | undefined>;
  touchLastLogin(userId: string, timestamp?: Date): Promise<void>;
  createActivationToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<AccountActivationToken>;
  invalidateUnusedActivationTokens(userId: string): Promise<void>;
  getActivationTokenRecordByHash(tokenHash: string): Promise<AccountActivationTokenSummary | undefined>;
  consumeActivationTokenById(params: {
    tokenId: string;
    now?: Date;
  }): Promise<boolean>;
  createPasswordResetRequest(params: {
    userId: string;
    requestedByUser: string | null;
    approvedBy?: string | null;
    resetType?: string;
    tokenHash?: string | null;
    expiresAt?: Date | null;
    usedAt?: Date | null;
  }): Promise<PasswordResetRequest>;
  updatePasswordResetRequest(params: {
    requestId: string;
    approvedBy?: string | null;
    resetType?: string;
    usedAt?: Date | null;
    tokenHash?: string | null;
    expiresAt?: Date | null;
  }): Promise<void>;
  resolvePendingPasswordResetRequestsForUser(params: {
    userId: string;
    approvedBy: string;
    resetType: string;
    usedAt?: Date | null;
  }): Promise<void>;
  invalidateUnusedPasswordResetTokens(userId: string, now?: Date): Promise<void>;
  getPasswordResetTokenRecordByHash(tokenHash: string): Promise<PasswordResetTokenSummary | undefined>;
  consumePasswordResetRequestById(params: {
    requestId: string;
    now?: Date;
  }): Promise<boolean>;
  listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestSummary[]>;
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
    offset?: number;
  }): Promise<CollectionRecord[]>;
  summarizeCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionRecordAggregate>;
  summarizeCollectionRecordsByNickname(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionNicknameAggregate[]>;
  summarizeCollectionRecordsOlderThan(beforeDate: string): Promise<CollectionRecordAggregate>;
  purgeCollectionRecordsOlderThan(beforeDate: string): Promise<{
    totalRecords: number;
    totalAmount: number;
    receiptPaths: string[];
  }>;
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
  listCollectionDailyUsers(): Promise<CollectionDailyUser[]>;
  getCollectionDailyTarget(params: { username: string; year: number; month: number }): Promise<CollectionDailyTarget | undefined>;
  upsertCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
    monthlyTarget: number;
    actor: string;
  }): Promise<CollectionDailyTarget>;
  listCollectionDailyCalendar(params: {
    year: number;
    month: number;
  }): Promise<CollectionDailyCalendarDay[]>;
  upsertCollectionDailyCalendarDays(params: {
    year: number;
    month: number;
    actor: string;
    days: Array<{
      day: number;
      isWorkingDay: boolean;
      isHoliday: boolean;
      holidayName?: string | null;
    }>;
  }): Promise<CollectionDailyCalendarDay[]>;
  listCollectionDailyPaidCustomers(params: {
    username: string;
    date: string;
  }): Promise<CollectionDailyPaidCustomer[]>;
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
  listCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]>;
  getCollectionRecordReceiptById(recordId: string, receiptId: string): Promise<CollectionRecordReceipt | undefined>;
  createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]>;
  deleteCollectionRecordReceipts(recordId: string, receiptIds: string[]): Promise<CollectionRecordReceipt[]>;
  deleteAllCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]>;
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
  isVisitorBanned(fingerprint?: string | null, ipAddress?: string | null, username?: string | null): Promise<boolean>;
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
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash?: string }>;
    auditLogs: AuditLog[];
    collectionRecords?: Array<{
      id: string;
      customerName: string;
      icNumber: string;
      customerPhone: string;
      accountNumber: string;
      batch: string;
      paymentDate: string;
      amount: string | number;
      receiptFile: string | null;
      createdByLogin: string;
      collectionStaffNickname: string;
      staffUsername?: string | null;
      createdAt: string | Date;
    }>;
    collectionRecordReceipts?: Array<{
      id: string;
      collectionRecordId: string;
      storagePath: string;
      originalFileName: string;
      originalMimeType: string;
      originalExtension: string;
      fileSize: number;
      createdAt: string | Date;
    }>;
  }>;
  restoreFromBackup(backupData: {
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash?: string }>;
    auditLogs: AuditLog[];
    collectionRecords?: Array<{
      id: string;
      customerName: string;
      icNumber: string;
      customerPhone: string;
      accountNumber: string;
      batch: string;
      paymentDate: string;
      amount: string | number;
      receiptFile: string | null;
      createdByLogin: string;
      collectionStaffNickname: string;
      staffUsername?: string | null;
      createdAt: string | Date;
    }>;
    collectionRecordReceipts?: Array<{
      id: string;
      collectionRecordId: string;
      storagePath: string;
      originalFileName: string;
      originalMimeType: string;
      originalExtension: string;
      fileSize: number;
      createdAt: string | Date;
    }>;
  }): Promise<{
    success: boolean;
    stats: {
      imports: { processed: number; inserted: number; skipped: number; reactivated: number };
      dataRows: { processed: number; inserted: number; skipped: number; reactivated: number };
      users: { processed: number; inserted: number; skipped: number; reactivated: number };
      auditLogs: { processed: number; inserted: number; skipped: number; reactivated: number };
      collectionRecords: { processed: number; inserted: number; skipped: number; reactivated: number };
      collectionRecordReceipts: { processed: number; inserted: number; skipped: number; reactivated: number };
      warnings: string[];
      totalProcessed: number;
      totalInserted: number;
      totalSkipped: number;
      totalReactivated: number;
    };
  }>;
}

export class PostgresStorage implements IStorage {
  private readonly authRepository = new AuthRepository();
  private readonly importsRepository = new ImportsRepository();
  private readonly searchRepository = new SearchRepository();
  private readonly activityRepository = new ActivityRepository({
    ensureBannedSessionsTable: () => this.ensureBannedSessionsTable(),
  });
  private readonly aiRepository = new AiRepository({
    ensureSpatialTables: () => this.ensureSpatialTables(),
  });
  private readonly aiCategoryRepository = new AiCategoryRepository();
  private readonly aiBootstrap = new AiBootstrap();
  private readonly auditRepository = new AuditRepository();
  private readonly backupsBootstrap = new BackupsBootstrap();
  private readonly collectionBootstrap = new CollectionBootstrap();
  private readonly coreSchemaBootstrap = new CoreSchemaBootstrap();
  private readonly usersBootstrap = new UsersBootstrap();
  private readonly backupsRepository = new BackupsRepository({
    ensureBackupsTable: () => this.backupsBootstrap.ensureTable(),
    parseBackupMetadataSafe,
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
    await this.ensureCollectionDailyTables();
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
    await this.usersBootstrap.ensureTable();
  }

  private async ensureImportsTable() {
    await this.coreSchemaBootstrap.ensureImportsTable();
  }

  private async ensureDataRowsTable() {
    await this.coreSchemaBootstrap.ensureDataRowsTable();
  }

  private async ensureUserActivityTable() {
    await this.coreSchemaBootstrap.ensureUserActivityTable();
  }

  private async ensureAuditLogsTable() {
    await this.coreSchemaBootstrap.ensureAuditLogsTable();
  }

  private async ensureCollectionRecordsTable() {
    await this.collectionBootstrap.ensureRecordsTable();
  }

  private async ensureCollectionStaffNicknamesTable() {
    await this.collectionBootstrap.ensureStaffNicknamesTable();
  }

  private async ensureCollectionAdminGroupsTables() {
    await this.collectionBootstrap.ensureAdminGroupsTables();
  }

  private async ensureCollectionNicknameSessionsTable() {
    await this.collectionBootstrap.ensureNicknameSessionsTable();
  }

  private async ensureCollectionAdminVisibleNicknamesTable() {
    await this.collectionBootstrap.ensureAdminVisibleNicknamesTable();
  }

  private async ensureCollectionDailyTables() {
    await this.collectionBootstrap.ensureDailyTables();
  }

  private async ensurePerformanceIndexes() {
    await this.coreSchemaBootstrap.ensurePerformanceIndexes();
  }

  private async ensureBannedSessionsTable() {
    await this.coreSchemaBootstrap.ensureBannedSessionsTable();
  }

  private async ensureAiTables() {
    await this.aiBootstrap.ensureAiTables();
  }

  private async ensureCategoryStatsTable() {
    await this.aiBootstrap.ensureCategoryStatsTable();
  }

  private async ensureCategoryRulesTable() {
    await this.aiBootstrap.ensureCategoryRulesTable();
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

  private async seedDefaultUsers() {
    await this.usersBootstrap.seedDefaultUsers();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.authRepository.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.authRepository.getUserByUsername(username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.authRepository.getUserByEmail(email);
  }

  async createUser(user: InsertUser): Promise<User> {
    return this.authRepository.createUser(user);
  }

  async createManagedUserAccount(params: {
    username: string;
    fullName?: string | null;
    email?: string | null;
    role: "admin" | "user";
    passwordHash: string;
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    createdBy: string;
    activatedAt?: Date | null;
    passwordChangedAt?: Date | null;
  }): Promise<User> {
    return this.authRepository.createManagedUserAccount(params);
  }

  async updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
  }): Promise<User | undefined> {
    return this.authRepository.updateUserCredentials(params);
  }

  async updateUserAccount(params: {
    userId: string;
    username?: string;
    fullName?: string | null;
    email?: string | null;
    role?: "admin" | "user";
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    isBanned?: boolean;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordHash?: string;
    passwordChangedAt?: Date | null;
    activatedAt?: Date | null;
    lastLoginAt?: Date | null;
  }): Promise<User | undefined> {
    return this.authRepository.updateUserAccount(params);
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

  async getManagedUsers(): Promise<ManagedUserAccount[]> {
    return this.authRepository.getManagedUsers();
  }

  async deleteManagedUserAccount(userId: string): Promise<boolean> {
    return this.authRepository.deleteManagedUserAccount(userId);
  }

  async updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void> {
    return this.authRepository.updateActivitiesUsername(oldUsername, newUsername);
  }

  async searchGlobalDataRows(params: {
    search: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: any[]; total: number }> {
    return this.searchRepository.searchGlobalDataRows(params);
  }

  async searchSimpleDataRows(search: string) {
    return this.searchRepository.searchSimpleDataRows(search);
  }

  async updateUserBan(username: string, isBanned: boolean): Promise<User | undefined> {
    return this.authRepository.updateUserBan(username, isBanned);
  }

  async touchLastLogin(userId: string, timestamp: Date = new Date()): Promise<void> {
    return this.authRepository.touchLastLogin(userId, timestamp);
  }

  async createActivationToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<AccountActivationToken> {
    return this.authRepository.createActivationToken(params);
  }

  async invalidateUnusedActivationTokens(userId: string): Promise<void> {
    return this.authRepository.invalidateUnusedActivationTokens(userId);
  }

  async getActivationTokenRecordByHash(
    tokenHash: string,
  ): Promise<AccountActivationTokenSummary | undefined> {
    return this.authRepository.getActivationTokenRecordByHash(tokenHash);
  }

  async consumeActivationTokenById(params: {
    tokenId: string;
    now?: Date;
  }): Promise<boolean> {
    return this.authRepository.consumeActivationTokenById(params);
  }

  async createPasswordResetRequest(params: {
    userId: string;
    requestedByUser: string | null;
    approvedBy?: string | null;
    resetType?: string;
    tokenHash?: string | null;
    expiresAt?: Date | null;
    usedAt?: Date | null;
  }): Promise<PasswordResetRequest> {
    return this.authRepository.createPasswordResetRequest(params);
  }

  async updatePasswordResetRequest(params: {
    requestId: string;
    approvedBy?: string | null;
    resetType?: string;
    usedAt?: Date | null;
    tokenHash?: string | null;
    expiresAt?: Date | null;
  }): Promise<void> {
    return this.authRepository.updatePasswordResetRequest(params);
  }

  async resolvePendingPasswordResetRequestsForUser(params: {
    userId: string;
    approvedBy: string;
    resetType: string;
    usedAt?: Date | null;
  }): Promise<void> {
    return this.authRepository.resolvePendingPasswordResetRequestsForUser(params);
  }

  async invalidateUnusedPasswordResetTokens(userId: string, now?: Date): Promise<void> {
    return this.authRepository.invalidateUnusedPasswordResetTokens(userId, now);
  }

  async getPasswordResetTokenRecordByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenSummary | undefined> {
    return this.authRepository.getPasswordResetTokenRecordByHash(tokenHash);
  }

  async consumePasswordResetRequestById(params: {
    requestId: string;
    now?: Date;
  }): Promise<boolean> {
    return this.authRepository.consumePasswordResetRequestById(params);
  }

  async listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestSummary[]> {
    return this.authRepository.listPendingPasswordResetRequests();
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
      logger.debug("Viewer import ID received", { importId });
    }

    const rows = await this.importsRepository.getDataRowsByImport(importId);

    if (STORAGE_DEBUG_LOGS) {
      logger.debug("Viewer row count", { importId, rowCount: rows.length });
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
    const trimmedSearch = params.search && params.search.trim() ? params.search.trim() : null;

    if (STORAGE_DEBUG_LOGS) {
      logger.debug("searchDataRows called", {
        importId: params.importId,
        search: params.search ?? null,
        trimmedSearch,
        limit: params.limit,
        offset: params.offset,
      });
    }

    const result = await this.searchRepository.searchDataRows(params);

    if (STORAGE_DEBUG_LOGS) {
      logger.debug("searchDataRows results", {
        importId: params.importId,
        rowCount: result.rows.length,
        total: result.total,
      });
    }

    return result;
  }

  async advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number
  ): Promise<{ rows: DataRow[]; total: number }> {
    return this.searchRepository.advancedSearchDataRows(filters, logic, limit, offset);
  }

  async getAllColumnNames(): Promise<string[]> {
    return this.searchRepository.getAllColumnNames();
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

  async isVisitorBanned(
    fingerprint?: string | null,
    ipAddress?: string | null,
    username?: string | null,
  ): Promise<boolean> {
    return this.activityRepository.isVisitorBanned(fingerprint, ipAddress, username);
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
    return this.aiRepository.createConversation(createdBy);
  }

  async saveConversationMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string
  ): Promise<void> {
    return this.aiRepository.saveConversationMessage(conversationId, role, content);
  }

  async getConversationMessages(
    conversationId: string,
    limit: number = 20
  ): Promise<Array<{ role: string; content: string }>> {
    return this.aiRepository.getConversationMessages(conversationId, limit);
  }

  async saveEmbedding(params: {
    importId: string;
    rowId: string;
    content: string;
    embedding: number[];
  }): Promise<void> {
    return this.aiRepository.saveEmbedding(params);
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
    return this.aiRepository.semanticSearch(params);
  }

  async aiKeywordSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>> {
    return this.aiRepository.aiKeywordSearch(params);
  }

  async aiNameSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>> {
    return this.aiRepository.aiNameSearch(params);
  }

  async aiDigitsSearch(params: { digits: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
  }>> {
    return this.aiRepository.aiDigitsSearch(params);
  }

  async aiFuzzySearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: any;
    score: number;
  }>> {
    return this.aiRepository.aiFuzzySearch(params);
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
      return this.aiRepository.findBranchesByText(params);
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
      return this.aiRepository.findBranchesByPostcode(params);
    }

  async countRowsByKeywords(params: { groups: Array<CategoryRule> }): Promise<{
    totalRows: number;
    counts: Record<string, number>;
  }> {
    return this.aiCategoryRepository.countRowsByKeywords(params);
  }

  async getCategoryRules(): Promise<Array<{
    key: string;
    terms: string[];
    fields: string[];
    matchMode: string;
    enabled: boolean;
  }>> {
    return this.aiCategoryRepository.getCategoryRules();
  }

  async getCategoryRulesMaxUpdatedAt(): Promise<Date | null> {
    return this.aiCategoryRepository.getCategoryRulesMaxUpdatedAt();
  }

  async getCategoryStats(keys: string[]): Promise<Array<{
    key: string;
    total: number;
    samples: Array<{ name: string; ic: string; source: string | null }>;
    updatedAt: Date | null;
  }>> {
    return this.aiCategoryRepository.getCategoryStats(keys);
  }

  async computeCategoryStatsForKeys(keys: string[], groups: Array<CategoryRule>): Promise<Array<{
    key: string;
    total: number;
    samples: Array<{ name: string; ic: string; source: string | null }>;
    updatedAt: Date | null;
  }>> {
    return this.aiCategoryRepository.computeCategoryStatsForKeys(keys, groups);
  }

  async rebuildCategoryStats(groups: Array<CategoryRule>): Promise<void> {
    return this.aiCategoryRepository.rebuildCategoryStats(groups);
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
    return this.aiRepository.getNearestBranches(params);
  }

  async getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null> {
    return this.aiRepository.getPostcodeLatLng(postcode);
  }

  async importBranchesFromRows(params: {
    importId: string;
    nameKey?: string | null;
    latKey?: string | null;
    lngKey?: string | null;
  }): Promise<{ inserted: number; skipped: number; usedKeys: { nameKey: string; latKey: string; lngKey: string } }> {
    return this.aiRepository.importBranchesFromRows(params);
  }

  async getDataRowsForEmbedding(
    importId: string,
    limit: number,
    offset: number
  ): Promise<Array<{ id: string; jsonDataJsonb: any }>> {
    return this.aiRepository.getDataRowsForEmbedding(importId, limit, offset) as Promise<Array<{ id: string; jsonDataJsonb: any }>>;
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

  async listCollectionDailyUsers(): Promise<CollectionDailyUser[]> {
    return this.collectionRepository.listCollectionDailyUsers();
  }

  async getCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
  }): Promise<CollectionDailyTarget | undefined> {
    return this.collectionRepository.getCollectionDailyTarget(params);
  }

  async upsertCollectionDailyTarget(params: {
    username: string;
    year: number;
    month: number;
    monthlyTarget: number;
    actor: string;
  }): Promise<CollectionDailyTarget> {
    return this.collectionRepository.upsertCollectionDailyTarget(params);
  }

  async listCollectionDailyCalendar(params: {
    year: number;
    month: number;
  }): Promise<CollectionDailyCalendarDay[]> {
    return this.collectionRepository.listCollectionDailyCalendar(params);
  }

  async upsertCollectionDailyCalendarDays(params: {
    year: number;
    month: number;
    actor: string;
    days: Array<{
      day: number;
      isWorkingDay: boolean;
      isHoliday: boolean;
      holidayName?: string | null;
    }>;
  }): Promise<CollectionDailyCalendarDay[]> {
    return this.collectionRepository.upsertCollectionDailyCalendarDays(params);
  }

  async listCollectionDailyPaidCustomers(params: {
    username: string;
    date: string;
  }): Promise<CollectionDailyPaidCustomer[]> {
    return this.collectionRepository.listCollectionDailyPaidCustomers(params);
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
    offset?: number;
  }): Promise<CollectionRecord[]> {
    return this.collectionRepository.listCollectionRecords(filters);
  }

  async summarizeCollectionRecords(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionRecordAggregate> {
    return this.collectionRepository.summarizeCollectionRecords(filters);
  }

  async summarizeCollectionRecordsByNickname(filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionNicknameAggregate[]> {
    return this.collectionRepository.summarizeCollectionRecordsByNickname(filters);
  }

  async summarizeCollectionRecordsOlderThan(beforeDate: string): Promise<CollectionRecordAggregate> {
    return this.collectionRepository.summarizeCollectionRecordsOlderThan(beforeDate);
  }

  async purgeCollectionRecordsOlderThan(beforeDate: string): Promise<{
    totalRecords: number;
    totalAmount: number;
    receiptPaths: string[];
  }> {
    return this.collectionRepository.purgeCollectionRecordsOlderThan(beforeDate);
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

  async listCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.listCollectionRecordReceipts(recordId);
  }

  async getCollectionRecordReceiptById(
    recordId: string,
    receiptId: string,
  ): Promise<CollectionRecordReceipt | undefined> {
    return this.collectionRepository.getCollectionRecordReceiptById(recordId, receiptId);
  }

  async createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.createCollectionRecordReceipts(recordId, receipts);
  }

  async deleteCollectionRecordReceipts(
    recordId: string,
    receiptIds: string[],
  ): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.deleteCollectionRecordReceipts(recordId, receiptIds);
  }

  async deleteAllCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]> {
    return this.collectionRepository.deleteAllCollectionRecordReceipts(recordId);
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
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash?: string }>;
    auditLogs: AuditLog[];
    collectionRecords?: Array<{
      id: string;
      customerName: string;
      icNumber: string;
      customerPhone: string;
      accountNumber: string;
      batch: string;
      paymentDate: string;
      amount: string | number;
      receiptFile: string | null;
      createdByLogin: string;
      collectionStaffNickname: string;
      staffUsername?: string | null;
      createdAt: string | Date;
    }>;
    collectionRecordReceipts?: Array<{
      id: string;
      collectionRecordId: string;
      storagePath: string;
      originalFileName: string;
      originalMimeType: string;
      originalExtension: string;
      fileSize: number;
      createdAt: string | Date;
    }>;
  }> {
    return this.backupsRepository.getBackupDataForExport();
  }

  async restoreFromBackup(backupData: {
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash?: string }>;
    auditLogs: AuditLog[];
    collectionRecords?: Array<{
      id: string;
      customerName: string;
      icNumber: string;
      customerPhone: string;
      accountNumber: string;
      batch: string;
      paymentDate: string;
      amount: string | number;
      receiptFile: string | null;
      createdByLogin: string;
      collectionStaffNickname: string;
      staffUsername?: string | null;
      createdAt: string | Date;
    }>;
    collectionRecordReceipts?: Array<{
      id: string;
      collectionRecordId: string;
      storagePath: string;
      originalFileName: string;
      originalMimeType: string;
      originalExtension: string;
      fileSize: number;
      createdAt: string | Date;
    }>;
  }): Promise<{
    success: boolean;
    stats: {
      imports: { processed: number; inserted: number; skipped: number; reactivated: number };
      dataRows: { processed: number; inserted: number; skipped: number; reactivated: number };
      users: { processed: number; inserted: number; skipped: number; reactivated: number };
      auditLogs: { processed: number; inserted: number; skipped: number; reactivated: number };
      collectionRecords: { processed: number; inserted: number; skipped: number; reactivated: number };
      collectionRecordReceipts: { processed: number; inserted: number; skipped: number; reactivated: number };
      warnings: string[];
      totalProcessed: number;
      totalInserted: number;
      totalSkipped: number;
      totalReactivated: number;
    };
  }> {
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


    // Pastikan 0-23 lengkap (untuk chart cantik)
  }

  async getRoleDistribution(): Promise<Array<{ role: string; count: number }>> {
    return this.analyticsRepository.getRoleDistribution();
  }
}
