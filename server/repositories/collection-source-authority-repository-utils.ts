import { sql } from "drizzle-orm";
import type {
  CollectionAgingBucket,
  CollectionSourceMatchBasis,
} from "../storage-postgres-collection-types";
import type { CollectionRepositoryExecutor } from "./collection-nickname-utils";
import { extractCanonicalSavedCollectionMasterRow } from "../lib/saved-collection-link-utils";
import {
  hashCollectionSourceIdentifier,
  normalizeCollectionSourceIdentifier,
} from "./collection-source-repository-utils";

export type AuthorizedCollectionSourceSnapshotInput = {
  sourceImportId: string;
  sourceDataRowId: string;
  paymentDate: string;
  accountNumber: string;
  cardNumber?: string | null;
  requireFullIdentifierMatch?: boolean;
  cardNumberLast4: string | null;
  agingBucket: CollectionAgingBucket | null;
  callingDate: string | null;
  callingWindowEndExclusive: string | null;
  totalDue: string | number | null;
  billingPrincipalOsp: string | number | null;
  sourceMatchBasis: CollectionSourceMatchBasis | null;
  sourceObligationKey: string | null;
  settlementCycleKey: string | null;
};

export type AuthorizedCollectionSourceIdentity = {
  /** Trusted Account value from the exact Saved row. Full Card is never returned. */
  accountNumber: string | null;
  /** Safe display-only suffix derived from the hash-verified Saved Card. */
  cardNumberLast4: string | null;
};

function normalizeRequiredText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

/**
 * Revalidates the trusted indexed row while holding source/config/import locks.
 * This closes the service-match -> repository-write TOCTOU window.
 */
export async function assertAuthorizedCollectionSourceSnapshot(
  executor: CollectionRepositoryExecutor,
  input: AuthorizedCollectionSourceSnapshotInput,
): Promise<AuthorizedCollectionSourceIdentity> {
  const sourceImportId = normalizeRequiredText(input.sourceImportId);
  const sourceDataRowId = normalizeRequiredText(input.sourceDataRowId);
  const paymentDate = normalizeRequiredText(input.paymentDate)?.slice(0, 10) ?? null;
  const callingDate = normalizeRequiredText(input.callingDate)?.slice(0, 10) ?? null;
  const callingWindowEndExclusive = normalizeRequiredText(input.callingWindowEndExclusive)
    ?.slice(0, 10) ?? null;
  const sourceObligationKey = normalizeRequiredText(input.sourceObligationKey);
  const settlementCycleKey = normalizeRequiredText(input.settlementCycleKey);
  if (
    !sourceImportId
    || !sourceDataRowId
    || !paymentDate
    || !callingDate
    || !callingWindowEndExclusive
    || !sourceObligationKey
    || !settlementCycleKey
    || input.totalDue === null
    || input.billingPrincipalOsp === null
    || !input.agingBucket
    || !input.sourceMatchBasis
  ) {
    throw new Error("Selected Collection source snapshot is incomplete.");
  }

  const accountHash = hashCollectionSourceIdentifier(input.accountNumber, "account_number");
  const cardHash = hashCollectionSourceIdentifier(input.cardNumber, "card_number");
  const requiresAccountMatch = input.sourceMatchBasis === "account_number"
    || input.sourceMatchBasis === "account_and_card";
  const requiresCardMatch = input.sourceMatchBasis === "card_number"
    || input.sourceMatchBasis === "account_and_card";
  if (
    input.requireFullIdentifierMatch
    && ((requiresAccountMatch && !accountHash) || (requiresCardMatch && !cardHash))
  ) {
    throw new Error("Selected Collection source snapshot is incomplete.");
  }
  const identifierConditions = [];
  if (requiresAccountMatch && accountHash) {
    identifierConditions.push(sql`source_row.account_number_hash = ${accountHash}`);
  }
  if (requiresCardMatch && cardHash) {
    identifierConditions.push(sql`source_row.card_number_hash = ${cardHash}`);
  }
  const identifierCondition = identifierConditions.length > 0
    ? sql`AND ${sql.join(identifierConditions, sql` AND `)}`
    : sql``;

  const result = await executor.execute(sql`
    SELECT source_row.source_data_row_id,
      source_row.account_number_hash,
      source_row.card_number_hash,
      source_row.card_number_last4,
      data_row.json_data
    FROM public.collection_source_rows source_row
    JOIN public.collection_source_configs config
      ON config.source_import_id = source_row.source_import_id
    JOIN public.imports imp
      ON imp.id = source_row.source_import_id
    JOIN public.data_rows data_row
      ON data_row.id = source_row.source_data_row_id
      AND data_row.import_id = source_row.source_import_id
    WHERE source_row.source_import_id = ${sourceImportId}
      AND source_row.source_data_row_id = ${sourceDataRowId}
      AND config.enabled = true
      AND config.compatibility_status = 'compatible'
      AND ${paymentDate}::date BETWEEN config.valid_from AND config.valid_to
      AND imp.is_deleted = false
      AND source_row.canonical_obligation_key = ${sourceObligationKey}
      AND (${callingDate}::date::text || ':' || source_row.canonical_obligation_key) = ${settlementCycleKey}
      AND source_row.calling_date = ${callingDate}::date
      AND (source_row.calling_date + INTERVAL '1 month')::date = ${callingWindowEndExclusive}::date
      AND source_row.total_due = ${input.totalDue}::numeric(14,2)
      AND source_row.billing_principal_osp = ${input.billingPrincipalOsp}::numeric(14,2)
      AND source_row.aging_bucket = ${input.agingBucket}
      AND source_row.card_number_last4 IS NOT DISTINCT FROM ${input.cardNumberLast4}
      ${identifierCondition}
    FOR SHARE OF source_row, config, imp, data_row
  `);
  if (!result.rows?.[0]) {
    throw new Error("Selected Collection source is no longer authorized for this payment.");
  }

  const authorizedRow = result.rows[0] as Record<string, unknown>;
  const canonicalRow = extractCanonicalSavedCollectionMasterRow(authorizedRow.json_data);
  const indexedAccountHash = normalizeRequiredText(authorizedRow.account_number_hash);
  const indexedCardHash = normalizeRequiredText(authorizedRow.card_number_hash);
  const indexedCardLast4 = normalizeRequiredText(authorizedRow.card_number_last4);
  const canonicalAccountHash = hashCollectionSourceIdentifier(
    canonicalRow.accountNumber,
    "account_number",
  );
  const canonicalCardHash = hashCollectionSourceIdentifier(
    canonicalRow.cardNumber,
    "card_number",
  );
  const normalizedCanonicalCard = normalizeCollectionSourceIdentifier(canonicalRow.cardNumber);
  const canonicalCardLast4 = canonicalCardHash && /^\d{4}$/.test(normalizedCanonicalCard.slice(-4))
    ? normalizedCanonicalCard.slice(-4)
    : null;
  const canonicalObligationKey = canonicalAccountHash
    ? `account:${canonicalAccountHash}`
    : canonicalCardHash
      ? `card:${canonicalCardHash}`
      : null;

  // The raw Saved row is used only after both identifiers agree with the
  // governed blind indexes. This prevents stale or modified JSON data from
  // being copied into a Collection record after matching.
  if (
    !canonicalObligationKey
    || indexedAccountHash !== canonicalAccountHash
    || indexedCardHash !== canonicalCardHash
    || indexedCardLast4 !== canonicalCardLast4
    || sourceObligationKey !== canonicalObligationKey
  ) {
    throw new Error("Selected Collection source is no longer authorized for this payment.");
  }

  return {
    accountNumber: canonicalRow.accountNumber,
    cardNumberLast4: canonicalCardLast4,
  };
}
