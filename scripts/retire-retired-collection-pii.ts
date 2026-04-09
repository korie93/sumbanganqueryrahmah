import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db-postgres";
import { hasCollectionPiiEncryptionConfigured } from "../server/lib/collection-pii-encryption";
import { assertCollectionPiiPostgresReady } from "./collection-pii-postgres";
import {
  collectCollectionPiiStatusSummary,
  evaluateCollectionPiiStatus,
  parseTrackedCollectionPiiFields,
  type CollectionPiiStatusEvaluation,
  type CollectionPiiStatusSummary,
  type TrackedCollectionPiiField,
} from "./collection-pii-status";
import {
  redactCollectionPiiPlaintext,
  type CollectionPiiPlaintextRedactionSummary,
} from "./redact-collection-pii-plaintext";

type CliOptions = {
  apply: boolean;
  batchSize: number;
  json: boolean;
  maxRows: number | null;
};

type RetiredFieldRetirementSlice = {
  evaluation: CollectionPiiStatusEvaluation;
  fields: TrackedCollectionPiiField[];
  summary: CollectionPiiStatusSummary;
};

export type RetiredFieldCollectionPiiRetirementReport = {
  after: RetiredFieldRetirementSlice | null;
  apply: boolean;
  before: RetiredFieldRetirementSlice;
  encryptionConfigured: boolean;
  ok: boolean;
  redaction: CollectionPiiPlaintextRedactionSummary | null;
  recommendations: string[];
};

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

  return { apply, batchSize, json, maxRows };
}

export function resolveConfiguredCollectionPiiRetiredFields(
  envValue = String(process.env.COLLECTION_PII_RETIRED_FIELDS || "").trim(),
): ReadonlySet<TrackedCollectionPiiField> {
  if (!envValue) {
    throw new Error(
      "COLLECTION_PII_RETIRED_FIELDS must be set before retiring configured collection PII fields.",
    );
  }

  return parseTrackedCollectionPiiFields(envValue);
}

function buildRetirementSlice(
  fields: ReadonlySet<TrackedCollectionPiiField>,
  summary: CollectionPiiStatusSummary,
): RetiredFieldRetirementSlice {
  return {
    evaluation: evaluateCollectionPiiStatus(summary, {
      requireZeroPlaintext: true,
      requireZeroRedactable: true,
      requireZeroRewrite: true,
    }),
    fields: Array.from(fields),
    summary,
  };
}

export function buildRetiredFieldCollectionPiiRetirementReport(params: {
  after?: CollectionPiiStatusSummary | null;
  apply: boolean;
  before: CollectionPiiStatusSummary;
  encryptionConfigured: boolean;
  fields: ReadonlySet<TrackedCollectionPiiField>;
  redaction: CollectionPiiPlaintextRedactionSummary | null;
}): RetiredFieldCollectionPiiRetirementReport {
  const before = buildRetirementSlice(params.fields, params.before);
  const after = params.after ? buildRetirementSlice(params.fields, params.after) : null;
  const recommendations: string[] = [];

  if (!params.encryptionConfigured) {
    recommendations.push(
      "Set COLLECTION_PII_ENCRYPTION_KEY before attempting configured collection PII retirement.",
    );
  }

  if (before.summary.rowsNeedingRewrite > 0) {
    recommendations.push(
      "Run 'npm run collection:reencrypt-retired-fields' first, then 'npm run collection:reencrypt-retired-fields -- --apply' before clearing configured retired plaintext fields.",
    );
  }

  if (!params.apply) {
    recommendations.push(
      "Dry-run only. Re-run with '--apply' after the rewrite count is zero and the candidate count looks safe.",
    );
  }

  if (params.apply && after && after.evaluation.ok) {
    recommendations.push(
      "Configured retired fields are clean. Re-run 'npm run collection:verify-pii-retired-fields' in the target environment before rollout.",
    );
  } else if (params.apply && after && !after.evaluation.ok) {
    recommendations.push(
      "Configured retired field cleanup is still incomplete. Re-run 'npm run collection:verify-pii-retired-fields' and inspect the remaining plaintext or rewrite counts.",
    );
  }

  const ok = params.apply
    ? Boolean(after?.evaluation.ok)
    : before.summary.rowsNeedingRewrite === 0;

  return {
    after,
    apply: params.apply,
    before,
    encryptionConfigured: params.encryptionConfigured,
    ok,
    redaction: params.redaction,
    recommendations,
  };
}

export function renderRetiredFieldCollectionPiiRetirementReport(
  report: RetiredFieldCollectionPiiRetirementReport,
): string {
  const lines = [
    `apply=${report.apply} encryptionConfigured=${report.encryptionConfigured} ok=${report.ok}`,
    `fields=${report.before.fields.join(",")}`,
    `before: rowsWithPlaintext=${report.before.summary.rowsWithPlaintext} rowsEligibleForRedaction=${report.before.summary.rowsEligibleForRedaction} rowsNeedingRewrite=${report.before.summary.rowsNeedingRewrite}`,
  ];

  if (report.redaction) {
    lines.push(
      `redaction: candidateRows=${report.redaction.candidateRows} candidateFields=${report.redaction.candidateFields} redactedRows=${report.redaction.redactedRows} redactedFields=${report.redaction.redactedFields} mode=${report.redaction.mode}`,
    );
  }

  if (report.after) {
    lines.push(
      `after: rowsWithPlaintext=${report.after.summary.rowsWithPlaintext} rowsEligibleForRedaction=${report.after.summary.rowsEligibleForRedaction} rowsNeedingRewrite=${report.after.summary.rowsNeedingRewrite}`,
    );
  }

  for (const recommendation of report.recommendations) {
    lines.push(`Next: ${recommendation}`);
  }

  return lines.join("\n");
}

export async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const encryptionConfigured = hasCollectionPiiEncryptionConfigured();
  const fields = resolveConfiguredCollectionPiiRetiredFields();

  if (!encryptionConfigured) {
    throw new Error(
      "COLLECTION_PII_ENCRYPTION_KEY is required before retiring configured collection PII fields.",
    );
  }

  await assertCollectionPiiPostgresReady("Collection PII configured retirement");

  try {
    const before = await collectCollectionPiiStatusSummary({
      batchSize: options.batchSize,
      encryptionConfigured,
      fields,
      maxRows: options.maxRows,
    });

    if (before.rowsNeedingRewrite > 0) {
      const report = buildRetiredFieldCollectionPiiRetirementReport({
        apply: options.apply,
        before,
        encryptionConfigured,
        fields,
        redaction: null,
      });
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(renderRetiredFieldCollectionPiiRetirementReport(report));
      }
      process.exitCode = 1;
      return;
    }

    const redaction = await redactCollectionPiiPlaintext({
      apply: options.apply,
      batchSize: options.batchSize,
      fields,
      maxRows: options.maxRows,
    });
    const after = options.apply
      ? await collectCollectionPiiStatusSummary({
          batchSize: options.batchSize,
          encryptionConfigured,
          fields,
          maxRows: options.maxRows,
        })
      : null;

    const report = buildRetiredFieldCollectionPiiRetirementReport({
      after,
      apply: options.apply,
      before,
      encryptionConfigured,
      fields,
      redaction,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderRetiredFieldCollectionPiiRetirementReport(report));
    }

    if (!report.ok) {
      process.exitCode = 1;
    }
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
