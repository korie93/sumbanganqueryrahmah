import { sql } from "drizzle-orm";
import { decryptCollectionPiiValueResult, encryptCollectionPiiFieldValue } from "../lib/collection-pii-encryption";
import { normalizeCollectionOspTargetPercentage } from "../lib/collection-osp-reconciliation";
import { safeJsonParse } from "../lib/safe-json";
import { normalizeBackupCollectionOspClientResult } from "./backups-restore-collection-v7-normalize-utils";
import type { BackupCollectionOspClientResult, BackupCollectionOspPrivateClientResult, RestoreStats } from "./backups-repository-types";
import type { BackupPayloadChunkReader, BackupRestoreExecutor } from "./backups-restore-shared-utils";

export type PrivateClientBackupRow = BackupCollectionOspClientResult & { ownerUserId: string; targetPercentage: string };
const PURPOSE = "sqr-osp-private-client-v3";

function normalizePrivateEvidence(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength || Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  })) {
    throw new Error(`Private Billing backup ${label} is invalid.`);
  }
  // The private-save API permits TAB, LF and CR in evidence. Preserve those
  // bytes here; the legacy normalizer intentionally keeps identifiers strict.
  return value;
}

function normalizePrivateRow(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Private Billing backup row is invalid.");
  const record = value as PrivateClientBackupRow;
  const note = normalizePrivateEvidence(record.note, "note", 2_000);
  const clientReference = normalizePrivateEvidence(record.clientReference, "reference", 300);
  const row = normalizeBackupCollectionOspClientResult({ ...record, note: null, clientReference: null });
  const owner = record.ownerUserId;
  if (!row || row.agingBucket === "ALL" || typeof owner !== "string" || owner.length < 1 || owner.length > 200
    || owner !== owner.trim() || Array.from(owner).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error("Private Billing backup must retain a valid stable owner and D3–D6 row.");
  }
  return { ...row, note, clientReference, ownerUserId: owner, targetPercentage: normalizeCollectionOspTargetPercentage(record.targetPercentage) };
}

export function protectCollectionOspPrivateClientBackup(value: unknown): BackupCollectionOspPrivateClientResult {
  const row = normalizePrivateRow(value);
  const payloadEncrypted = encryptCollectionPiiFieldValue(JSON.stringify({ purpose: PURPOSE, row }));
  if (!payloadEncrypted) throw new Error("Collection encryption key is required to protect private Billing backup values.");
  return { id: row.id, payloadEncrypted };
}

export function readCollectionOspPrivateClientBackup(record: BackupCollectionOspPrivateClientResult) {
  if (typeof record?.payloadEncrypted !== "string" || record.payloadEncrypted.length > 24_000) {
    throw new Error("Private Billing backup ciphertext is invalid.");
  }
  const decrypted = decryptCollectionPiiValueResult(record.payloadEncrypted, { operation: "ospPrivateBackupRestore", logFailure: false });
  if (!decrypted.success) throw new Error("Private Billing backup cannot be decrypted. Keep the required historical Collection key configured.");
  const parsed = safeJsonParse<{ purpose: unknown; row: unknown }>(decrypted.data, "ospPrivateBackupRestore", {
    logFailures: false, maxRawBytes: 16_000, maxTotalBytes: 16_000, maxStringLength: 2_000, maxObjectKeys: 25, maxDepth: 4, maxArrayLength: 1,
  });
  if (!parsed.success || parsed.data?.purpose !== PURPOSE) throw new Error("Private Billing backup envelope is invalid.");
  const row = normalizePrivateRow(parsed.data.row);
  if (row.id !== record.id) throw new Error("Private Billing backup identity binding is invalid.");
  return row;
}

export async function restoreCollectionOspPrivateClientResultsFromBackup(
  tx: BackupRestoreExecutor, reader: BackupPayloadChunkReader, stats: RestoreStats,
) {
  for await (const chunk of reader.iterateArrayChunks<BackupCollectionOspPrivateClientResult>("collectionOspPrivateClientResults", 200)) {
    if (!chunk.length) continue;
    const rows = chunk.map(readCollectionOspPrivateClientBackup);
    const values = sql.join(rows.map((row) => sql`(
      ${row.id}::uuid, ${row.targetId}::uuid, ${row.targetRevisionId}::uuid, ${row.ownerUserId}::text,
      ${row.agingBucket}::text, ${row.targetPercentage}::numeric(7,4), ${row.resultPercentage}::numeric(9,4),
      ${row.ospClosed}::numeric(16,2), ${row.asOfDate}::date, ${row.clientReference}::text, ${row.note}::text,
      ${row.version}::integer, ${row.createdBy}::text, ${row.createdAt}::timestamptz, ${row.updatedBy}::text, ${row.updatedAt}::timestamptz
    )`), sql`, `);
    const result = await tx.execute(sql`
      WITH candidates (id, target_id, target_revision_id, owner_user_id, aging_bucket, target_percentage,
        result_percentage, osp_closed, as_of_date, client_reference, note, version, created_by, created_at, updated_by, updated_at)
      AS (VALUES ${values}), valid AS (
        SELECT candidate.* FROM candidates candidate
        JOIN public.collection_osp_target_revisions revision
          ON revision.id = candidate.target_revision_id AND revision.target_id = candidate.target_id
        JOIN public.collection_osp_target_aging_rows baseline
          ON baseline.target_revision_id = candidate.target_revision_id AND baseline.aging_bucket = candidate.aging_bucket
        JOIN public.users owner_account ON owner_account.id = candidate.owner_user_id
        JOIN public.users created_actor ON lower(created_actor.username) = lower(candidate.created_by)
        JOIN public.users updated_actor ON lower(updated_actor.username) = lower(candidate.updated_by)
        WHERE candidate.osp_closed = round(baseline.total_osp_baseline * candidate.result_percentage / 100, 2)
          AND (baseline.total_osp_baseline > 0 OR candidate.result_percentage = 0)
      ), inserted AS (
        INSERT INTO public.collection_osp_private_client_results
          (id, target_id, target_revision_id, owner_user_id, aging_bucket, target_percentage, result_percentage,
            osp_closed, as_of_date, client_reference, note, version, created_by, created_at, updated_by, updated_at)
        SELECT * FROM valid ON CONFLICT DO NOTHING RETURNING id
      ) SELECT (SELECT count(*)::int FROM valid) AS valid_count, (SELECT count(*)::int FROM inserted) AS inserted_count
    `);
    const counts = result.rows?.[0] as { valid_count?: number; inserted_count?: number } | undefined;
    if (Number(counts?.valid_count) !== rows.length) {
      throw new Error("Private Billing backup cannot restore its original account/revision/baseline. Restore matching stable account IDs; private ownership is never transferred by username.");
    }
    stats.collectionOspPrivateClientResults.processed += rows.length;
    stats.collectionOspPrivateClientResults.inserted += Number(counts?.inserted_count ?? 0);
    stats.collectionOspPrivateClientResults.skipped += rows.length - Number(counts?.inserted_count ?? 0);
  }
}
