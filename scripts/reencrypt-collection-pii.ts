import "dotenv/config";
import { pool } from "../server/db-postgres";
import { assertCollectionPiiPostgresReady } from "./collection-pii-postgres";
import {
  buildCollectionRecordPiiSearchHashes,
  encryptCollectionPiiFieldValue,
  hasCollectionPiiEncryptionConfigured,
  shouldRewriteCollectionPiiSearchHashValue,
  shouldRewriteCollectionPiiSearchHashesValue,
  shouldRewriteCollectionPiiShadowValue,
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

function rowNeedsRewrite(row: CollectionPiiRow): boolean {
  return (
    shouldRewriteCollectionPiiShadowValue({
      plaintext: row.customer_name,
      encrypted: row.customer_name_encrypted,
    })
    || shouldRewriteCollectionPiiShadowValue({
      plaintext: row.ic_number,
      encrypted: row.ic_number_encrypted,
    })
    || shouldRewriteCollectionPiiShadowValue({
      plaintext: row.customer_phone,
      encrypted: row.customer_phone_encrypted,
    })
    || shouldRewriteCollectionPiiShadowValue({
      plaintext: row.account_number,
      encrypted: row.account_number_encrypted,
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
    || shouldRewriteCollectionPiiSearchHashValue({
      field: "icNumber",
      plaintext: row.ic_number,
      encrypted: row.ic_number_encrypted,
      hash: row.ic_number_search_hash,
    })
    || shouldRewriteCollectionPiiSearchHashValue({
      field: "customerPhone",
      plaintext: row.customer_phone,
      encrypted: row.customer_phone_encrypted,
      hash: row.customer_phone_search_hash,
    })
    || shouldRewriteCollectionPiiSearchHashValue({
      field: "accountNumber",
      plaintext: row.account_number,
      encrypted: row.account_number_encrypted,
      hash: row.account_number_search_hash,
    })
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

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  if (!hasCollectionPiiEncryptionConfigured()) {
    throw new Error(
      "COLLECTION_PII_ENCRYPTION_KEY is required before running collection PII re-encryption.",
    );
  }

  await assertCollectionPiiPostgresReady("Collection PII re-encryption");

  let processedRows = 0;
  let rewriteCandidates = 0;
  let rewrittenRows = 0;
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

        if (!rowNeedsRewrite(row)) {
          continue;
        }

        rewriteCandidates += 1;
        if (!options.apply) {
          continue;
        }

        const customerNameEncrypted = rewriteCollectionPiiShadowValue({
          plaintext: row.customer_name,
          encrypted: row.customer_name_encrypted,
        });
        const icNumberEncrypted = rewriteCollectionPiiShadowValue({
          plaintext: row.ic_number,
          encrypted: row.ic_number_encrypted,
        });
        const customerPhoneEncrypted = rewriteCollectionPiiShadowValue({
          plaintext: row.customer_phone,
          encrypted: row.customer_phone_encrypted,
        });
        const accountNumberEncrypted = rewriteCollectionPiiShadowValue({
          plaintext: row.account_number,
          encrypted: row.account_number_encrypted,
        });
        const searchHashes = buildCollectionRecordPiiSearchHashes({
          customerName: row.customer_name,
          icNumber: row.ic_number,
          customerPhone: row.customer_phone,
          accountNumber: row.account_number,
        });
        if (
          customerNameEncrypted === null
          && icNumberEncrypted === null
          && customerPhoneEncrypted === null
          && accountNumberEncrypted === null
        ) {
          throw new Error("Collection PII encryption unexpectedly became unavailable during rewrite.");
        }

        await pool.query(
          `
            UPDATE public.collection_records
            SET
              customer_name_encrypted = $2,
              ic_number_encrypted = $3,
              customer_phone_encrypted = $4,
              account_number_encrypted = $5,
              customer_name_search_hash = $6,
              customer_name_search_hashes = $7,
              ic_number_search_hash = $8,
              customer_phone_search_hash = $9,
              account_number_search_hash = $10
            WHERE id = $1::uuid
          `,
          [
            row.id,
            customerNameEncrypted,
            icNumberEncrypted,
            customerPhoneEncrypted,
            accountNumberEncrypted,
            searchHashes?.customerNameSearchHash ?? null,
            searchHashes?.customerNameSearchHashes ?? null,
            searchHashes?.icNumberSearchHash ?? null,
            searchHashes?.customerPhoneSearchHash ?? null,
            searchHashes?.accountNumberSearchHash ?? null,
          ],
        );
        rewrittenRows += 1;
      }

      if (result.rows.length < remainingLimit) {
        break;
      }
    }

    const summary = [
      `processed=${processedRows}`,
      `rewriteCandidates=${rewriteCandidates}`,
      `rewritten=${rewrittenRows}`,
      `mode=${options.apply ? "apply" : "dry-run"}`,
    ].join(" ");

    if (!options.apply && rewriteCandidates > 0) {
      console.log(`${summary}\nRun 'npm run collection:reencrypt-pii -- --apply' to rewrite the shadow columns.`);
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
