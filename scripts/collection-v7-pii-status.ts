import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db-postgres";
import { assertCollectionPiiPostgresReady } from "./collection-pii-postgres";
import {
  decryptCollectionPiiValueResult,
  hasCollectionPiiEncryptionConfigured,
  shouldRewriteCollectionPiiSearchHashesValue,
  shouldRewriteCollectionPiiSearchHashValue,
  shouldRewriteCollectionPiiShadowValue,
} from "../server/lib/collection-pii-encryption";

const V7_PII_FIELDS = ["accountNumber", "customerName", "cardNumber", "identificationNumber", "phone"] as const;
const V7_PII_DATASETS = ["targetSourceRows", "manualReconciliations"] as const;

type V7PiiField = (typeof V7_PII_FIELDS)[number];
type V7PiiDataset = (typeof V7_PII_DATASETS)[number];

type V7PiiRow = {
  card_number_encrypted?: string | null;
  identification_number_encrypted?: string | null;
  phone_encrypted?: string | null;
  account_number_encrypted: string | null;
  account_number_search_hash?: string | null;
  customer_name_encrypted: string | null;
  customer_name_search_hashes?: string[] | null;
};

type V7PiiFieldCounts = Record<V7PiiField, number>;
type V7PiiDatasetCounts = Record<V7PiiDataset, number>;

export type CollectionV7PiiStatusSummary = {
  decryptableEncryptedFields: number;
  encryptedFieldCounts: V7PiiFieldCounts;
  encryptedFields: number;
  encryptionConfigured: boolean;
  processedRowCounts: V7PiiDatasetCounts;
  processedRows: number;
  rewriteEncryptedFieldCounts: V7PiiFieldCounts;
  rewriteEncryptedFields: number;
  rewriteRowCounts: V7PiiDatasetCounts;
  rewriteRows: number;
  unreadableEncryptedFieldCounts: V7PiiFieldCounts;
  unreadableEncryptedFields: number;
  unreadableRowCounts: V7PiiDatasetCounts;
  unreadableRows: number;
};

type CliOptions = {
  batchSize: number;
  json: boolean;
  maxRows: number | null;
  requireZeroRewrite: boolean;
  requireZeroUnreadable: boolean;
};

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

export function parseCliOptions(argv: string[]): CliOptions {
  let batchSize = 500;
  let json = false;
  let maxRows: number | null = null;
  let requireZeroRewrite = false;
  let requireZeroUnreadable = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--require-zero-unreadable") {
      requireZeroUnreadable = true;
      continue;
    }
    if (arg === "--require-zero-rewrite") {
      requireZeroRewrite = true;
      continue;
    }
    if (arg === "--batch-size" || arg === "--max-rows") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      const parsed = parsePositiveInteger(value, arg);
      if (arg === "--batch-size") {
        batchSize = parsed;
      } else {
        maxRows = parsed;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  return { batchSize, json, maxRows, requireZeroRewrite, requireZeroUnreadable };
}

function createFieldCounts(): V7PiiFieldCounts {
  return { accountNumber: 0, customerName: 0, cardNumber: 0, identificationNumber: 0, phone: 0 };
}

function createDatasetCounts(): V7PiiDatasetCounts {
  return { targetSourceRows: 0, manualReconciliations: 0 };
}

function hasEncryptedValue(value: unknown): value is string {
  // A non-null value is an attempted encrypted snapshot. Treat even empty or
  // whitespace-only values as unreadable so a malformed persisted value cannot
  // make the retirement gate pass by being silently ignored.
  return typeof value === "string";
}

export function inspectCollectionV7PiiRow(
  row: V7PiiRow,
): {
  decryptableFields: V7PiiField[];
  rewriteFields: V7PiiField[];
  unreadableFields: V7PiiField[];
} {
  const decryptableFields: V7PiiField[] = [];
  const rewriteFields: V7PiiField[] = [];
  const unreadableFields: V7PiiField[] = [];
  const values: Record<V7PiiField, string | null> = {
    accountNumber: row.account_number_encrypted,
    customerName: row.customer_name_encrypted,
    cardNumber: row.card_number_encrypted ?? null,
    identificationNumber: row.identification_number_encrypted ?? null,
    phone: row.phone_encrypted ?? null,
  };

  for (const field of V7_PII_FIELDS) {
    const value = values[field];
    if (!hasEncryptedValue(value)) continue;
    const result = decryptCollectionPiiValueResult(value, {
      operation: "collectionV7PiiStatus",
      logFailure: false,
    });
    if (result.success) {
      decryptableFields.push(field);
      const shadowNeedsRewrite = shouldRewriteCollectionPiiShadowValue({
        plaintext: null,
        encrypted: value,
      });
      const searchNeedsRewrite = field === "accountNumber"
        ? shouldRewriteCollectionPiiSearchHashValue({
          field,
          plaintext: null,
          encrypted: value,
          hash: row.account_number_search_hash,
        })
        : field === "customerName" && row.customer_name_search_hashes !== undefined
          && shouldRewriteCollectionPiiSearchHashesValue({
            plaintext: null,
            encrypted: value,
            hashes: row.customer_name_search_hashes,
          });
      if (shadowNeedsRewrite || searchNeedsRewrite) rewriteFields.push(field);
    } else {
      unreadableFields.push(field);
    }
  }

  return { decryptableFields, rewriteFields, unreadableFields };
}

function addRowsToSummary(
  summary: CollectionV7PiiStatusSummary,
  dataset: V7PiiDataset,
  rows: readonly V7PiiRow[],
) {
  for (const row of rows) {
    summary.processedRows += 1;
    summary.processedRowCounts[dataset] += 1;
    const inspection = inspectCollectionV7PiiRow(row);
    const encryptedFields = [...inspection.decryptableFields, ...inspection.unreadableFields];
    for (const field of encryptedFields) {
      summary.encryptedFields += 1;
      summary.encryptedFieldCounts[field] += 1;
    }
    summary.decryptableEncryptedFields += inspection.decryptableFields.length;
    summary.rewriteEncryptedFields += inspection.rewriteFields.length;
    for (const field of inspection.rewriteFields) {
      summary.rewriteEncryptedFieldCounts[field] += 1;
    }
    if (inspection.rewriteFields.length > 0) {
      summary.rewriteRows += 1;
      summary.rewriteRowCounts[dataset] += 1;
    }
    summary.unreadableEncryptedFields += inspection.unreadableFields.length;
    for (const field of inspection.unreadableFields) {
      summary.unreadableEncryptedFieldCounts[field] += 1;
    }
    if (inspection.unreadableFields.length > 0) {
      summary.unreadableRows += 1;
      summary.unreadableRowCounts[dataset] += 1;
    }
  }
}

function createSummary(encryptionConfigured: boolean): CollectionV7PiiStatusSummary {
  return {
    decryptableEncryptedFields: 0,
    encryptedFieldCounts: createFieldCounts(),
    encryptedFields: 0,
    encryptionConfigured,
    processedRowCounts: createDatasetCounts(),
    processedRows: 0,
    rewriteEncryptedFieldCounts: createFieldCounts(),
    rewriteEncryptedFields: 0,
    rewriteRowCounts: createDatasetCounts(),
    rewriteRows: 0,
    unreadableEncryptedFieldCounts: createFieldCounts(),
    unreadableEncryptedFields: 0,
    unreadableRowCounts: createDatasetCounts(),
    unreadableRows: 0,
  };
}

export async function collectCollectionV7PiiStatusSummary(params: {
  batchSize?: number;
  encryptionConfigured?: boolean;
  maxRows?: number | null;
} = {}): Promise<CollectionV7PiiStatusSummary> {
  const batchSize = params.batchSize ?? 500;
  const maxRows = params.maxRows ?? null;
  const summary = createSummary(
    params.encryptionConfigured ?? hasCollectionPiiEncryptionConfigured(),
  );
  let targetSourceCursor: {
    sourceDataRowId: string;
    sourceImportId: string;
    targetRevisionId: string;
  } | null = null;
  let reconciliationCursor: string | null = null;

  while (maxRows === null || summary.processedRows < maxRows) {
    const limit = maxRows === null
      ? batchSize
      : Math.min(batchSize, maxRows - summary.processedRows);
    const result = await pool.query<V7PiiRow & {
      source_data_row_id: string;
      source_import_id: string;
      target_revision_id: string;
    }>(
      `
        SELECT target_revision_id, source_import_id, source_data_row_id,
          account_number_encrypted, account_number_search_hash,
          customer_name_encrypted, customer_name_search_hashes,
          card_number_encrypted, identification_number_encrypted, phone_encrypted
        FROM public.collection_osp_target_source_rows
        WHERE (
          $1::uuid IS NULL
          OR (target_revision_id, source_import_id, source_data_row_id)
            > ($1::uuid, $2::text, $3::text)
        )
        ORDER BY target_revision_id ASC, source_import_id ASC, source_data_row_id ASC
        LIMIT $4
      `,
      [
        targetSourceCursor?.targetRevisionId ?? null,
        targetSourceCursor?.sourceImportId ?? null,
        targetSourceCursor?.sourceDataRowId ?? null,
        limit,
      ],
    );
    addRowsToSummary(summary, "targetSourceRows", result.rows);
    const lastRow = result.rows.at(-1);
    if (lastRow) {
      targetSourceCursor = {
        sourceDataRowId: lastRow.source_data_row_id,
        sourceImportId: lastRow.source_import_id,
        targetRevisionId: lastRow.target_revision_id,
      };
    }
    if (result.rows.length < limit) break;
  }

  while (maxRows === null || summary.processedRows < maxRows) {
    const limit = maxRows === null
      ? batchSize
      : Math.min(batchSize, maxRows - summary.processedRows);
    const result = await pool.query<V7PiiRow & { id: string }>(
      `
        SELECT reconciliation.id, reconciliation.account_number_encrypted,
          reconciliation.account_number_search_hash,
          reconciliation.customer_name_encrypted,
          source_row.customer_name_search_hashes
        FROM public.collection_osp_manual_reconciliations reconciliation
        JOIN public.collection_osp_target_source_rows source_row
          ON source_row.target_revision_id = reconciliation.target_revision_id
         AND source_row.source_import_id = reconciliation.source_import_id
         AND source_row.source_data_row_id = reconciliation.source_data_row_id
        WHERE ($1::uuid IS NULL OR reconciliation.id > $1::uuid)
        ORDER BY reconciliation.id ASC
        LIMIT $2
      `,
      [reconciliationCursor, limit],
    );
    addRowsToSummary(summary, "manualReconciliations", result.rows);
    reconciliationCursor = result.rows.at(-1)?.id ?? reconciliationCursor;
    if (result.rows.length < limit) break;
  }

  return summary;
}

function formatSummary(summary: CollectionV7PiiStatusSummary): string {
  return [
    `processedRows=${summary.processedRows}`,
    `targetSourceRows=${summary.processedRowCounts.targetSourceRows}`,
    `manualReconciliations=${summary.processedRowCounts.manualReconciliations}`,
    `encryptedFields=${summary.encryptedFields}`,
    `decryptableEncryptedFields=${summary.decryptableEncryptedFields}`,
    `unreadableEncryptedFields=${summary.unreadableEncryptedFields}`,
    `unreadableRows=${summary.unreadableRows}`,
    `rewriteEncryptedFields=${summary.rewriteEncryptedFields}`,
    `rewriteRows=${summary.rewriteRows}`,
    `encryptionConfigured=${summary.encryptionConfigured}`,
    `encryptedAccountNumber=${summary.encryptedFieldCounts.accountNumber}`,
    `encryptedCustomerName=${summary.encryptedFieldCounts.customerName}`,
    `unreadableAccountNumber=${summary.unreadableEncryptedFieldCounts.accountNumber}`,
    `unreadableCustomerName=${summary.unreadableEncryptedFieldCounts.customerName}`,
    `encryptedCardNumber=${summary.encryptedFieldCounts.cardNumber}`,
    `encryptedIdentificationNumber=${summary.encryptedFieldCounts.identificationNumber}`,
    `encryptedPhone=${summary.encryptedFieldCounts.phone}`,
    `unreadableCardNumber=${summary.unreadableEncryptedFieldCounts.cardNumber}`,
    `unreadableIdentificationNumber=${summary.unreadableEncryptedFieldCounts.identificationNumber}`,
    `unreadablePhone=${summary.unreadableEncryptedFieldCounts.phone}`,
  ].join(" ");
}

export function assertV7PiiRetirementScanComplete(
  options: Pick<CliOptions, "maxRows" | "requireZeroUnreadable"> & {
    requireZeroRewrite?: boolean;
  },
) {
  if ((options.requireZeroUnreadable || options.requireZeroRewrite) && options.maxRows !== null) {
    throw new Error(
      "PII retirement requirements cannot be combined with --max-rows; key retirement must inspect every V7 PII snapshot.",
    );
  }
}

export async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  assertV7PiiRetirementScanComplete(options);
  await assertCollectionPiiPostgresReady("Collection V7 PII status");

  try {
    const summary = await collectCollectionV7PiiStatusSummary({
      batchSize: options.batchSize,
      maxRows: options.maxRows,
    });
    const ok = (!options.requireZeroUnreadable || summary.unreadableEncryptedFields === 0)
      && (!options.requireZeroRewrite || summary.rewriteEncryptedFields === 0);
    if (options.json) {
      console.log(JSON.stringify({
        ...summary,
        ok,
        requireZeroRewrite: options.requireZeroRewrite,
        requireZeroUnreadable: options.requireZeroUnreadable,
      }, null, 2));
    } else {
      console.log(formatSummary(summary));
    }
    if (!ok) {
      throw new Error(
        "Collection V7 PII has unreadable or non-current encrypted snapshots/search indexes. Keep required historical keys configured and migrate through the governed backup/restore path before retiring them; immutable V7 snapshots are not rewritten in place.",
      );
    }
  } finally {
    await pool.end().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`PostgreSQL pool cleanup failed during Collection V7 PII status check: ${message}`);
    });
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
