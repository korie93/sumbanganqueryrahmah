import { sql } from "drizzle-orm";
import type { CollectionRecord } from "../storage-postgres";
import {
  extractCanonicalSavedCollectionMasterRow,
} from "../lib/saved-collection-link-utils";
import type { CollectionRepositoryExecutor } from "./collection-nickname-utils";
import {
  hashCollectionSourceIdentifier,
  normalizeCollectionSourceIdentifier,
} from "./collection-source-repository-utils";

const SOURCE_ACCOUNT_HYDRATION_CHUNK_SIZE = 200;

type LinkedCollectionSourceAccount = {
  sourceImportId: string;
  sourceDataRowId: string;
};

function normalizeRequiredText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function buildSourceLinkKey(sourceImportId: string, sourceDataRowId: string): string {
  return JSON.stringify([sourceImportId, sourceDataRowId]);
}

function collectMissingSourceAccountLinks(
  records: readonly CollectionRecord[],
): LinkedCollectionSourceAccount[] {
  const links = new Map<string, LinkedCollectionSourceAccount>();

  for (const record of records) {
    if (
      normalizeRequiredText(record.accountNumber)
      && normalizeRequiredText(record.cardNumberLast4)
    ) continue;

    const sourceImportId = normalizeRequiredText(record.sourceImportId);
    const sourceDataRowId = normalizeRequiredText(record.sourceDataRowId);
    const sourceObligationKey = normalizeRequiredText(record.sourceObligationKey);
    if (
      !sourceImportId
      || !sourceDataRowId
      || !(sourceObligationKey?.startsWith("account:") || sourceObligationKey?.startsWith("card:"))
    ) {
      continue;
    }

    const key = buildSourceLinkKey(sourceImportId, sourceDataRowId);
    links.set(key, { sourceImportId, sourceDataRowId });
  }

  return Array.from(links.values());
}

/**
 * Hydrates historical records from their exact linked Saved row. Account is
 * accepted only when its blind index reproduces the immutable obligation key
 * captured at save. A missing Card suffix additionally requires agreement
 * between the raw Saved Card and its governed blind index. Full Card values
 * are discarded immediately and never copied to the record.
 */
export async function hydrateCollectionRecordSourceAccounts(
  executor: CollectionRepositoryExecutor,
  records: readonly CollectionRecord[],
): Promise<CollectionRecord[]> {
  const sourceLinks = collectMissingSourceAccountLinks(records);
  if (sourceLinks.length === 0) {
    return [...records];
  }

  const sourceIdentityByLink = new Map<string, {
    accountNumber: string | null;
    cardNumberLast4: string | null;
    obligationKey: string;
  }>();
  for (let offset = 0; offset < sourceLinks.length; offset += SOURCE_ACCOUNT_HYDRATION_CHUNK_SIZE) {
    const chunk = sourceLinks.slice(offset, offset + SOURCE_ACCOUNT_HYDRATION_CHUNK_SIZE);
    const targetValues = chunk.map((link) => sql`(
      ${link.sourceImportId}::text,
      ${link.sourceDataRowId}::text
    )`);
    const result = await executor.execute(sql`
      WITH target_rows(source_import_id, source_data_row_id) AS (
        VALUES ${sql.join(targetValues, sql`, `)}
      )
      SELECT
        source_data.import_id AS source_import_id,
        source_data.id AS source_data_row_id,
        source_data.json_data AS source_json_data,
        source_index.card_number_hash AS source_card_number_hash,
        source_index.card_number_last4 AS source_card_number_last4,
        source_index.canonical_obligation_key AS source_obligation_key
      FROM target_rows target
      JOIN public.data_rows source_data
        ON source_data.import_id = target.source_import_id
        AND source_data.id = target.source_data_row_id
      LEFT JOIN public.collection_source_rows source_index
        ON source_index.source_import_id = source_data.import_id
        AND source_index.source_data_row_id = source_data.id
    `);
    const expectedLinks = new Set(
      chunk.map((link) => buildSourceLinkKey(link.sourceImportId, link.sourceDataRowId)),
    );

    for (const raw of result.rows || []) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const row = raw as Record<string, unknown>;
      const sourceImportId = normalizeRequiredText(row.source_import_id);
      const sourceDataRowId = normalizeRequiredText(row.source_data_row_id);
      if (!sourceImportId || !sourceDataRowId) continue;

      const key = buildSourceLinkKey(sourceImportId, sourceDataRowId);
      if (!expectedLinks.has(key)) continue;

      const canonicalSource = extractCanonicalSavedCollectionMasterRow(row.source_json_data);
      const sourceAccountNumber = canonicalSource.accountNumber;
      const sourceAccountHash = hashCollectionSourceIdentifier(
        sourceAccountNumber,
        "account_number",
      );
      const sourceCardHash = hashCollectionSourceIdentifier(
        canonicalSource.cardNumber,
        "card_number",
      );
      const sourceObligationKey = sourceAccountHash
        ? `account:${sourceAccountHash}`
        : sourceCardHash
          ? `card:${sourceCardHash}`
          : null;
      if (!sourceObligationKey) continue;
      const indexedCardHash = normalizeRequiredText(row.source_card_number_hash);
      const indexedCardLast4 = normalizeRequiredText(row.source_card_number_last4);
      const indexedObligationKey = normalizeRequiredText(row.source_obligation_key);
      const normalizedCardNumber = normalizeCollectionSourceIdentifier(canonicalSource.cardNumber);
      const cardNumberLast4 = sourceCardHash
        && indexedCardHash === sourceCardHash
        && /^\d{4}$/.test(indexedCardLast4 ?? "")
        && indexedCardLast4 === normalizedCardNumber.slice(-4)
        && indexedObligationKey === sourceObligationKey
        ? indexedCardLast4
        : null;
      sourceIdentityByLink.set(key, {
        accountNumber: sourceAccountNumber,
        cardNumberLast4,
        obligationKey: sourceObligationKey,
      });
    }
  }

  return records.map((record) => {
    if (
      normalizeRequiredText(record.accountNumber)
      && normalizeRequiredText(record.cardNumberLast4)
    ) return record;

    const sourceImportId = normalizeRequiredText(record.sourceImportId);
    const sourceDataRowId = normalizeRequiredText(record.sourceDataRowId);
    const sourceObligationKey = normalizeRequiredText(record.sourceObligationKey);
    if (!sourceImportId || !sourceDataRowId || !sourceObligationKey) return record;

    const sourceIdentity = sourceIdentityByLink.get(
      buildSourceLinkKey(sourceImportId, sourceDataRowId),
    );
    if (!sourceIdentity || sourceObligationKey !== sourceIdentity.obligationKey) return record;

    return {
      ...record,
      accountNumber: normalizeRequiredText(record.accountNumber)
        ? record.accountNumber
        : sourceIdentity.accountNumber ?? record.accountNumber,
      cardNumberLast4: normalizeRequiredText(record.cardNumberLast4)
        ? record.cardNumberLast4 ?? null
        : sourceIdentity.cardNumberLast4,
    };
  });
}
