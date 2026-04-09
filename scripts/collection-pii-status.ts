import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db-postgres";
import { assertCollectionPiiPostgresReady } from "./collection-pii-postgres";
import {
  hasCollectionPiiEncryptionConfigured,
  shouldRedactCollectionPiiPlaintextValue,
  shouldRewriteCollectionPiiSearchHashesValue,
  shouldRewriteCollectionPiiSearchHashValue,
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

const TRACKED_COLLECTION_PII_FIELDS = [
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
] as const;

type TrackedCollectionPiiField = (typeof TRACKED_COLLECTION_PII_FIELDS)[number];

type CliOptions = {
  batchSize: number;
  fields: ReadonlySet<TrackedCollectionPiiField>;
  json: boolean;
  maxRows: number | null;
  requireZeroPlaintext: boolean;
  requireZeroRedactable: boolean;
  requireZeroRewrite: boolean;
};

type CollectionPiiBooleanMap = Record<TrackedCollectionPiiField, boolean>;

export type CollectionPiiStatusPlan = {
  plaintext: CollectionPiiBooleanMap;
  redactable: CollectionPiiBooleanMap;
  rewrite: CollectionPiiBooleanMap;
};

type CollectionPiiStatusRequirements = {
  requireZeroPlaintext: boolean;
  requireZeroRedactable: boolean;
  requireZeroRewrite: boolean;
};

export type CollectionPiiStatusEvaluation = {
  failures: string[];
  ok: boolean;
  requirements: CollectionPiiStatusRequirements;
};

type CollectionPiiFieldCounts = Record<TrackedCollectionPiiField, number>;

type CollectionPiiStatusSummary = {
  encryptionConfigured: boolean;
  plaintextFieldCounts: CollectionPiiFieldCounts;
  plaintextFields: number;
  processedRows: number;
  redactableFieldCounts: CollectionPiiFieldCounts;
  redactableFields: number;
  rewriteFieldCounts: CollectionPiiFieldCounts;
  rewriteFields: number;
  rowsEligibleForRedaction: number;
  rowsNeedingRewrite: number;
  rowsWithPlaintext: number;
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
  let fields = new Set<TrackedCollectionPiiField>(TRACKED_COLLECTION_PII_FIELDS);
  let json = false;
  let maxRows: number | null = null;
  let requireZeroPlaintext = false;
  let requireZeroRedactable = false;
  let requireZeroRewrite = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--fields") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--fields requires a value.");
      }
      fields = new Set(parseTrackedCollectionPiiFields(nextValue));
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
      fields = new Set(parseTrackedCollectionPiiFields(envValue));
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
    if (arg === "--require-zero-plaintext") {
      requireZeroPlaintext = true;
      continue;
    }
    if (arg === "--require-zero-redactable") {
      requireZeroRedactable = true;
      continue;
    }
    if (arg === "--require-zero-rewrite") {
      requireZeroRewrite = true;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  return {
    batchSize,
    fields,
    json,
    maxRows,
    requireZeroPlaintext,
    requireZeroRedactable,
    requireZeroRewrite,
  };
}

export function parseTrackedCollectionPiiFields(rawValue: string): ReadonlySet<TrackedCollectionPiiField> {
  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error("--fields requires at least one known collection PII field.");
  }

  const nextFields = new Set<TrackedCollectionPiiField>();
  for (const value of values) {
    if (!TRACKED_COLLECTION_PII_FIELDS.includes(value as TrackedCollectionPiiField)) {
      throw new Error(
        `Unknown collection PII field '${value}'. Expected one of: ${TRACKED_COLLECTION_PII_FIELDS.join(", ")}`,
      );
    }
    nextFields.add(value as TrackedCollectionPiiField);
  }

  return nextFields;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  return String(value).trim().length > 0;
}

function createEmptyFieldCounts(): CollectionPiiFieldCounts {
  return {
    customerName: 0,
    icNumber: 0,
    customerPhone: 0,
    accountNumber: 0,
  };
}

function countEnabledFields(map: CollectionPiiBooleanMap): number {
  return TRACKED_COLLECTION_PII_FIELDS.reduce(
    (count, field) => count + Number(map[field]),
    0,
  );
}

function incrementFieldCounts(
  target: CollectionPiiFieldCounts,
  source: CollectionPiiBooleanMap,
) {
  for (const field of TRACKED_COLLECTION_PII_FIELDS) {
    if (source[field]) {
      target[field] += 1;
    }
  }
}

function formatFieldSummary(
  prefix: string,
  counts: CollectionPiiFieldCounts,
): string {
  return TRACKED_COLLECTION_PII_FIELDS
    .map((field) => `${prefix}${field}=${counts[field]}`)
    .join(" ");
}

function getRewritePlan(
  row: CollectionPiiRow,
  encryptionConfigured: boolean,
  fields: ReadonlySet<TrackedCollectionPiiField>,
): CollectionPiiBooleanMap {
  if (!encryptionConfigured) {
    return {
      customerName: false,
      icNumber: false,
      customerPhone: false,
      accountNumber: false,
    };
  }

  return {
    customerName:
      fields.has("customerName")
      && (
        shouldRewriteCollectionPiiShadowValue({
          plaintext: row.customer_name,
          encrypted: row.customer_name_encrypted,
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
    icNumber:
      fields.has("icNumber")
      && (
        shouldRewriteCollectionPiiShadowValue({
          plaintext: row.ic_number,
          encrypted: row.ic_number_encrypted,
        })
        || shouldRewriteCollectionPiiSearchHashValue({
          field: "icNumber",
          plaintext: row.ic_number,
          encrypted: row.ic_number_encrypted,
          hash: row.ic_number_search_hash,
        })
      ),
    customerPhone:
      fields.has("customerPhone")
      && (
        shouldRewriteCollectionPiiShadowValue({
          plaintext: row.customer_phone,
          encrypted: row.customer_phone_encrypted,
        })
        || shouldRewriteCollectionPiiSearchHashValue({
          field: "customerPhone",
          plaintext: row.customer_phone,
          encrypted: row.customer_phone_encrypted,
          hash: row.customer_phone_search_hash,
        })
      ),
    accountNumber:
      fields.has("accountNumber")
      && (
        shouldRewriteCollectionPiiShadowValue({
          plaintext: row.account_number,
          encrypted: row.account_number_encrypted,
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

function getRedactionPlan(
  row: CollectionPiiRow,
  encryptionConfigured: boolean,
  fields: ReadonlySet<TrackedCollectionPiiField>,
): CollectionPiiBooleanMap {
  if (!encryptionConfigured) {
    return {
      customerName: false,
      icNumber: false,
      customerPhone: false,
      accountNumber: false,
    };
  }

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

export function getCollectionPiiStatusPlan(
  row: CollectionPiiRow,
  encryptionConfigured = hasCollectionPiiEncryptionConfigured(),
  fields = new Set<TrackedCollectionPiiField>(TRACKED_COLLECTION_PII_FIELDS),
): CollectionPiiStatusPlan {
  return {
    plaintext: {
      customerName: fields.has("customerName") && hasMeaningfulValue(row.customer_name),
      icNumber: fields.has("icNumber") && hasMeaningfulValue(row.ic_number),
      customerPhone: fields.has("customerPhone") && hasMeaningfulValue(row.customer_phone),
      accountNumber: fields.has("accountNumber") && hasMeaningfulValue(row.account_number),
    },
    redactable: getRedactionPlan(row, encryptionConfigured, fields),
    rewrite: getRewritePlan(row, encryptionConfigured, fields),
  };
}

export function evaluateCollectionPiiStatus(
  summary: CollectionPiiStatusSummary,
  requirements: CollectionPiiStatusRequirements,
): CollectionPiiStatusEvaluation {
  const failures: string[] = [];
  if (requirements.requireZeroPlaintext && summary.rowsWithPlaintext > 0) {
    failures.push(
      `rowsWithPlaintext=${summary.rowsWithPlaintext} must be zero.`,
    );
  }
  if (requirements.requireZeroRedactable && summary.rowsEligibleForRedaction > 0) {
    failures.push(
      `rowsEligibleForRedaction=${summary.rowsEligibleForRedaction} must be zero.`,
    );
  }
  if (requirements.requireZeroRewrite && summary.rowsNeedingRewrite > 0) {
    failures.push(
      `rowsNeedingRewrite=${summary.rowsNeedingRewrite} must be zero.`,
    );
  }

  return {
    failures,
    ok: failures.length === 0,
    requirements,
  };
}

function buildSummary(
  summary: CollectionPiiStatusSummary,
  fields: ReadonlySet<TrackedCollectionPiiField>,
): string {
  const lines = [
    [
      `processed=${summary.processedRows}`,
      `rowsWithPlaintext=${summary.rowsWithPlaintext}`,
      `plaintextFields=${summary.plaintextFields}`,
      `rowsEligibleForRedaction=${summary.rowsEligibleForRedaction}`,
      `redactableFields=${summary.redactableFields}`,
      `rowsNeedingRewrite=${summary.rowsNeedingRewrite}`,
      `rewriteFields=${summary.rewriteFields}`,
      `encryptionConfigured=${summary.encryptionConfigured}`,
      `fields=${Array.from(fields).join(",")}`,
    ].join(" "),
    formatFieldSummary("plaintext", summary.plaintextFieldCounts),
    formatFieldSummary("redactable", summary.redactableFieldCounts),
    formatFieldSummary("rewrite", summary.rewriteFieldCounts),
  ];

  if (summary.rowsNeedingRewrite > 0) {
    lines.push("Next: run 'npm run collection:reencrypt-pii -- --apply' before retiring plaintext.");
  }
  if (summary.rowsEligibleForRedaction > 0) {
    lines.push("Next: run 'npm run collection:redact-plaintext-pii -- --apply' after confirming the staged rollout.");
  }

  return lines.join("\n");
}

export async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  await assertCollectionPiiPostgresReady("Collection PII status");
  const encryptionConfigured = hasCollectionPiiEncryptionConfigured();
  const summary: CollectionPiiStatusSummary = {
    encryptionConfigured,
    plaintextFieldCounts: createEmptyFieldCounts(),
    plaintextFields: 0,
    processedRows: 0,
    redactableFieldCounts: createEmptyFieldCounts(),
    redactableFields: 0,
    rewriteFieldCounts: createEmptyFieldCounts(),
    rewriteFields: 0,
    rowsEligibleForRedaction: 0,
    rowsNeedingRewrite: 0,
    rowsWithPlaintext: 0,
  };
  let lastId: string | null = null;

  try {
    while (true) {
      const remainingLimit = options.maxRows === null
        ? options.batchSize
        : Math.min(
          options.batchSize,
          Math.max(0, options.maxRows - summary.processedRows),
        );
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
        summary.processedRows += 1;
        lastId = row.id;

        const plan = getCollectionPiiStatusPlan(
          row,
          encryptionConfigured,
          options.fields,
        );
        const plaintextCount = countEnabledFields(plan.plaintext);
        const redactableCount = countEnabledFields(plan.redactable);
        const rewriteCount = countEnabledFields(plan.rewrite);

        if (plaintextCount > 0) {
          summary.rowsWithPlaintext += 1;
          summary.plaintextFields += plaintextCount;
          incrementFieldCounts(summary.plaintextFieldCounts, plan.plaintext);
        }

        if (redactableCount > 0) {
          summary.rowsEligibleForRedaction += 1;
          summary.redactableFields += redactableCount;
          incrementFieldCounts(summary.redactableFieldCounts, plan.redactable);
        }

        if (rewriteCount > 0) {
          summary.rowsNeedingRewrite += 1;
          summary.rewriteFields += rewriteCount;
          incrementFieldCounts(summary.rewriteFieldCounts, plan.rewrite);
        }
      }

      if (result.rows.length < remainingLimit) {
        break;
      }
    }

    const evaluation = evaluateCollectionPiiStatus(summary, {
      requireZeroPlaintext: options.requireZeroPlaintext,
      requireZeroRedactable: options.requireZeroRedactable,
      requireZeroRewrite: options.requireZeroRewrite,
    });

    if (options.json) {
      console.log(JSON.stringify({
        ...summary,
        failures: evaluation.failures,
        fields: Array.from(options.fields),
        ok: evaluation.ok,
        requirements: evaluation.requirements,
      }, null, 2));
      if (!evaluation.ok) {
        process.exitCode = 1;
      }
      return;
    }

    const renderedSummary = buildSummary(summary, options.fields);

    if (!evaluation.ok) {
      throw new Error(
        `${renderedSummary}\nRequirements failed: ${evaluation.failures.join(" ")}`,
      );
    }

    console.log(renderedSummary);
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
