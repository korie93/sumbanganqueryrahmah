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

type BackupsRepositoryOptions = {
  ensureBackupsTable: () => Promise<void>;
  parseBackupMetadataSafe: (raw: unknown) => Record<string, any> | null;
};

export class BackupsRepository {
  constructor(private readonly options: BackupsRepositoryOptions) {}

  async createBackup(data: InsertBackup): Promise<Backup> {
    await this.options.ensureBackupsTable();
    const id = crypto.randomUUID();
    const result = await db.execute(sql`
      INSERT INTO public.backups (id, name, created_at, created_by, backup_data, metadata)
      VALUES (${id}, ${data.name}, ${new Date()}, ${data.createdBy}, ${data.backupData}, ${data.metadata ?? null})
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
    await this.options.ensureBackupsTable();
    const rows: any[] = [];
    let offset = 0;

    while (true) {
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
        ORDER BY created_at DESC
        LIMIT ${QUERY_PAGE_LIMIT}
        OFFSET ${offset}
      `);

      const chunk = result.rows || [];
      if (!chunk.length) break;
      rows.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return rows.map((row: any) => ({
      ...row,
      metadata: this.options.parseBackupMetadataSafe(row.metadata),
    })) as Backup[];
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
      metadata: this.options.parseBackupMetadataSafe(row.metadata),
    } as Backup;
  }

  async deleteBackup(id: string): Promise<boolean> {
    await this.options.ensureBackupsTable();
    await db.execute(sql`DELETE FROM public.backups WHERE id = ${id}`);
    return true;
  }

  async getBackupDataForExport(): Promise<{
    imports: Import[];
    dataRows: DataRow[];
    users: Array<{ username: string; role: string; isBanned: boolean | null; passwordHash: string }>;
    auditLogs: AuditLog[];
  }> {
    const [allImports, allDataRows, allUsersFromDb, allAuditLogs] = await Promise.all([
      db.select().from(imports).where(eq(imports.isDeleted, false)),
      db.select().from(dataRows),
      db.select().from(users),
      db.select().from(auditLogs),
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
      const parsed = new Date(value as any);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const chunkArray = <T>(rows: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let index = 0; index < rows.length; index += size) {
        chunks.push(rows.slice(index, index + size));
      }
      return chunks;
    };

    await db.transaction(async (tx) => {
      if (backupData.imports.length > 0) {
        for (const chunk of chunkArray(backupData.imports, BACKUP_CHUNK_SIZE)) {
          const rows = chunk.map((record) => ({
            id: record.id,
            name: record.name,
            filename: record.filename,
            createdAt: toDate((record as any).createdAt) ?? new Date(),
            isDeleted: (record as any).isDeleted ?? false,
            createdBy: (record as any).createdBy ?? null,
          }));

          for (const row of rows) {
            await tx.update(imports).set({ isDeleted: false }).where(eq(imports.id, row.id));
          }

          await tx.insert(imports).values(rows).onConflictDoNothing();
          stats.imports += rows.length;
        }
      }

      if (backupData.dataRows.length > 0) {
        for (const chunk of chunkArray(backupData.dataRows, BACKUP_CHUNK_SIZE)) {
          const rows = chunk.map((row) => ({
            id: row.id ?? crypto.randomUUID(),
            importId: row.importId,
            jsonDataJsonb: row.jsonDataJsonb,
          }));

          await tx.insert(dataRows).values(rows).onConflictDoNothing();
          stats.dataRows += rows.length;
        }
      }

      if (backupData.users.length > 0) {
        const now = new Date();
        const rows = backupData.users
          .filter((user) => user.passwordHash)
          .map((user) => ({
            id: crypto.randomUUID(),
            username: user.username,
            passwordHash: user.passwordHash!,
            role: user.role,
            createdAt: now,
            updatedAt: now,
            passwordChangedAt: now,
            isBanned: user.isBanned ?? false,
          }));

        for (const chunk of chunkArray(rows, BACKUP_CHUNK_SIZE)) {
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
}
