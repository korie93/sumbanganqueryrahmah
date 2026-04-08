import "dotenv/config";
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

type CliOptions = {
  apply: boolean;
  batchSize: number;
  maxRows: number | null;
};

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function parseCliOptions(argv: string[]): CliOptions {
  let apply = false;
  let batchSize = 500;
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
    maxRows,
  };
}

function getRedactionPlan(row: CollectionPiiRow) {
  return {
    customerName: shouldRedactCollectionPiiPlaintextValue({
      field: "customerName",
      plaintext: row.customer_name,
      encrypted: row.customer_name_encrypted,
      hash: row.customer_name_search_hash,
    }),
    icNumber: shouldRedactCollectionPiiPlaintextValue({
      field: "icNumber",
      plaintext: row.ic_number,
      encrypted: row.ic_number_encrypted,
      hash: row.ic_number_search_hash,
    }),
    customerPhone: shouldRedactCollectionPiiPlaintextValue({
      field: "customerPhone",
      plaintext: row.customer_phone,
      encrypted: row.customer_phone_encrypted,
      hash: row.customer_phone_search_hash,
    }),
    accountNumber: shouldRedactCollectionPiiPlaintextValue({
      field: "accountNumber",
      plaintext: row.account_number,
      encrypted: row.account_number_encrypted,
      hash: row.account_number_search_hash,
    }),
  };
}

function countPlannedFields(plan: ReturnType<typeof getRedactionPlan>): number {
  return Number(plan.customerName)
    + Number(plan.icNumber)
    + Number(plan.customerPhone)
    + Number(plan.accountNumber);
}

async function main() {
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
        const redactionPlan = getRedactionPlan(row);
        const plannedFieldCount = countPlannedFields(redactionPlan);
        if (plannedFieldCount === 0) {
          continue;
        }

        candidateRows += 1;
        candidateFields += plannedFieldCount;
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
      `mode=${options.apply ? "apply" : "dry-run"}`,
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
