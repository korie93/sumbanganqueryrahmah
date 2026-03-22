import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import type {
  AuditLog,
  Backup,
  DataRow,
  Import,
  InsertBackup,
} from "../../shared/schema-postgres";
import { auditLogs, dataRows, imports, users } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

const BACKUP_CHUNK_SIZE = 500;
const QUERY_PAGE_LIMIT = 1000;
const BACKUP_LIST_DEFAULT_PAGE_SIZE = 25;
const BACKUP_LIST_MAX_PAGE_SIZE = 100;
const BACKUP_DATA_ENCRYPTION_PREFIX_V1 = "enc:v1:";
const BACKUP_DATA_ENCRYPTION_PREFIX_V2 = "enc:v2:";
const BACKUP_DATA_DEFAULT_KEY_ID = "default";

type BackupsRepositoryOptions = {
  ensureBackupsTable: () => Promise<void>;
  parseBackupMetadataSafe: (raw: unknown) => Record<string, any> | null;
};

type BackupEncryptionConfig = {
  requireEncryption: boolean;
  primaryKeyId: string | null;
  keysById: Map<string, Buffer>;
};

type RestoreDatasetStats = {
  processed: number;
  inserted: number;
  skipped: number;
  reactivated: number;
};

type BackupUserRecord = {
  username: string;
  role: string;
  isBanned: boolean | null;
  passwordHash?: string;
};

type BackupCollectionRecord = {
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
};

type BackupCollectionReceipt = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  createdAt: string | Date;
};

type BackupDataPayload = {
  imports: Import[];
  dataRows: DataRow[];
  users: BackupUserRecord[];
  auditLogs: AuditLog[];
  collectionRecords?: BackupCollectionRecord[];
  collectionRecordReceipts?: BackupCollectionReceipt[];
};

type BackupListSort = "newest" | "oldest" | "name-asc" | "name-desc";

type BackupListPageParams = {
  page?: number;
  pageSize?: number;
  searchName?: string;
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: BackupListSort;
};

type BackupListPageResult = {
  backups: Backup[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type RestoreStats = {
  imports: RestoreDatasetStats;
  dataRows: RestoreDatasetStats;
  users: RestoreDatasetStats;
  auditLogs: RestoreDatasetStats;
  collectionRecords: RestoreDatasetStats;
  collectionRecordReceipts: RestoreDatasetStats;
  warnings: string[];
  totalProcessed: number;
  totalInserted: number;
  totalSkipped: number;
  totalReactivated: number;
};

function createRestoreDatasetStats(): RestoreDatasetStats {
  return {
    processed: 0,
    inserted: 0,
    skipped: 0,
    reactivated: 0,
  };
}

export class BackupsRepository {
  private readonly backupEncryption: BackupEncryptionConfig;

  constructor(private readonly options: BackupsRepositoryOptions) {
    this.backupEncryption = this.resolveBackupEncryptionConfig();
    this.assertBackupEncryptionConfig();
  }

  private resolveNodeEnv(): "development" | "test" | "production" | "other" {
    const normalized = String(process.env.NODE_ENV || "development").trim().toLowerCase();
    if (normalized === "development" || normalized === "test" || normalized === "production") {
      return normalized;
    }
    return "other";
  }

  private parseEncryptionKey(raw: string): Buffer | null {
    const normalized = String(raw || "").trim();
    if (!normalized) return null;

    const fromHex = /^[a-f0-9]{64}$/i.test(normalized) ? Buffer.from(normalized, "hex") : null;
    if (fromHex && fromHex.length === 32) return fromHex;

    const base64Candidate = /^[A-Za-z0-9+/=]+$/.test(normalized) ? Buffer.from(normalized, "base64") : null;
    if (base64Candidate && base64Candidate.length === 32) return base64Candidate;

    const utf8 = Buffer.from(normalized, "utf8");
    if (utf8.length === 32) return utf8;

    return null;
  }

  private normalizeEncryptionKeyId(raw: string): string | null {
    const normalized = String(raw || "").trim().toLowerCase();
    if (!normalized) return null;
    if (!/^[a-z0-9_-]{1,64}$/.test(normalized)) return null;
    return normalized;
  }

  private parseEncryptionKeyMap(raw: string): Map<string, Buffer> {
    const keysById = new Map<string, Buffer>();
    const entries = String(raw || "")
      .split(/[,\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const separatorIndex = entry.indexOf(":");
      const keyIdRaw = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : BACKUP_DATA_DEFAULT_KEY_ID;
      const keyRaw = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : entry;
      const keyId = this.normalizeEncryptionKeyId(keyIdRaw);
      const key = this.parseEncryptionKey(keyRaw);
      if (!keyId || !key) continue;
      keysById.set(keyId, key);
    }

    return keysById;
  }

  private resolveBackupEncryptionConfig(): BackupEncryptionConfig {
    const nodeEnv = this.resolveNodeEnv();
    const requireEncryption = nodeEnv !== "development" && nodeEnv !== "test";

    const envMap = this.parseEncryptionKeyMap(String(process.env.BACKUP_ENCRYPTION_KEYS || ""));
    const singleRawKey = String(process.env.BACKUP_ENCRYPTION_KEY || "").trim();
    const singleKey = this.parseEncryptionKey(singleRawKey);
    const singleKeyId =
      this.normalizeEncryptionKeyId(String(process.env.BACKUP_ENCRYPTION_KEY_ID || ""))
      || BACKUP_DATA_DEFAULT_KEY_ID;

    if (singleKey && !envMap.has(singleKeyId)) {
      envMap.set(singleKeyId, singleKey);
    }

    const preferredKeyId = this.normalizeEncryptionKeyId(String(process.env.BACKUP_ENCRYPTION_KEY_ID || ""));
    const primaryKeyId = preferredKeyId && envMap.has(preferredKeyId)
      ? preferredKeyId
      : envMap.keys().next().value || null;

    if (preferredKeyId && !envMap.has(preferredKeyId)) {
      throw new Error(
        `BACKUP_ENCRYPTION_KEY_ID '${preferredKeyId}' is configured but no matching key exists in BACKUP_ENCRYPTION_KEY(S).`,
      );
    }

    return {
      requireEncryption,
      primaryKeyId,
      keysById: envMap,
    };
  }

  private assertBackupEncryptionConfig() {
    if (!this.backupEncryption.requireEncryption) {
      return;
    }
    if (this.backupEncryption.keysById.size > 0 && this.backupEncryption.primaryKeyId) {
      return;
    }
    throw new Error(
      "Backup encryption is required outside development/test. Configure BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS.",
    );
  }

  private getPrimaryBackupEncryptionKey(): { keyId: string; key: Buffer } | null {
    const keyId = this.backupEncryption.primaryKeyId;
    if (!keyId) return null;
    const key = this.backupEncryption.keysById.get(keyId);
    if (!key) return null;
    return { keyId, key };
  }

  private decryptBackupPayloadWithKey(
    ivBase64: string,
    authTagBase64: string,
    ciphertextBase64: string,
    key: Buffer,
  ): string {
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  private encodeBackupDataForStorage(rawPayload: string): string {
    const primaryKey = this.getPrimaryBackupEncryptionKey();
    if (!primaryKey) {
      if (this.backupEncryption.requireEncryption) {
        throw new Error(
          "Backup encryption key is required outside development/test environments.",
        );
      }
      return rawPayload;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", primaryKey.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(rawPayload, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${BACKUP_DATA_ENCRYPTION_PREFIX_V2}${primaryKey.keyId}.${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
  }

  private decodeBackupDataFromStorage(rawPayload: string): string {
    const normalized = String(rawPayload || "");
    if (normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V2)) {
      const token = normalized.slice(BACKUP_DATA_ENCRYPTION_PREFIX_V2.length);
      const [keyIdRaw, ivBase64, authTagBase64, ciphertextBase64] = token.split(".");
      const keyId = this.normalizeEncryptionKeyId(keyIdRaw || "");
      if (!keyId || !ivBase64 || !authTagBase64 || !ciphertextBase64) {
        throw new Error("Stored backup payload has an invalid encrypted format.");
      }

      const key = this.backupEncryption.keysById.get(keyId);
      if (!key) {
        throw new Error(
          `Missing backup encryption key '${keyId}'. Configure BACKUP_ENCRYPTION_KEYS for key rotation support.`,
        );
      }

      return this.decryptBackupPayloadWithKey(ivBase64, authTagBase64, ciphertextBase64, key);
    }

    if (!normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V1)) {
      return normalized;
    }

    if (this.backupEncryption.keysById.size === 0) {
      throw new Error("BACKUP_ENCRYPTION_KEY(S) is required to decrypt stored backup data.");
    }

    const token = normalized.slice(BACKUP_DATA_ENCRYPTION_PREFIX_V1.length);
    const [ivBase64, authTagBase64, ciphertextBase64] = token.split(".");
    if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
      throw new Error("Stored backup payload has an invalid encrypted format.");
    }

    for (const key of this.backupEncryption.keysById.values()) {
      try {
        return this.decryptBackupPayloadWithKey(ivBase64, authTagBase64, ciphertextBase64, key);
      } catch {
        // Try the next key to support rotation of legacy v1 payloads without key id.
      }
    }

    throw new Error("Unable to decrypt legacy encrypted backup payload with configured backup encryption keys.");
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(value as any);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private chunkArray<T>(rows: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < rows.length; index += size) {
      chunks.push(rows.slice(index, index + size));
    }
    return chunks;
  }

  private async safeSelectRows<T extends Record<string, unknown>>(query: unknown): Promise<T[]> {
    try {
      const result = await db.execute(query as any);
      return (Array.isArray(result.rows) ? result.rows : []) as T[];
    } catch (error) {
      const message = String((error as { message?: string })?.message || "");
      if (/relation\s+["']?[\w.]+["']?\s+does not exist/i.test(message)) {
        return [];
      }
      throw error;
    }
  }

  private createRestoreStats(): RestoreStats {
    return {
      imports: createRestoreDatasetStats(),
      dataRows: createRestoreDatasetStats(),
      users: createRestoreDatasetStats(),
      auditLogs: createRestoreDatasetStats(),
      collectionRecords: createRestoreDatasetStats(),
      collectionRecordReceipts: createRestoreDatasetStats(),
      warnings: [],
      totalProcessed: 0,
      totalInserted: 0,
      totalSkipped: 0,
      totalReactivated: 0,
    };
  }

  private updateRestoreTotals(stats: RestoreStats) {
    const datasets = [
      stats.imports,
      stats.dataRows,
      stats.users,
      stats.auditLogs,
      stats.collectionRecords,
      stats.collectionRecordReceipts,
    ];
    stats.totalProcessed = datasets.reduce((sum, item) => sum + item.processed, 0);
    stats.totalInserted = datasets.reduce((sum, item) => sum + item.inserted, 0);
    stats.totalSkipped = datasets.reduce((sum, item) => sum + item.skipped, 0);
    stats.totalReactivated = datasets.reduce((sum, item) => sum + item.reactivated, 0);
  }

  async createBackup(data: InsertBackup): Promise<Backup> {
    await this.options.ensureBackupsTable();
    const id = crypto.randomUUID();
    const backupDataForStorage = this.encodeBackupDataForStorage(String(data.backupData || "{}"));
    const result = await db.execute(sql`
      INSERT INTO public.backups (id, name, created_at, created_by, backup_data, metadata)
      VALUES (${id}, ${data.name}, ${new Date()}, ${data.createdBy}, ${backupDataForStorage}, ${data.metadata ?? null})
      RETURNING
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        ''::text as "backupData",
        metadata
    `);

    return result.rows[0] as Backup;
  }

  async getBackups(): Promise<Backup[]> {
    const firstPage = await this.listBackupsPage({
      page: 1,
      pageSize: QUERY_PAGE_LIMIT,
      sortBy: "newest",
    });

    if (firstPage.total <= firstPage.backups.length) {
      return firstPage.backups;
    }

    const rows: Backup[] = [...firstPage.backups];
    let page = 2;
    while (rows.length < firstPage.total) {
      const nextPage = await this.listBackupsPage({
        page,
        pageSize: QUERY_PAGE_LIMIT,
        sortBy: "newest",
      });
      if (!nextPage.backups.length) break;
      rows.push(...nextPage.backups);
      page += 1;
    }

    return rows;
  }

  async listBackupsPage(params: BackupListPageParams = {}): Promise<BackupListPageResult> {
    await this.options.ensureBackupsTable();
    const rawPage = Number(params.page);
    const rawPageSize = Number(params.pageSize);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.max(1, Math.min(BACKUP_LIST_MAX_PAGE_SIZE, Math.floor(rawPageSize)))
      : BACKUP_LIST_DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const whereClauses: any[] = [];
    const searchName = String(params.searchName || "").trim();
    if (searchName) {
      whereClauses.push(sql`name ILIKE ${`%${searchName}%`}`);
    }

    const createdBy = String(params.createdBy || "").trim();
    if (createdBy) {
      whereClauses.push(sql`created_by ILIKE ${`%${createdBy}%`}`);
    }

    const dateFrom = params.dateFrom instanceof Date && Number.isFinite(params.dateFrom.getTime())
      ? params.dateFrom
      : null;
    const dateTo = params.dateTo instanceof Date && Number.isFinite(params.dateTo.getTime())
      ? params.dateTo
      : null;
    if (dateFrom) {
      whereClauses.push(sql`created_at >= ${dateFrom}`);
    }
    if (dateTo) {
      whereClauses.push(sql`created_at <= ${dateTo}`);
    }

    const whereSql = whereClauses.length
      ? sql`WHERE ${sql.join(whereClauses, sql` AND `)}`
      : sql``;

    const sortBy = String(params.sortBy || "newest").toLowerCase() as BackupListSort;
    const orderBySql =
      sortBy === "oldest"
        ? sql`ORDER BY created_at ASC, id ASC`
        : sortBy === "name-asc"
          ? sql`ORDER BY lower(name) ASC, created_at DESC, id DESC`
          : sortBy === "name-desc"
            ? sql`ORDER BY lower(name) DESC, created_at DESC, id DESC`
            : sql`ORDER BY created_at DESC, id DESC`;

    const [countResult, rowsResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM public.backups
        ${whereSql}
      `),
      db.execute(sql`
        SELECT
          id,
          name,
          created_at as "createdAt",
          created_by as "createdBy",
          ''::text as "backupData",
          CASE
            WHEN metadata IS NULL THEN NULL
            WHEN length(metadata) > 200000 THEN NULL
            ELSE metadata
          END as metadata
        FROM public.backups
        ${whereSql}
        ${orderBySql}
        LIMIT ${pageSize}
        OFFSET ${offset}
      `),
    ]);

    const total = Number((countResult.rows?.[0] as { total?: number } | undefined)?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const backups = (rowsResult.rows || []).map((row: any) => ({
      ...row,
      metadata: this.options.parseBackupMetadataSafe(row.metadata),
    })) as Backup[];

    return {
      backups,
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async getBackupById(id: string): Promise<Backup | undefined> {
    await this.options.ensureBackupsTable();
    const result = await db.execute(sql`
      SELECT
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        backup_data as "backupData",
        CASE
          WHEN metadata IS NULL THEN NULL
          WHEN length(metadata) > 200000 THEN NULL
          ELSE metadata
        END as metadata
      FROM public.backups
      WHERE id = ${id}
      LIMIT 1
    `);

    const row = result.rows[0] as any;
    if (!row) return undefined;

    return {
      ...row,
      backupData: this.decodeBackupDataFromStorage(String(row.backupData || "")),
      metadata: this.options.parseBackupMetadataSafe(row.metadata),
    } as Backup;
  }

  async getBackupMetadataById(id: string): Promise<Backup | undefined> {
    await this.options.ensureBackupsTable();
    const result = await db.execute(sql`
      SELECT
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        ''::text as "backupData",
        CASE
          WHEN metadata IS NULL THEN NULL
          WHEN length(metadata) > 200000 THEN NULL
          ELSE metadata
        END as metadata
      FROM public.backups
      WHERE id = ${id}
      LIMIT 1
    `);

    const row = result.rows[0] as any;
    if (!row) return undefined;

    return {
      ...row,
      backupData: "",
      metadata: this.options.parseBackupMetadataSafe(row.metadata),
    } as Backup;
  }

  async deleteBackup(id: string): Promise<boolean> {
    await this.options.ensureBackupsTable();
    const result = await db.execute(sql`
      DELETE FROM public.backups
      WHERE id = ${id}
      RETURNING id
    `);
    return (result.rows?.length || 0) > 0;
  }

  async getBackupDataForExport(): Promise<BackupDataPayload> {
    const [allImports, allDataRows, allUsersFromDb, allAuditLogs] = await Promise.all([
      db.select().from(imports).where(eq(imports.isDeleted, false)),
      db.select().from(dataRows),
      db.select().from(users),
      db.select().from(auditLogs),
    ]);

    const [collectionRecords, collectionRecordReceipts] = await Promise.all([
      this.safeSelectRows<BackupCollectionRecord>(sql`
        SELECT
          id,
          customer_name as "customerName",
          ic_number as "icNumber",
          customer_phone as "customerPhone",
          account_number as "accountNumber",
          batch,
          payment_date as "paymentDate",
          amount,
          receipt_file as "receiptFile",
          created_by_login as "createdByLogin",
          collection_staff_nickname as "collectionStaffNickname",
          staff_username as "staffUsername",
          created_at as "createdAt"
        FROM public.collection_records
      `),
      this.safeSelectRows<BackupCollectionReceipt>(sql`
        SELECT
          id,
          collection_record_id as "collectionRecordId",
          storage_path as "storagePath",
          original_file_name as "originalFileName",
          original_mime_type as "originalMimeType",
          original_extension as "originalExtension",
          file_size as "fileSize",
          created_at as "createdAt"
        FROM public.collection_record_receipts
      `),
    ]);

    return {
      imports: allImports,
      dataRows: allDataRows,
      users: allUsersFromDb.map((user) => ({
        username: user.username,
        role: user.role,
        isBanned: user.isBanned,
        passwordHash: user.passwordHash,
      })),
      auditLogs: allAuditLogs,
      collectionRecords,
      collectionRecordReceipts,
    };
  }

  async restoreFromBackup(backupDataRaw: BackupDataPayload): Promise<{ success: boolean; stats: RestoreStats }> {
    const backupData = (backupDataRaw || {}) as BackupDataPayload;
    const stats = this.createRestoreStats();
    const restoredCollectionRecordIds = new Set<string>();

    await db.transaction(async (tx) => {
      const importChunks = this.chunkArray(backupData.imports || [], BACKUP_CHUNK_SIZE);
      for (const chunk of importChunks) {
        const rows = chunk.map((record) => ({
          id: record.id,
          name: record.name,
          filename: record.filename,
          createdAt: this.toDate((record as any).createdAt) ?? new Date(),
          isDeleted: false,
          createdBy: (record as any).createdBy ?? null,
        }));

        stats.imports.processed += rows.length;
        if (!rows.length) continue;

        const importIds = rows.map((row) => row.id);
        const reactivatedResult = await tx.execute(sql`
          UPDATE public.imports
          SET is_deleted = false
          WHERE id IN (${sql.join(importIds.map((value) => sql`${value}`), sql`, `)})
            AND is_deleted = true
          RETURNING id
        `);
        const reactivatedCount = reactivatedResult.rows?.length || 0;
        const insertedRows = await tx
          .insert(imports)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: imports.id });
        stats.imports.reactivated += reactivatedCount;
        stats.imports.inserted += insertedRows.length;
        stats.imports.skipped += rows.length - insertedRows.length - reactivatedCount;
      }

      const dataRowChunks = this.chunkArray(backupData.dataRows || [], BACKUP_CHUNK_SIZE);
      for (const chunk of dataRowChunks) {
        const rows = chunk.map((row) => ({
          id: row.id ?? crypto.randomUUID(),
          importId: row.importId,
          jsonDataJsonb: row.jsonDataJsonb,
        }));
        stats.dataRows.processed += rows.length;
        if (!rows.length) continue;
        const insertedRows = await tx
          .insert(dataRows)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: dataRows.id });
        stats.dataRows.inserted += insertedRows.length;
        stats.dataRows.skipped += rows.length - insertedRows.length;
      }

      const userChunks = this.chunkArray(backupData.users || [], BACKUP_CHUNK_SIZE);
      for (const chunk of userChunks) {
        const now = new Date();
        const rows = chunk
          .filter((user) => Boolean(user.passwordHash))
          .map((user) => ({
            id: crypto.randomUUID(),
            username: String(user.username || "").trim().toLowerCase(),
            passwordHash: user.passwordHash!,
            role: user.role || "user",
            createdAt: now,
            updatedAt: now,
            passwordChangedAt: now,
            isBanned: user.isBanned ?? false,
          }))
          .filter((user) => user.username !== "");
        stats.users.processed += rows.length;
        const skippedInChunk = chunk.length - rows.length;
        if (skippedInChunk > 0 && stats.warnings.length < 200) {
          stats.warnings.push(`${skippedInChunk} user rows skipped because username/passwordHash is invalid.`);
        }
        stats.users.skipped += skippedInChunk;
        if (!rows.length) continue;
        const insertedRows = await tx
          .insert(users)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: users.id });
        stats.users.inserted += insertedRows.length;
        stats.users.skipped += rows.length - insertedRows.length;
      }

      const auditChunks = this.chunkArray(backupData.auditLogs || [], BACKUP_CHUNK_SIZE);
      for (const chunk of auditChunks) {
        const rows = chunk.map((log) => ({
          id: (log as any).id ?? crypto.randomUUID(),
          action: log.action,
          performedBy: log.performedBy,
          targetUser: log.targetUser ?? null,
          targetResource: log.targetResource ?? null,
          details: log.details ?? null,
          timestamp: this.toDate((log as any).timestamp) ?? new Date(),
        }));

        stats.auditLogs.processed += rows.length;
        if (!rows.length) continue;
        const insertedRows = await tx
          .insert(auditLogs)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: auditLogs.id });
        stats.auditLogs.inserted += insertedRows.length;
        stats.auditLogs.skipped += rows.length - insertedRows.length;
      }

      const collectionRecords = Array.isArray(backupData.collectionRecords)
        ? backupData.collectionRecords
        : [];
      const collectionRecordChunks = this.chunkArray(collectionRecords, BACKUP_CHUNK_SIZE);
      for (const chunk of collectionRecordChunks) {
        const rows = chunk
          .map((record) => {
            const paymentDate =
              typeof record.paymentDate === "string"
                ? record.paymentDate.slice(0, 10)
                : this.toDate(record.paymentDate)?.toISOString().slice(0, 10) || "";
            if (!paymentDate) {
              return null;
            }
            return {
              id: String(record.id || crypto.randomUUID()),
              customerName: String(record.customerName || "-"),
              icNumber: String(record.icNumber || "-"),
              customerPhone: String(record.customerPhone || "-"),
              accountNumber: String(record.accountNumber || "-"),
              batch: String(record.batch || "P10"),
              paymentDate,
              amount: Number(record.amount || 0),
              receiptFile: record.receiptFile || null,
              createdByLogin: String(record.createdByLogin || "system"),
              collectionStaffNickname: String(record.collectionStaffNickname || record.staffUsername || "unknown"),
              staffUsername: String(record.staffUsername || record.collectionStaffNickname || "unknown"),
              createdAt: this.toDate(record.createdAt) ?? new Date(),
            };
          })
          .filter((value): value is NonNullable<typeof value> => Boolean(value));

        stats.collectionRecords.processed += rows.length;
        if (!rows.length) continue;
        for (const row of rows) {
          restoredCollectionRecordIds.add(row.id);
        }

        const valuesSql = sql.join(
          rows.map((row) => sql`(
            ${row.id}::uuid,
            ${row.customerName},
            ${row.icNumber},
            ${row.customerPhone},
            ${row.accountNumber},
            ${row.batch},
            ${row.paymentDate}::date,
            ${row.amount},
            ${row.receiptFile},
            ${row.createdByLogin},
            ${row.collectionStaffNickname},
            ${row.staffUsername},
            ${row.createdAt}
          )`),
          sql`, `,
        );

        const insertedResult = await tx.execute(sql`
          INSERT INTO public.collection_records (
            id,
            customer_name,
            ic_number,
            customer_phone,
            account_number,
            batch,
            payment_date,
            amount,
            receipt_file,
            created_by_login,
            collection_staff_nickname,
            staff_username,
            created_at
          )
          VALUES ${valuesSql}
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `);
        const insertedCount = insertedResult.rows?.length || 0;
        stats.collectionRecords.inserted += insertedCount;
        stats.collectionRecords.skipped += rows.length - insertedCount;
      }

      const collectionReceipts = Array.isArray(backupData.collectionRecordReceipts)
        ? backupData.collectionRecordReceipts
        : [];
      const collectionReceiptChunks = this.chunkArray(collectionReceipts, BACKUP_CHUNK_SIZE);
      for (const chunk of collectionReceiptChunks) {
        const rows = chunk
          .map((receipt) => {
            if (!receipt.collectionRecordId || !receipt.storagePath) return null;
            return {
              id: String(receipt.id || crypto.randomUUID()),
              collectionRecordId: String(receipt.collectionRecordId),
              storagePath: String(receipt.storagePath),
              originalFileName: String(receipt.originalFileName || "receipt"),
              originalMimeType: String(receipt.originalMimeType || "application/octet-stream"),
              originalExtension: String(receipt.originalExtension || ""),
              fileSize: Number(receipt.fileSize || 0),
              createdAt: this.toDate(receipt.createdAt) ?? new Date(),
            };
          })
          .filter((value): value is NonNullable<typeof value> => Boolean(value));

        stats.collectionRecordReceipts.processed += rows.length;
        if (!rows.length) continue;

        const valuesSql = sql.join(
          rows.map((row) => sql`(
            ${row.id}::uuid,
            ${row.collectionRecordId}::uuid,
            ${row.storagePath},
            ${row.originalFileName},
            ${row.originalMimeType},
            ${row.originalExtension},
            ${row.fileSize},
            ${row.createdAt}
          )`),
          sql`, `,
        );
        const insertedResult = await tx.execute(sql`
          INSERT INTO public.collection_record_receipts (
            id,
            collection_record_id,
            storage_path,
            original_file_name,
            original_mime_type,
            original_extension,
            file_size,
            created_at
          )
          VALUES ${valuesSql}
          ON CONFLICT (collection_record_id, storage_path) DO NOTHING
          RETURNING id
        `);
        const insertedCount = insertedResult.rows?.length || 0;
        stats.collectionRecordReceipts.inserted += insertedCount;
        stats.collectionRecordReceipts.skipped += rows.length - insertedCount;
      }

      if (restoredCollectionRecordIds.size > 0) {
        const recordIdSql = sql.join(
          Array.from(restoredCollectionRecordIds).map((value) => sql`${value}::uuid`),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE public.collection_records record
          SET receipt_file = first_receipt.storage_path
          FROM (
            SELECT DISTINCT ON (collection_record_id)
              collection_record_id,
              storage_path
            FROM public.collection_record_receipts
            WHERE collection_record_id IN (${recordIdSql})
            ORDER BY collection_record_id, created_at ASC, id ASC
          ) first_receipt
          WHERE record.id = first_receipt.collection_record_id
        `);
      }
    });

    this.updateRestoreTotals(stats);
    return { success: true, stats };
  }
}
