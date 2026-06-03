import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db-postgres";
import { assertCollectionPiiPostgresReady } from "./collection-pii-postgres";
import {
  buildCollectionRecordPiiSearchHashes,
  decryptCollectionPiiValueResult,
  type CollectionRecordPiiSearchHashes,
  encryptCollectionPiiFieldValue,
  hasCollectionPiiEncryptionConfigured,
  shouldRewriteCollectionPiiSearchHashValue,
  shouldRewriteCollectionPiiSearchHashesValue,
  shouldRewriteCollectionPiiShadowValue,
} from "../server/lib/collection-pii-encryption";
import {
  buildCollectionPiiScriptSelectClause,
  buildCollectionPiiScriptSelectColumns,
  COLLECTION_PII_SCRIPT_FIELDS,
  parseCollectionPiiScriptFields,
  type CollectionPiiScriptField,
} from "./collection-pii-script-columns";

type CollectionPiiRow = {
  id: string;
  customer_name?: string | null | undefined;
  customer_name_encrypted?: string | null | undefined;
  customer_name_search_hash?: string | null | undefined;
  customer_name_search_hashes?: string[] | null | undefined;
  ic_number?: string | null | undefined;
  ic_number_encrypted?: string | null | undefined;
  ic_number_search_hash?: string | null | undefined;
  customer_phone?: string | null | undefined;
  customer_phone_encrypted?: string | null | undefined;
  customer_phone_search_hash?: string | null | undefined;
  account_number?: string | null | undefined;
  account_number_encrypted?: string | null | undefined;
  account_number_search_hash?: string | null | undefined;
};

type CliOptions = {
  apply: boolean;
  batchSize: number;
  fields: ReadonlySet<CollectionPiiScriptField>;
  json: boolean;
  maxRows: number | null;
};

export type CollectionPiiRewritePlan = Record<CollectionPiiScriptField, boolean>;

export type CollectionPiiPreflightSummary = {
  decryptableEncryptedFields: number;
  keyValidation: "passed";
  rollbackSnapshotRows: number | null;
  rollbackSnapshotTable: string | null;
  scannedRows: number;
  unreadableEncryptedFields: number;
};

export type CollectionPiiReencryptionSummary = {
  apply: boolean;
  batchSize: number;
  fields: CollectionPiiScriptField[];
  maxRows: number | null;
  mode: "apply" | "dry-run";
  processedRows: number;
  rewriteCandidateFields: number;
  rewriteCandidates: number;
  rewrittenFields: number;
  rewrittenRows: number;
  preflight: CollectionPiiPreflightSummary;
};

type CollectionPiiDecryptabilitySummary = {
  decryptableEncryptedFields: number;
  scannedRows: number;
  unreadableEncryptedFields: number;
};

const COLLECTION_PII_ENCRYPTED_COLUMN_BY_FIELD = {
  customerName: "customer_name_encrypted",
  icNumber: "ic_number_encrypted",
  customerPhone: "customer_phone_encrypted",
  accountNumber: "account_number_encrypted",
} as const satisfies Record<CollectionPiiScriptField, keyof CollectionPiiRow>;

const COLLECTION_PII_ROLLBACK_TABLE_PREFIX = "collection_records_pii_reencrypt_rollback";
const COLLECTION_PII_ROLLBACK_COLUMN_PATTERN = /_(?:encrypted|search_hash|search_hashes)$/;

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

export function parseCliOptions(argv: string[]): CliOptions {
  let apply = false;
  let batchSize = 500;
  let fields = new Set<CollectionPiiScriptField>(COLLECTION_PII_SCRIPT_FIELDS);
  let json = false;
  let maxRows: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--fields") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--fields requires a value.");
      }
      fields = new Set(parseCollectionPiiScriptFields(nextValue));
      index += 1;
      continue;
    }
    if (arg === "--fields-env") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--fields-env requires an environment variable name.");
      }
      const envValue = String(process.env[nextValue] || "").trim();
      if (!envValue) {
        throw new Error(`--fields-env could not find a non-empty value in ${nextValue}.`);
      }
      fields = new Set(parseCollectionPiiScriptFields(envValue, "--fields-env"));
      index += 1;
      continue;
    }
    if (arg === "--batch-size") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--batch-size requires a value.");
      }
      batchSize = parsePositiveInteger(nextValue, "--batch-size");
      index += 1;
      continue;
    }
    if (arg === "--max-rows") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--max-rows requires a value.");
      }
      maxRows = parsePositiveInteger(nextValue, "--max-rows");
      index += 1;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  return {
    apply,
    batchSize,
    fields,
    json,
    maxRows,
  };
}

function normalizeCollectionPiiSnapshotTimestamp(now: Date): string {
  return now.toISOString().replace(/\D/g, "").slice(0, 17);
}

function quotePgIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error("Unsafe PostgreSQL identifier generated for collection PII rollback snapshot.");
  }

  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

export function buildCollectionPiiRollbackSnapshotName(now = new Date()): string {
  return `${COLLECTION_PII_ROLLBACK_TABLE_PREFIX}_${normalizeCollectionPiiSnapshotTimestamp(now)}`;
}

function buildCollectionPiiRollbackColumns(
  fields: ReadonlySet<CollectionPiiScriptField>,
): string[] {
  return buildCollectionPiiScriptSelectColumns(fields)
    .filter((column) => column === "id" || COLLECTION_PII_ROLLBACK_COLUMN_PATTERN.test(column));
}

export function buildCollectionPiiRollbackSql(
  snapshotTableName: string,
  fields: ReadonlySet<CollectionPiiScriptField> = new Set(COLLECTION_PII_SCRIPT_FIELDS),
): string {
  const snapshotIdentifier = `public.${quotePgIdentifier(snapshotTableName)}`;
  const restoreColumns = buildCollectionPiiRollbackColumns(fields)
    .filter((column) => column !== "id");
  const assignments = restoreColumns
    .map((column) => `${column} = snapshot.${column}`)
    .join(",\n    ");

  return [
    "BEGIN;",
    "UPDATE public.collection_records AS target",
    "SET",
    `    ${assignments}`,
    `FROM ${snapshotIdentifier} AS snapshot`,
    "WHERE target.id = snapshot.id;",
    "COMMIT;",
  ].join("\n");
}

export function validateCollectionPiiActiveKey(): void {
  const probeValue = "collection-pii-key-rotation-precheck";
  const encryptedProbe = encryptCollectionPiiFieldValue(probeValue);
  if (!encryptedProbe) {
    throw new Error("Collection PII active key validation failed: encryption returned no payload.");
  }

  const decryptResult = decryptCollectionPiiValueResult(encryptedProbe, {
    operation: "collectionPiiActiveKeyPrecheck",
    logFailure: false,
  });
  if (!decryptResult.success || decryptResult.data !== probeValue) {
    throw new Error("Collection PII active key validation failed: encrypted probe could not be decrypted.");
  }
}

export function summarizeCollectionPiiDecryptability(
  rows: readonly CollectionPiiRow[],
  fields: ReadonlySet<CollectionPiiScriptField> = new Set(COLLECTION_PII_SCRIPT_FIELDS),
): CollectionPiiDecryptabilitySummary {
  let decryptableEncryptedFields = 0;
  let unreadableEncryptedFields = 0;

  for (const row of rows) {
    for (const field of fields) {
      const encryptedColumn = COLLECTION_PII_ENCRYPTED_COLUMN_BY_FIELD[field];
      const encryptedValue = row[encryptedColumn];
      if (typeof encryptedValue !== "string" || encryptedValue.trim().length === 0) {
        continue;
      }

      const result = decryptCollectionPiiValueResult(encryptedValue, {
        operation: "collectionPiiReencryptionPrecheck",
        logFailure: false,
      });
      if (result.success) {
        decryptableEncryptedFields += 1;
      } else {
        unreadableEncryptedFields += 1;
      }
    }
  }

  return {
    decryptableEncryptedFields,
    scannedRows: rows.length,
    unreadableEncryptedFields,
  };
}

export function getCollectionPiiRewritePlan(
  row: CollectionPiiRow,
  fields = new Set<CollectionPiiScriptField>(COLLECTION_PII_SCRIPT_FIELDS),
): CollectionPiiRewritePlan {
  return {
    customerName: fields.has("customerName") && (
      shouldRewriteCollectionPiiShadowValue({
        plaintext: row.customer_name,
        encrypted: row.customer_name_encrypted ?? null,
      })
      || shouldRewriteCollectionPiiSearchHashValue({
        field: "customerName",
        plaintext: row.customer_name,
        encrypted: row.customer_name_encrypted,
        hash: row.customer_name_search_hash,
      })
      || shouldRewriteCollectionPiiSearchHashesValue({
        plaintext: row.customer_name,
        encrypted: row.customer_name_encrypted,
        hashes: row.customer_name_search_hashes,
      })
    ),
    icNumber: fields.has("icNumber") && (
      shouldRewriteCollectionPiiShadowValue({
        plaintext: row.ic_number,
        encrypted: row.ic_number_encrypted ?? null,
      })
      || shouldRewriteCollectionPiiSearchHashValue({
        field: "icNumber",
        plaintext: row.ic_number,
        encrypted: row.ic_number_encrypted,
        hash: row.ic_number_search_hash,
      })
    ),
    customerPhone: fields.has("customerPhone") && (
      shouldRewriteCollectionPiiShadowValue({
        plaintext: row.customer_phone,
        encrypted: row.customer_phone_encrypted ?? null,
      })
      || shouldRewriteCollectionPiiSearchHashValue({
        field: "customerPhone",
        plaintext: row.customer_phone,
        encrypted: row.customer_phone_encrypted,
        hash: row.customer_phone_search_hash,
      })
    ),
    accountNumber: fields.has("accountNumber") && (
      shouldRewriteCollectionPiiShadowValue({
        plaintext: row.account_number,
        encrypted: row.account_number_encrypted ?? null,
      })
      || shouldRewriteCollectionPiiSearchHashValue({
        field: "accountNumber",
        plaintext: row.account_number,
        encrypted: row.account_number_encrypted,
        hash: row.account_number_search_hash,
      })
    ),
  };
}

function countPlannedFields(plan: CollectionPiiRewritePlan): number {
  return COLLECTION_PII_SCRIPT_FIELDS.reduce(
    (count, field) => count + Number(plan[field]),
    0,
  );
}

function rewriteCollectionPiiShadowValue(params: {
  plaintext: unknown;
  encrypted: string | null;
}): string | null {
  if (!shouldRewriteCollectionPiiShadowValue(params)) {
    return params.encrypted;
  }

  return encryptCollectionPiiFieldValue(params.plaintext);
}

function buildCollectionPiiSearchHashesForPlan(
  row: CollectionPiiRow,
  plan: CollectionPiiRewritePlan,
): CollectionRecordPiiSearchHashes | null {
  return buildCollectionRecordPiiSearchHashes({
    customerName: plan.customerName ? row.customer_name : null,
    icNumber: plan.icNumber ? row.ic_number : null,
    customerPhone: plan.customerPhone ? row.customer_phone : null,
    accountNumber: plan.accountNumber ? row.account_number : null,
  });
}

function buildCollectionPiiReencryptionUpdate(
  row: CollectionPiiRow,
  plan: CollectionPiiRewritePlan,
) {
  const assignments: string[] = [];
  const values: unknown[] = [row.id];
  let parameterIndex = 2;
  const searchHashes = buildCollectionPiiSearchHashesForPlan(row, plan);

  if (plan.customerName) {
    assignments.push(`customer_name_encrypted = $${parameterIndex}`);
    values.push(rewriteCollectionPiiShadowValue({
      plaintext: row.customer_name,
      encrypted: row.customer_name_encrypted ?? null,
    }));
    parameterIndex += 1;

    assignments.push(`customer_name_search_hash = $${parameterIndex}`);
    values.push(searchHashes?.customerNameSearchHash ?? null);
    parameterIndex += 1;

    assignments.push(`customer_name_search_hashes = $${parameterIndex}`);
    values.push(searchHashes?.customerNameSearchHashes ?? null);
    parameterIndex += 1;
  }

  if (plan.icNumber) {
    assignments.push(`ic_number_encrypted = $${parameterIndex}`);
    values.push(rewriteCollectionPiiShadowValue({
      plaintext: row.ic_number,
      encrypted: row.ic_number_encrypted ?? null,
    }));
    parameterIndex += 1;

    assignments.push(`ic_number_search_hash = $${parameterIndex}`);
    values.push(searchHashes?.icNumberSearchHash ?? null);
    parameterIndex += 1;
  }

  if (plan.customerPhone) {
    assignments.push(`customer_phone_encrypted = $${parameterIndex}`);
    values.push(rewriteCollectionPiiShadowValue({
      plaintext: row.customer_phone,
      encrypted: row.customer_phone_encrypted ?? null,
    }));
    parameterIndex += 1;

    assignments.push(`customer_phone_search_hash = $${parameterIndex}`);
    values.push(searchHashes?.customerPhoneSearchHash ?? null);
    parameterIndex += 1;
  }

  if (plan.accountNumber) {
    assignments.push(`account_number_encrypted = $${parameterIndex}`);
    values.push(rewriteCollectionPiiShadowValue({
      plaintext: row.account_number,
      encrypted: row.account_number_encrypted ?? null,
    }));
    parameterIndex += 1;

    assignments.push(`account_number_search_hash = $${parameterIndex}`);
    values.push(searchHashes?.accountNumberSearchHash ?? null);
  }

  return {
    assignments,
    values,
  };
}

function createCollectionPiiReencryptionSummary(params: {
  options: CliOptions;
  preflight: CollectionPiiPreflightSummary;
  processedRows: number;
  rewriteCandidateFields: number;
  rewriteCandidates: number;
  rewrittenFields: number;
  rewrittenRows: number;
}): CollectionPiiReencryptionSummary {
  return {
    apply: params.options.apply,
    batchSize: params.options.batchSize,
    fields: Array.from(params.options.fields),
    maxRows: params.options.maxRows,
    mode: params.options.apply ? "apply" : "dry-run",
    processedRows: params.processedRows,
    rewriteCandidateFields: params.rewriteCandidateFields,
    rewriteCandidates: params.rewriteCandidates,
    rewrittenFields: params.rewrittenFields,
    rewrittenRows: params.rewrittenRows,
    preflight: params.preflight,
  };
}

function renderCollectionPiiReencryptionSummary(summary: CollectionPiiReencryptionSummary): string {
  return [
    `processed=${summary.processedRows}`,
    `rewriteCandidates=${summary.rewriteCandidates}`,
    `rewriteCandidateFields=${summary.rewriteCandidateFields}`,
    `rewritten=${summary.rewrittenRows}`,
    `rewrittenFields=${summary.rewrittenFields}`,
    `preflightScanned=${summary.preflight.scannedRows}`,
    `preflightDecryptable=${summary.preflight.decryptableEncryptedFields}`,
    `preflightUnreadable=${summary.preflight.unreadableEncryptedFields}`,
    `rollbackSnapshot=${summary.preflight.rollbackSnapshotTable ?? "none"}`,
    `mode=${summary.mode}`,
    `fields=${summary.fields.join(",")}`,
  ].join(" ");
}

async function verifyAllCollectionPiiEncryptedFieldsDecryptable(
  options: CliOptions,
): Promise<CollectionPiiDecryptabilitySummary> {
  let decryptableEncryptedFields = 0;
  let scannedRows = 0;
  let unreadableEncryptedFields = 0;
  let lastId: string | null = null;
  const selectClause = buildCollectionPiiScriptSelectClause(options.fields);

  while (true) {
    const result = await pool.query<CollectionPiiRow>(
      `
        SELECT
          ${selectClause}
        FROM public.collection_records
        WHERE ($1::uuid IS NULL OR id > $1::uuid)
        ORDER BY id ASC
        LIMIT $2
      `,
      [lastId, options.batchSize],
    );

    if (result.rows.length === 0) {
      break;
    }

    const batchSummary = summarizeCollectionPiiDecryptability(result.rows, options.fields);
    decryptableEncryptedFields += batchSummary.decryptableEncryptedFields;
    scannedRows += batchSummary.scannedRows;
    unreadableEncryptedFields += batchSummary.unreadableEncryptedFields;
    lastId = result.rows[result.rows.length - 1]?.id ?? lastId;

    console.warn(
      [
        "collection-pii-preflight",
        `scanned=${scannedRows}`,
        `decryptable=${decryptableEncryptedFields}`,
        `unreadable=${unreadableEncryptedFields}`,
      ].join(" "),
    );

    if (result.rows.length < options.batchSize) {
      break;
    }
  }

  if (unreadableEncryptedFields > 0) {
    throw new Error(
      `Collection PII re-encryption precheck failed: ${unreadableEncryptedFields} encrypted field(s) are not decryptable with the configured current/previous keys.`,
    );
  }

  return {
    decryptableEncryptedFields,
    scannedRows,
    unreadableEncryptedFields,
  };
}

async function createCollectionPiiRollbackSnapshot(
  fields: ReadonlySet<CollectionPiiScriptField>,
): Promise<{ rowCount: number; tableName: string }> {
  const snapshotTableName = buildCollectionPiiRollbackSnapshotName();
  const snapshotIdentifier = `public.${quotePgIdentifier(snapshotTableName)}`;
  const selectColumns = buildCollectionPiiRollbackColumns(fields).join(",\n    ");

  await pool.query(
    `
      CREATE TABLE ${snapshotIdentifier} AS
      SELECT
        ${selectColumns}
      FROM public.collection_records
    `,
  );

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${snapshotIdentifier}`,
  );
  const rowCount = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
    throw new Error("Collection PII rollback snapshot row count could not be verified.");
  }

  console.warn(`collection-pii-rollback-snapshot table=public.${snapshotTableName} rows=${rowCount}`);
  console.warn(`collection-pii-rollback-sql\n${buildCollectionPiiRollbackSql(snapshotTableName, fields)}`);

  return {
    rowCount,
    tableName: `public.${snapshotTableName}`,
  };
}

async function runCollectionPiiReencryptionPreflight(
  options: CliOptions,
): Promise<CollectionPiiPreflightSummary> {
  validateCollectionPiiActiveKey();
  const decryptability = await verifyAllCollectionPiiEncryptedFieldsDecryptable(options);
  const snapshot = options.apply
    ? await createCollectionPiiRollbackSnapshot(options.fields)
    : null;

  return {
    decryptableEncryptedFields: decryptability.decryptableEncryptedFields,
    keyValidation: "passed",
    rollbackSnapshotRows: snapshot?.rowCount ?? null,
    rollbackSnapshotTable: snapshot?.tableName ?? null,
    scannedRows: decryptability.scannedRows,
    unreadableEncryptedFields: decryptability.unreadableEncryptedFields,
  };
}

export async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  if (!hasCollectionPiiEncryptionConfigured()) {
    throw new Error(
      "COLLECTION_PII_ENCRYPTION_KEY is required before running collection PII re-encryption.",
    );
  }

  await assertCollectionPiiPostgresReady("Collection PII re-encryption");

  let processedRows = 0;
  let rewriteCandidateFields = 0;
  let rewriteCandidates = 0;
  let rewrittenFields = 0;
  let rewrittenRows = 0;
  let lastId: string | null = null;
  const selectClause = buildCollectionPiiScriptSelectClause(options.fields);

  try {
    const preflight = await runCollectionPiiReencryptionPreflight(options);

    while (true) {
      const remainingLimit = options.maxRows === null
        ? options.batchSize
        : Math.min(options.batchSize, Math.max(0, options.maxRows - processedRows));
      if (remainingLimit <= 0) {
        break;
      }

      const result = await pool.query<CollectionPiiRow>(
        `
          SELECT
            ${selectClause}
          FROM public.collection_records
          WHERE ($1::uuid IS NULL OR id > $1::uuid)
          ORDER BY id ASC
          LIMIT $2
        `,
        [lastId, remainingLimit],
      );

      if (result.rows.length === 0) {
        break;
      }

      for (const row of result.rows) {
        processedRows += 1;
        lastId = row.id;

        const plan = getCollectionPiiRewritePlan(row, options.fields);
        const plannedFieldCount = countPlannedFields(plan);
        if (plannedFieldCount === 0) {
          continue;
        }

        rewriteCandidates += 1;
        rewriteCandidateFields += plannedFieldCount;
        if (!options.apply) {
          continue;
        }

        const update = buildCollectionPiiReencryptionUpdate(row, plan);
        if (update.assignments.length === 0) {
          continue;
        }

        await pool.query(
          `
            UPDATE public.collection_records
            SET
              ${update.assignments.join(",\n              ")}
            WHERE id = $1::uuid
          `,
          update.values,
        );
        rewrittenRows += 1;
        rewrittenFields += plannedFieldCount;

        if (rewrittenRows % options.batchSize === 0) {
          console.warn(
            [
              "collection-pii-reencrypt-progress",
              `processed=${processedRows}`,
              `rewritten=${rewrittenRows}`,
              `rewriteCandidates=${rewriteCandidates}`,
            ].join(" "),
          );
        }
      }

      if (result.rows.length < remainingLimit) {
        break;
      }
    }

    const summary = createCollectionPiiReencryptionSummary({
      options,
      preflight,
      processedRows,
      rewriteCandidateFields,
      rewriteCandidates,
      rewrittenFields,
      rewrittenRows,
    });

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const renderedSummary = renderCollectionPiiReencryptionSummary(summary);
    if (!options.apply && rewriteCandidates > 0) {
      console.log(`${renderedSummary}\nRe-run the same command with '--apply' to rewrite the selected shadow columns.`);
      return;
    }

    console.log(renderedSummary);
  } finally {
    await pool.end().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`PostgreSQL pool cleanup failed during collection PII reencryption: ${message}`);
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
