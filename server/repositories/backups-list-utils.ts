import crypto from "crypto";
import { sql } from "drizzle-orm";
import type {
  Backup,
  InsertBackup,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  decodeBackupDataFromStorage,
  encodeBackupDataForStorage,
  type BackupEncryptionConfig,
} from "./backups-encryption";
import {
  BACKUP_LIST_DEFAULT_PAGE_SIZE,
  BACKUP_LIST_MAX_PAGE_SIZE,
  QUERY_PAGE_LIMIT,
  type BackupListPageParams,
  type BackupListPageResult,
  type BackupsRepositoryOptions,
} from "./backups-repository-types";

export async function createBackup(
  options: BackupsRepositoryOptions,
  backupEncryption: BackupEncryptionConfig,
  data: InsertBackup,
): Promise<Backup> {
  await options.ensureBackupsTable();
  const id = crypto.randomUUID();
  const backupDataForStorage = encodeBackupDataForStorage(
    String(data.backupData || "{}"),
    backupEncryption,
  );
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

export async function getBackups(
  options: BackupsRepositoryOptions,
): Promise<Backup[]> {
  const firstPage = await listBackupsPage(options, {
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
    const nextPage = await listBackupsPage(options, {
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

export async function listBackupsPage(
  options: BackupsRepositoryOptions,
  params: BackupListPageParams = {},
): Promise<BackupListPageResult> {
  await options.ensureBackupsTable();
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

  const sortBy = String(params.sortBy || "newest").toLowerCase();
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
    metadata: options.parseBackupMetadataSafe(row.metadata),
  })) as Backup[];

  return {
    backups,
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function getBackupById(
  options: BackupsRepositoryOptions,
  backupEncryption: BackupEncryptionConfig,
  id: string,
): Promise<Backup | undefined> {
  await options.ensureBackupsTable();
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
    backupData: decodeBackupDataFromStorage(String(row.backupData || ""), backupEncryption),
    metadata: options.parseBackupMetadataSafe(row.metadata),
  } as Backup;
}

export async function getBackupMetadataById(
  options: BackupsRepositoryOptions,
  id: string,
): Promise<Backup | undefined> {
  await options.ensureBackupsTable();
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
    metadata: options.parseBackupMetadataSafe(row.metadata),
  } as Backup;
}

export async function deleteBackup(
  options: BackupsRepositoryOptions,
  id: string,
): Promise<boolean> {
  await options.ensureBackupsTable();
  const result = await db.execute(sql`
    DELETE FROM public.backups
    WHERE id = ${id}
    RETURNING id
  `);
  return (result.rows?.length || 0) > 0;
}
