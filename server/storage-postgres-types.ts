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
} from "../shared/schema-postgres";
import {
  type MaintenanceState,
  type SystemSettingCategory,
  type SystemSettingItem,
} from "./config/system-settings";
import {
  type ActivationTokenRecord,
  type ManagedUserRecord,
  type PendingPasswordResetRequestRecord,
  type PasswordResetTokenRecord,
} from "./repositories/auth.repository";
type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";
export type CollectionReceiptValidationStatus =
  | "matched"
  | "underpaid"
  | "overpaid"
  | "unverified"
  | "needs_review";
export type CollectionReceiptExtractionStatus =
  | "unprocessed"
  | "suggested"
  | "ambiguous"
  | "unavailable"
  | "error";

export type CollectionReceiptDuplicateMatch = {
  receiptId: string;
  collectionRecordId: string;
  originalFileName: string;
  createdAt: Date;
};

export type CollectionReceiptDuplicateSummary = {
  fileHash: string;
  matchCount: number;
  matches: CollectionReceiptDuplicateMatch[];
};

export type CollectionRecordReceipt = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount: string | null;
  extractedAmount: string | null;
  extractionStatus: CollectionReceiptExtractionStatus;
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
  createdAt: Date;
  deletedAt?: Date | null;
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
  archivedReceipts?: CollectionRecordReceipt[];
  receiptTotalAmount: string;
  receiptValidationStatus: CollectionReceiptValidationStatus;
  receiptValidationMessage: string | null;
  receiptCount: number;
  duplicateReceiptFlag: boolean;
  createdByLogin: string;
  collectionStaffNickname: string;
  createdAt: Date;
  updatedAt?: Date;
};

export type CollectionRecordAggregate = {
  totalRecords: number;
  totalAmount: number;
};

export type CollectionRecordListFilters = {
  from?: string;
  to?: string;
  search?: string;
  createdByLogin?: string;
  nicknames?: string[];
  receiptValidationStatus?: CollectionReceiptValidationStatus | "flagged";
  duplicateOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type CollectionRecordAggregateFilters = Omit<
  CollectionRecordListFilters,
  "limit" | "offset"
>;

export type CollectionNicknameAggregate = {
  nickname: string;
  totalRecords: number;
  totalAmount: number;
};

export type CollectionNicknameDailyAggregate = {
  nickname: string;
  paymentDate: string;
  totalRecords: number;
  totalAmount: number;
};

export type CollectionMonthlySummary = {
  month: number;
  monthName: string;
  totalRecords: number;
  totalAmount: number;
};

export type CollectionRollupFreshnessSnapshot = {
  status: "fresh" | "warming" | "stale";
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
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
  // Transitional-only legacy field. Authoritative receipt rows live in collection_record_receipts.
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
  receiptAmountCents?: number | null;
  extractedAmountCents?: number | null;
  extractionStatus?: CollectionReceiptExtractionStatus | null;
  extractionConfidence?: number | null;
  receiptDate?: string | null;
  receiptReference?: string | null;
  fileHash?: string | null;
};

export type UpdateCollectionRecordReceiptInput = {
  receiptId: string;
  receiptAmountCents?: number | null;
  extractedAmountCents?: number | null;
  extractionStatus?: CollectionReceiptExtractionStatus | null;
  extractionConfidence?: number | null;
  receiptDate?: string | null;
  receiptReference?: string | null;
};

export type UpdateCollectionRecordInput = {
  customerName?: string;
  icNumber?: string;
  customerPhone?: string;
  accountNumber?: string;
  batch?: CollectionBatch;
  paymentDate?: string;
  amount?: number;
  // Transitional-only legacy field for cleanup/backfill; avoid using as the primary receipt source.
  receiptFile?: string | null;
  collectionStaffNickname?: string;
};

export type UpdateCollectionRecordOptions = {
  expectedUpdatedAt?: Date;
  removeAllReceipts?: boolean;
  removeReceiptIds?: string[];
  newReceipts?: CreateCollectionRecordReceiptInput[];
  receiptUpdates?: UpdateCollectionRecordReceiptInput[];
};

export type DeleteCollectionRecordOptions = {
  expectedUpdatedAt?: Date;
};

export type MutationIdempotencyAcquireInput = {
  scope: string;
  actor: string;
  idempotencyKey: string;
  requestFingerprint?: string | null;
};

export type MutationIdempotencyAcquireResult =
  | { status: "acquired" }
  | {
      status: "replay";
      responseStatus: number;
      responseBody: unknown;
    }
  | { status: "in_progress" }
  | { status: "payload_mismatch" };

export type MutationIdempotencyCompleteInput = {
  scope: string;
  actor: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: unknown;
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
    twoFactorEnabled?: boolean;
    twoFactorSecretEncrypted?: string | null;
    twoFactorConfiguredAt?: Date | null;
    failedLoginAttempts?: number;
    lockedAt?: Date | null;
    lockedReason?: string | null;
    lockedBySystem?: boolean;
  }): Promise<User | undefined>;
  recordFailedLoginAttempt(params: {
    userId: string;
    maxAllowedAttempts: number;
    lockedReason: string;
    now?: Date;
  }): Promise<{
    user: User | undefined;
    failedLoginAttempts: number;
    locked: boolean;
    newlyLocked: boolean;
  }>;
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
  listManagedUsersPage(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: "all" | "admin" | "user";
    status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
  }): Promise<{
    users: ManagedUserAccount[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
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
  listPendingPasswordResetRequestsPage(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
  }): Promise<{
    requests: PendingPasswordResetRequestSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
  getAccounts(): Promise<Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }>>;
  createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord>;
  listCollectionRecords(filters?: CollectionRecordListFilters): Promise<CollectionRecord[]>;
  summarizeCollectionRecords(filters?: CollectionRecordAggregateFilters): Promise<CollectionRecordAggregate>;
  summarizeCollectionRecordsByNickname(filters?: CollectionRecordAggregateFilters): Promise<CollectionNicknameAggregate[]>;
  getCollectionRecordDailyRollupFreshness(filters?: {
    from?: string;
    to?: string;
    createdByLogin?: string;
    nicknames?: string[];
  }): Promise<CollectionRollupFreshnessSnapshot>;
  summarizeCollectionRecordsByNicknameAndPaymentDate(
    filters?: CollectionRecordAggregateFilters,
  ): Promise<CollectionNicknameDailyAggregate[]>;
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
  findCollectionReceiptDuplicateSummaries(
    fileHashes: string[],
    options?: { excludeRecordId?: string },
  ): Promise<CollectionReceiptDuplicateSummary[]>;
  createCollectionRecordReceipts(
    recordId: string,
    receipts: CreateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]>;
  updateCollectionRecordReceipts(
    recordId: string,
    updates: UpdateCollectionRecordReceiptInput[],
  ): Promise<CollectionRecordReceipt[]>;
  deleteCollectionRecordReceipts(recordId: string, receiptIds: string[]): Promise<CollectionRecordReceipt[]>;
  deleteAllCollectionRecordReceipts(recordId: string): Promise<CollectionRecordReceipt[]>;
  syncCollectionRecordReceiptValidation(recordId: string): Promise<CollectionRecord | undefined>;
  updateCollectionRecord(
    id: string,
    data: UpdateCollectionRecordInput,
    options?: UpdateCollectionRecordOptions,
  ): Promise<CollectionRecord | undefined>;
  deleteCollectionRecord(id: string, options?: DeleteCollectionRecordOptions): Promise<boolean>;

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
  expireIdleActivitySession(params: {
    activityId: string;
    idleCutoff: Date;
    idleMinutes: number;
  }): Promise<UserActivity | undefined>;
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
    users: Array<{
      username: string;
      role: string;
      isBanned: boolean | null;
      passwordHash?: string;
      twoFactorEnabled?: boolean;
      twoFactorSecretEncrypted?: string | null;
      twoFactorConfiguredAt?: string | Date | null;
      failedLoginAttempts?: number;
      lockedAt?: string | Date | null;
      lockedReason?: string | null;
      lockedBySystem?: boolean;
    }>;
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
    users: Array<{
      username: string;
      role: string;
      isBanned: boolean | null;
      passwordHash?: string;
      twoFactorEnabled?: boolean;
      twoFactorSecretEncrypted?: string | null;
      twoFactorConfiguredAt?: string | Date | null;
      failedLoginAttempts?: number;
      lockedAt?: string | Date | null;
      lockedReason?: string | null;
      lockedBySystem?: boolean;
    }>;
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

