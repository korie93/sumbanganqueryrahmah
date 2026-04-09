import { pool } from "../db-postgres";
import { getCollectionPiiRetiredFields } from "../config/security";

const TRACKED_COLLECTION_PII_FIELDS = [
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
] as const;

type TrackedCollectionPiiField = (typeof TRACKED_COLLECTION_PII_FIELDS)[number];

type CollectionPiiRetirementCountRow = Record<`${TrackedCollectionPiiField}Count`, unknown>;

type CollectionPiiRetirementCounts = Record<TrackedCollectionPiiField, number>;

type QueryResultLike = {
  rows: Array<Record<string, unknown>>;
};

type QueryFunction = (query: string) => Promise<QueryResultLike>;

const COLLECTION_PII_RETIREMENT_COUNTS_QUERY = `
  SELECT
    COUNT(*) FILTER (
      WHERE NULLIF(trim(COALESCE(customer_name, '')), '') IS NOT NULL
    ) AS "customerNameCount",
    COUNT(*) FILTER (
      WHERE NULLIF(trim(COALESCE(ic_number, '')), '') IS NOT NULL
    ) AS "icNumberCount",
    COUNT(*) FILTER (
      WHERE CASE
        WHEN trim(COALESCE(customer_phone, '')) IN ('', '-') THEN NULL
        ELSE trim(customer_phone)
      END IS NOT NULL
    ) AS "customerPhoneCount",
    COUNT(*) FILTER (
      WHERE NULLIF(trim(COALESCE(account_number, '')), '') IS NOT NULL
    ) AS "accountNumberCount"
  FROM public.collection_records
`;

function normalizeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeRetiredFields(
  retiredFields: ReadonlySet<string>,
): ReadonlySet<TrackedCollectionPiiField> {
  return new Set(
    Array.from(retiredFields).filter(
      (field): field is TrackedCollectionPiiField =>
        TRACKED_COLLECTION_PII_FIELDS.includes(field as TrackedCollectionPiiField),
    ),
  );
}

export function mapCollectionPiiRetirementCounts(
  row: Partial<CollectionPiiRetirementCountRow> | null | undefined,
): CollectionPiiRetirementCounts {
  return {
    customerName: normalizeCount(row?.customerNameCount),
    icNumber: normalizeCount(row?.icNumberCount),
    customerPhone: normalizeCount(row?.customerPhoneCount),
    accountNumber: normalizeCount(row?.accountNumberCount),
  };
}

export function buildCollectionPiiRetirementStartupFailure(params: {
  counts: CollectionPiiRetirementCounts;
  retiredFields: ReadonlySet<string>;
}): string | null {
  const retiredFields = normalizeRetiredFields(params.retiredFields);
  if (retiredFields.size === 0) {
    return null;
  }

  const failingFields = Array.from(retiredFields)
    .map((field) => `${field}=${params.counts[field]}`)
    .filter((entry) => !entry.endsWith("=0"));

  if (failingFields.length === 0) {
    return null;
  }

  return [
    "COLLECTION_PII_RETIRED_FIELDS is enabled for collection fields that still have plaintext rows.",
    `Remaining plaintext counts: ${failingFields.join(", ")}.`,
    "Run 'npm run collection:pii-status -- --fields-env COLLECTION_PII_RETIRED_FIELDS --json' and complete the staged redaction before enabling retired-field runtime enforcement.",
  ].join(" ");
}

export async function assertCollectionPiiRetirementStartupReady(params?: {
  query?: QueryFunction;
  retiredFields?: ReadonlySet<string>;
}) {
  const retiredFields = normalizeRetiredFields(
    params?.retiredFields ?? getCollectionPiiRetiredFields(),
  );
  if (retiredFields.size === 0) {
    return;
  }

  const query = params?.query ?? ((statement: string) => pool.query(statement));
  const result = await query(COLLECTION_PII_RETIREMENT_COUNTS_QUERY);
  const counts = mapCollectionPiiRetirementCounts(
    (result.rows?.[0] ?? null) as Partial<CollectionPiiRetirementCountRow> | null,
  );
  const failure = buildCollectionPiiRetirementStartupFailure({
    counts,
    retiredFields,
  });

  if (failure) {
    throw new Error(failure);
  }
}
