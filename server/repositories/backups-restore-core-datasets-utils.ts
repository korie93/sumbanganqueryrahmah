import crypto from "crypto";
import { sql } from "drizzle-orm";
import type {
  AuditLog,
  DataRow,
  Import,
} from "../../shared/schema-postgres";
import { auditLogs, dataRows, imports, users } from "../../shared/schema-postgres";
import {
  BACKUP_CHUNK_SIZE,
  type BackupUserRecord,
  type RestoreStats,
} from "./backups-repository-types";
import {
  type BackupPayloadChunkReader,
  type BackupRestoreExecutor,
  toDate,
} from "./backups-restore-shared-utils";

type BackupImportRecord = Import & {
  createdAt?: unknown;
  createdBy?: unknown;
};

export async function restoreImportsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupImportRecord>("imports", BACKUP_CHUNK_SIZE)) {
    const rows = chunk.map((record) => ({
      id: record.id,
      name: record.name,
      filename: record.filename,
      createdAt: toDate(record.createdAt) ?? new Date(),
      isDeleted: false,
      createdBy: record.createdBy ?? null,
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
}

export async function restoreDataRowsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  for await (const chunk of backupDataReader.iterateArrayChunks<DataRow>("dataRows", BACKUP_CHUNK_SIZE)) {
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
}

export async function restoreUsersFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupUserRecord>("users", BACKUP_CHUNK_SIZE)) {
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
        twoFactorEnabled: user.twoFactorEnabled === true,
        twoFactorSecretEncrypted: user.twoFactorSecretEncrypted ?? null,
        twoFactorConfiguredAt: toDate(user.twoFactorConfiguredAt) ?? null,
        failedLoginAttempts: Math.max(0, Number(user.failedLoginAttempts || 0)),
        lockedAt: toDate(user.lockedAt) ?? null,
        lockedReason: String(user.lockedReason || "").trim() || null,
        lockedBySystem: user.lockedBySystem === true,
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
}

export async function restoreAuditLogsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  for await (const chunk of backupDataReader.iterateArrayChunks<AuditLog>("auditLogs", BACKUP_CHUNK_SIZE)) {
    const rows = chunk.map((log) => ({
      id: log.id ?? crypto.randomUUID(),
      action: log.action,
      performedBy: log.performedBy,
      targetUser: log.targetUser ?? null,
      targetResource: log.targetResource ?? null,
      details: log.details ?? null,
      timestamp: toDate(log.timestamp) ?? new Date(),
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
}
