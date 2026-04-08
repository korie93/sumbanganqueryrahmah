import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db-postgres";
import {
  hasCollectionPiiEncryptionConfigured,
  shouldRedactCollectionPiiPlaintextValue,
} from "../server/lib/collection-pii-encryption";

type CollectionPiiRow = {
  id: string;
  customer_name: string | null;
  customer_name_encrypted: string | null;
  customer_name_search_hash: string | null;
  customer_name_search_hashes: string[] | null;
  ic_number: string | null;
  ic_number_encrypted: string | null;
  ic_number_search_hash: string | null;
  customer_phone: string | null;
  customer_phone_encrypted: string | null;
  customer_phone_search_hash: string | null;
  account_number: string | null;
  account_number_encrypted: string | null;
  account_number_search_hash: string | null;
};

const REDACTABLE_COLLECTION_PII_FIELDS = [
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
] as const;

type RedactableCollectionPiiField = (typeof REDACTABLE_COLLECTION_PII_FIELDS)[number];

type CliOptions = {
  apply: boolean;
  batchSize: number;
  fields: ReadonlySet<RedactableCollectionPiiField>;
  maxRows: number | null;
};

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

export function parseRedactableCollectionPiiFields(rawValue: string): ReadonlySet<RedactableCollectionPiiField> {
  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error("--fields requires at least one known collection PII field.");
  }

  const nextFields = new Set<RedactableCollectionPiiField>();
  for (const value of values) {
    if (!REDACTABLE_COLLECTION_PII_FIELDS.includes(value as RedactableCollectionPiiField)) {
      throw new Error(
        `Unknown collection PII field '${value}'. Expected one of: ${REDACTABLE_COLLECTION_PII_FIELDS.join(", ")}`,
      );
    }
    nextFields.add(value as RedactableCollectionPiiField);
  }

  return nextFields;
}

export function parseCliOptions(argv: string[]): CliOptions {
  let apply = false;
  let batchSize = 500;
  let fields = new Set<RedactableCollectionPiiField>(REDACTABLE_COLLECTION_PII_FIELDS);
  let maxRows: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
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
    if (arg === "--fields") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--fields requires a value.");
      }
      fields = new Set(parseRedactableCollectionPiiFields(nextValue));
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
    maxRows,
  };
}

export type CollectionPiiRedactionPlan = Record<RedactableCollectionPiiField, boolean>;

export function getRedactionPlan(
  row: CollectionPiiRow,
  fields: ReadonlySet<RedactableCollectionPiiField>,
): CollectionPiiRedactionPlan {
  return {
    customerName: fields.has("customerName")
      && shouldRedactCollectionPiiPlaintextValue({
        field: "customerName",
        plaintext: row.customer_name,
        encrypted: row.customer_name_encrypted,
        hash: row.customer_name_search_hash,
        hashes: row.customer_name_search_hashes,
      }),
    icNumber: fields.has("icNumber")
      && shouldRedactCollectionPiiPlaintextValue({
        field: "icNumber",
        plaintext: row.ic_number,
        encrypted: row.ic_number_encrypted,
        hash: row.ic_number_search_hash,
      }),
    customerPhone: fields.has("customerPhone")
      && shouldRedactCollectionPiiPlaintextValue({
        field: "customerPhone",
        plaintext: row.customer_phone,
        encrypted: row.customer_phone_encrypted,
        hash: row.customer_phone_search_hash,
      }),
    accountNumber: fields.has("accountNumber")
      && shouldRedactCollectionPiiPlaintextValue({
        field: "accountNumber",
        plaintext: row.account_number,
        encrypted: row.account_number_encrypted,
        hash: row.account_number_search_hash,
      }),
  };
}

function countPlannedFields(plan: CollectionPiiRedactionPlan): number {
  return REDACTABLE_COLLECTION_PII_FIELDS.reduce(
    (count, field) => count + Number(plan[field]),
    0,
  );
}

function formatFieldSummary(prefix: string, counts: Record<RedactableCollectionPiiField, number>): string {
  return REDACTABLE_COLLECTION_PII_FIELDS
    .map((field) => `${prefix}${field}=${counts[field]}`)
    .join(" ");
}

export async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  if (!hasCollectionPiiEncryptionConfigured()) {
    throw new Error(
      "COLLECTION_PII_ENCRYPTION_KEY is required before redacting collection plaintext PII.",
    );
  }

  let processedRows = 0;
  let candidateRows = 0;
  let candidateFields = 0;
  let redactedRows = 0;
  let redactedFields = 0;
  let lastId: string | null = null;
  const candidateFieldCounts: Record<RedactableCollectionPiiField, number> = {
    customerName: 0,
    icNumber: 0,
    customerPhone: 0,
    accountNumber: 0,
  };
  const redactedFieldCounts: Record<RedactableCollectionPiiField, number> = {
    customerName: 0,
    icNumber: 0,
    customerPhone: 0,
    accountNumber: 0,
  };

  try {
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
            id,
            customer_name,
            customer_name_encrypted,
            customer_name_search_hash,
            customer_name_search_hashes,
            ic_number,
            ic_number_encrypted,
            ic_number_search_hash,
            customer_phone,
            customer_phone_encrypted,
            customer_phone_search_hash,
            account_number,
            account_number_encrypted,
            account_number_search_hash
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
        const redactionPlan = getRedactionPlan(row, options.fields);
        const plannedFieldCount = countPlannedFields(redactionPlan);
        if (plannedFieldCount === 0) {
          continue;
        }

        candidateRows += 1;
        candidateFields += plannedFieldCount;
        for (const field of REDACTABLE_COLLECTION_PII_FIELDS) {
          if (redactionPlan[field]) {
            candidateFieldCounts[field] += 1;
          }
        }
        if (!options.apply) {
          continue;
        }

        await pool.query(
          `
            UPDATE public.collection_records
            SET
              customer_name = CASE WHEN $2::boolean THEN '' ELSE customer_name END,
              ic_number = CASE WHEN $3::boolean THEN '' ELSE ic_number END,
              customer_phone = CASE WHEN $4::boolean THEN '' ELSE customer_phone END,
              account_number = CASE WHEN $5::boolean THEN '' ELSE account_number END
            WHERE id = $1::uuid
          `,
          [
            row.id,
            redactionPlan.customerName,
            redactionPlan.icNumber,
            redactionPlan.customerPhone,
            redactionPlan.accountNumber,
          ],
        );
        redactedRows += 1;
        redactedFields += plannedFieldCount;
        for (const field of REDACTABLE_COLLECTION_PII_FIELDS) {
          if (redactionPlan[field]) {
            redactedFieldCounts[field] += 1;
          }
        }
      }

      if (result.rows.length < remainingLimit) {
        break;
      }
    }

    const summary = [
      `processed=${processedRows}`,
      `candidateRows=${candidateRows}`,
      `candidateFields=${candidateFields}`,
      `redactedRows=${redactedRows}`,
      `redactedFields=${redactedFields}`,
      `fields=${Array.from(options.fields).join(",")}`,
      `mode=${options.apply ? "apply" : "dry-run"}`,
      formatFieldSummary("candidate", candidateFieldCounts),
      formatFieldSummary("redacted", redactedFieldCounts),
    ].join(" ");

    if (!options.apply && candidateRows > 0) {
      console.log(`${summary}\nRun 'npm run collection:redact-plaintext-pii -- --apply' to clear plaintext columns for rows already protected by current encrypted shadows and search hashes.`);
      return;
    }

    console.log(summary);
  } finally {
    await pool.end().catch(() => {});
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
