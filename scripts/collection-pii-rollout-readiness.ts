import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db-postgres";
import {
  hasCollectionPiiEncryptionConfigured,
} from "../server/lib/collection-pii-encryption";
import { assertCollectionPiiPostgresReady } from "./collection-pii-postgres";
import {
  collectCollectionPiiStatusSummary,
  evaluateCollectionPiiStatus,
  parseTrackedCollectionPiiFields,
  type CollectionPiiStatusEvaluation,
  type CollectionPiiStatusSummary,
  type TrackedCollectionPiiField,
} from "./collection-pii-status";

const SENSITIVE_COLLECTION_PII_FIELDS = parseTrackedCollectionPiiFields(
  "icNumber,customerPhone,accountNumber",
);

type CliOptions = {
  batchSize: number;
  json: boolean;
  maxRows: number | null;
};

type ReadinessSlice = {
  evaluation: CollectionPiiStatusEvaluation;
  fields: TrackedCollectionPiiField[];
  summary: CollectionPiiStatusSummary;
};

type ReadinessReport = {
  encryptionConfigured: boolean;
  fullRetirementReady: boolean;
  recommendations: string[];
  retiredFields: ReadinessSlice | null;
  sensitiveRetirementReady: boolean;
  sensitiveFields: ReadinessSlice;
  totalFields: ReadinessSlice;
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

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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

  return { batchSize, json, maxRows };
}

function buildReadinessSlice(
  fields: ReadonlySet<TrackedCollectionPiiField>,
  summary: CollectionPiiStatusSummary,
): ReadinessSlice {
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

export function buildCollectionPiiRolloutReadinessReport(params: {
  encryptionConfigured: boolean;
  retiredFields?: ReadonlySet<TrackedCollectionPiiField> | null;
  sensitiveFields: ReadinessSlice;
  totalFields: ReadinessSlice;
}): ReadinessReport {
  const retiredFields = params.retiredFields && params.retiredFields.size > 0
    ? {
        fields: Array.from(params.retiredFields),
        summary: params.totalFields.summary,
        evaluation: evaluateCollectionPiiStatus(params.totalFields.summary, {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
        }),
      }
    : null;

  const recommendations: string[] = [];

  if (!params.encryptionConfigured) {
    recommendations.push(
      "Set COLLECTION_PII_ENCRYPTION_KEY before attempting collection PII retirement.",
    );
  }

  if (params.sensitiveFields.summary.rowsNeedingRewrite > 0) {
    recommendations.push(
      "Run 'npm run collection:reencrypt-sensitive-pii' first, then 'npm run collection:reencrypt-sensitive-pii -- --apply' before the staged sensitive-field retirement.",
    );
  } else if (params.totalFields.summary.rowsNeedingRewrite > 0) {
    recommendations.push(
      "Sensitive fields are ready, but full retirement still needs more shadow-column rewrites. Run 'npm run collection:reencrypt-pii' next, or scope it with '--fields customerName' for the final stage.",
    );
  }

  if (params.sensitiveFields.summary.rowsEligibleForRedaction > 0 || params.sensitiveFields.summary.rowsWithPlaintext > 0) {
    recommendations.push(
      "Run 'npm run collection:retire-sensitive-pii' first, then 'npm run collection:retire-sensitive-pii -- --apply' for icNumber, customerPhone, and accountNumber.",
    );
  } else {
    recommendations.push(
      "Sensitive PII fields are ready for retirement. You can set COLLECTION_PII_RETIRED_FIELDS=icNumber,customerPhone,accountNumber when the target environment is ready.",
    );
  }

  if (retiredFields) {
    if (!retiredFields.evaluation.ok) {
      recommendations.push(
        "Configured COLLECTION_PII_RETIRED_FIELDS still have legacy plaintext or rewrite work. Run 'npm run collection:retire-retired-fields-pii' first, then 'npm run collection:retire-retired-fields-pii -- --apply' before keeping the env enabled.",
      );
    } else {
      recommendations.push(
        "Configured COLLECTION_PII_RETIRED_FIELDS already pass the zero-plaintext gate.",
      );
    }
  }

  if (
    params.totalFields.summary.rowsWithPlaintext > 0
    && params.sensitiveFields.evaluation.ok
  ) {
    recommendations.push(
      "Next staged step is customerName retirement, once operations confirm blind-index search behavior is sufficient.",
    );
  }

  if (params.totalFields.evaluation.ok) {
    recommendations.push(
      "All tracked collection PII fields are clean. The final step is removing plaintext compatibility from the runtime/schema migration plan.",
    );
  }

  return {
    encryptionConfigured: params.encryptionConfigured,
    fullRetirementReady: params.totalFields.evaluation.ok,
    recommendations,
    retiredFields,
    sensitiveRetirementReady: params.sensitiveFields.evaluation.ok,
    sensitiveFields: params.sensitiveFields,
    totalFields: params.totalFields,
  };
}

function renderSlice(label: string, slice: ReadinessSlice): string {
  const { summary } = slice;
  return [
    `${label}:`,
    `fields=${slice.fields.join(",")}`,
    `rowsWithPlaintext=${summary.rowsWithPlaintext}`,
    `rowsEligibleForRedaction=${summary.rowsEligibleForRedaction}`,
    `rowsNeedingRewrite=${summary.rowsNeedingRewrite}`,
    `ok=${slice.evaluation.ok}`,
  ].join(" ");
}

export function renderCollectionPiiRolloutReadinessReport(report: ReadinessReport): string {
  const lines = [
    `encryptionConfigured=${report.encryptionConfigured}`,
    renderSlice("sensitive", report.sensitiveFields),
    renderSlice("full", report.totalFields),
  ];

  if (report.retiredFields) {
    lines.push(renderSlice("retired", report.retiredFields));
  }

  for (const recommendation of report.recommendations) {
    lines.push(`Next: ${recommendation}`);
  }

  return lines.join("\n");
}

export async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const encryptionConfigured = hasCollectionPiiEncryptionConfigured();
  await assertCollectionPiiPostgresReady("Collection PII rollout readiness");

  const retiredFieldsRaw = String(process.env.COLLECTION_PII_RETIRED_FIELDS || "").trim();
  const retiredFields = retiredFieldsRaw
    ? parseTrackedCollectionPiiFields(retiredFieldsRaw)
    : null;

  try {
    const [sensitiveSummary, totalSummary, retiredSummary] = await Promise.all([
      collectCollectionPiiStatusSummary({
        batchSize: options.batchSize,
        encryptionConfigured,
        fields: SENSITIVE_COLLECTION_PII_FIELDS,
        maxRows: options.maxRows,
      }),
      collectCollectionPiiStatusSummary({
        batchSize: options.batchSize,
        encryptionConfigured,
        maxRows: options.maxRows,
      }),
      retiredFields
        ? collectCollectionPiiStatusSummary({
            batchSize: options.batchSize,
            encryptionConfigured,
            fields: retiredFields,
            maxRows: options.maxRows,
          })
        : Promise.resolve(null),
    ]);

    const report = buildCollectionPiiRolloutReadinessReport({
      encryptionConfigured,
      retiredFields,
      sensitiveFields: buildReadinessSlice(SENSITIVE_COLLECTION_PII_FIELDS, sensitiveSummary),
      totalFields: buildReadinessSlice(
        parseTrackedCollectionPiiFields("customerName,icNumber,customerPhone,accountNumber"),
        totalSummary,
      ),
    });

    if (retiredFields && retiredSummary) {
      report.retiredFields = buildReadinessSlice(retiredFields, retiredSummary);
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      if (!report.sensitiveRetirementReady) {
        process.exitCode = 1;
      }
      return;
    }

    console.log(renderCollectionPiiRolloutReadinessReport(report));
    if (!report.sensitiveRetirementReady) {
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
