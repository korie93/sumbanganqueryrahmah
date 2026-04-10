import { readFileSync } from "node:fs";
import path from "node:path";

export const COLLECTION_AMOUNT_CONTRACT_REQUIREMENTS = Object.freeze([
  {
    filePath: "shared/collection-amount-types.ts",
    checks: Object.freeze([
      {
        label: "documents MYR string read-model boundary",
        snippet: "// - MYR string values are used for API/read models rendered to clients.",
      },
      {
        label: "documents MYR numeric input boundary",
        snippet: "// - MYR number values are used for validated inputs and in-memory calculations.",
      },
      {
        label: "documents cents receipt-storage boundary",
        snippet: "// - cents values are integer minor units used by receipt/OCR/bigint storage paths.",
      },
      {
        label: "exports CollectionAmountCents alias",
        snippet: "export type CollectionAmountCents = number;",
      },
      {
        label: "exports cents parsing helper",
        snippet: "export function parseCollectionAmountToCents(",
      },
      {
        label: "exports cents formatting helper",
        snippet: "export function formatCollectionAmountFromCents(value: unknown): CollectionAmountMyrString {",
      },
    ]),
  },
  {
    filePath: "shared/schema-postgres-collection.ts",
    checks: Object.freeze([
      {
        label: "documents numeric MYR storage for collection_records.amount",
        snippet: "// Primary payment total is stored in MYR using a fixed decimal numeric column.",
      },
      {
        label: "keeps collection_records.amount as numeric(14,2)",
        snippet: "amount: numeric(\"amount\", { precision: 14, scale: 2 }).notNull(),",
      },
      {
        label: "documents cents storage for collection_records.receipt_total_amount",
        snippet: "// Receipt-derived totals stay in integer sen/cents to avoid rounding drift across OCR/import flows.",
      },
      {
        label: "keeps collection_records.receipt_total_amount as bigint",
        snippet: "receiptTotalAmount: bigint(\"receipt_total_amount\", { mode: \"number\" }).notNull().default(0),",
      },
      {
        label: "documents cents storage for receipt amount columns",
        snippet: "// Receipt amounts are normalized to integer sen/cents before persistence.",
      },
      {
        label: "keeps collection_record_receipts.receipt_amount as bigint",
        snippet: "receiptAmount: bigint(\"receipt_amount\", { mode: \"number\" }),",
      },
      {
        label: "keeps collection_record_receipts.extracted_amount as bigint",
        snippet: "extractedAmount: bigint(\"extracted_amount\", { mode: \"number\" }),",
      },
    ]),
  },
  {
    filePath: "server/internal/collection-bootstrap-record-schema.ts",
    checks: Object.freeze([
      {
        label: "bootstrap keeps collection_records.amount as numeric(14,2)",
        snippet: "amount numeric(14,2) NOT NULL,",
      },
      {
        label: "bootstrap keeps collection_records.receipt_total_amount as bigint",
        snippet: "receipt_total_amount bigint NOT NULL DEFAULT 0,",
      },
      {
        label: "bootstrap keeps collection_record_receipts.receipt_amount as bigint",
        snippet: "receipt_amount bigint,",
      },
      {
        label: "bootstrap keeps collection_record_receipts.extracted_amount as bigint",
        snippet: "extracted_amount bigint,",
      },
      {
        label: "bootstrap comments describe MYR numeric storage",
        snippet: "IS 'Stored in MYR as numeric(14,2).'",
      },
      {
        label: "bootstrap comments describe cents aggregate storage",
        snippet: "IS 'Stored in sen/cents as a bigint integer. Divide by 100 to render MYR.'",
      },
      {
        label: "bootstrap comments describe cents receipt amount storage",
        snippet: "IS 'Stored in sen/cents as a bigint integer when receipt totals are extracted or confirmed.'",
      },
      {
        label: "bootstrap comments describe cents OCR amount storage",
        snippet: "IS 'Stored in sen/cents as a bigint integer when OCR extraction returns a candidate amount.'",
      },
    ]),
  },
  {
    filePath: "server/repositories/collection-repository-mappers.ts",
    checks: Object.freeze([
      {
        label: "maps collection record amount via MYR formatter",
        snippet: "amount: formatCollectionAmountMyrString(normalizedRow.amount ?? 0),",
      },
      {
        label: "maps receipt totals from cents into MYR strings",
        snippet: "receiptTotalAmount: formatCollectionAmountFromCents(",
      },
    ]),
  },
  {
    filePath: "server/repositories/collection-receipt-read-shared.ts",
    checks: Object.freeze([
      {
        label: "maps receiptAmount from cents into MYR strings",
        snippet: "formatCollectionAmountFromCents(rawReceiptAmount),",
      },
      {
        label: "maps extractedAmount from cents into MYR strings",
        snippet: "formatCollectionAmountFromCents(rawExtractedAmount),",
      },
    ]),
  },
  {
    filePath: "server/storage-postgres-collection-types.ts",
    checks: Object.freeze([
      {
        label: "server read model exposes receiptAmount as MYR string",
        snippet: "receiptAmount: CollectionAmountMyrString | null;",
      },
      {
        label: "server read model exposes extractedAmount as MYR string",
        snippet: "extractedAmount: CollectionAmountMyrString | null;",
      },
      {
        label: "server read model exposes receiptTotalAmount as MYR string",
        snippet: "receiptTotalAmount: CollectionAmountMyrString;",
      },
      {
        label: "server mutation input keeps receiptAmountCents in cents",
        snippet: "receiptAmountCents?: CollectionAmountCents | null | undefined;",
      },
      {
        label: "server mutation input keeps extractedAmountCents in cents",
        snippet: "extractedAmountCents?: CollectionAmountCents | null | undefined;",
      },
    ]),
  },
  {
    filePath: "client/src/lib/api/collection-types.ts",
    checks: Object.freeze([
      {
        label: "client read model exposes receiptAmount as MYR string",
        snippet: "receiptAmount: CollectionAmountMyrString | null;",
      },
      {
        label: "client read model exposes extractedAmount as MYR string",
        snippet: "extractedAmount: CollectionAmountMyrString | null;",
      },
      {
        label: "client read model exposes receiptTotalAmount as MYR string",
        snippet: "receiptTotalAmount: CollectionAmountMyrString;",
      },
    ]),
  },
  {
    filePath: "server/repositories/backups-payload-utils.ts",
    checks: Object.freeze([
      {
        label: "backup export keeps receipt total field explicitly named in cents",
        snippet: "receipt_total_amount as \"receiptTotalAmountCents\",",
      },
      {
        label: "backup export keeps receipt amount field explicitly named in cents",
        snippet: "receipt_amount as \"receiptAmountCents\",",
      },
      {
        label: "backup export keeps OCR amount field explicitly named in cents",
        snippet: "extracted_amount as \"extractedAmountCents\",",
      },
    ]),
  },
]);

export function loadCollectionAmountContractFiles({
  cwd = process.cwd(),
  requirements = COLLECTION_AMOUNT_CONTRACT_REQUIREMENTS,
} = {}) {
  return Object.fromEntries(
    requirements.map((requirement) => {
      const absolutePath = path.resolve(cwd, requirement.filePath);
      try {
        return [requirement.filePath, readFileSync(absolutePath, "utf8")];
      } catch {
        return [requirement.filePath, null];
      }
    }),
  );
}

export function validateCollectionAmountContract({
  filesByPath = {},
  requirements = COLLECTION_AMOUNT_CONTRACT_REQUIREMENTS,
} = {}) {
  const failures = [];
  let checkedFileCount = 0;
  let checkedSnippetCount = 0;
  const snippetCount = requirements.reduce((total, requirement) => total + requirement.checks.length, 0);

  for (const requirement of requirements) {
    const text = filesByPath[requirement.filePath];
    if (typeof text !== "string") {
      failures.push(`Missing required collection amount contract file: ${requirement.filePath}`);
      continue;
    }

    checkedFileCount += 1;

    for (const check of requirement.checks) {
      checkedSnippetCount += 1;
      if (!text.includes(check.snippet)) {
        failures.push(`${requirement.filePath} missing contract marker: ${check.label}`);
      }
    }
  }

  return {
    failures,
    summary: {
      fileCount: requirements.length,
      checkedFileCount,
      snippetCount,
      checkedSnippetCount,
    },
  };
}

export function formatCollectionAmountContractReport(validation) {
  const lines = [
    `Collection amount contract check inspected ${validation.summary.fileCount} files and ${validation.summary.snippetCount} contract markers.`,
  ];

  if (validation.failures.length > 0) {
    lines.push("Failures:");
    for (const failure of validation.failures) {
      lines.push(`- ${failure}`);
    }
  } else {
    lines.push("All checked collection amount boundaries preserve the documented MYR vs cents split.");
  }

  return lines.join("\n");
}
