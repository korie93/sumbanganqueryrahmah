import { pool } from "../db-postgres";
import { getCollectionPiiRetiredFields } from "../config/security";
import { hasUnreadableCollectionPiiShadowValue } from "../lib/collection-pii-encryption";

const TRACKED_COLLECTION_PII_FIELDS = [
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
] as const;

type TrackedCollectionPiiField = (typeof TRACKED_COLLECTION_PII_FIELDS)[number];

type CollectionPiiRetirementCountRow = Record<`${TrackedCollectionPiiField}Count`, unknown>;

type CollectionPiiRetirementCounts = Record<TrackedCollectionPiiField, number>;

type CollectionPiiRetirementShadowRow = {
  id: string;
  customer_name?: string | null | undefined;
  customer_name_encrypted?: string | null | undefined;
  ic_number?: string | null | undefined;
  ic_number_encrypted?: string | null | undefined;
  customer_phone?: string | null | undefined;
  customer_phone_encrypted?: string | null | undefined;
  account_number?: string | null | undefined;
  account_number_encrypted?: string | null | undefined;
};

type QueryResultLike = {
  rows: Array<Record<string, unknown>>;
};

type QueryFunction = (query: string, values?: unknown[]) => Promise<QueryResultLike>;

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

function createEmptyCounts(): CollectionPiiRetirementCounts {
  return {
    customerName: 0,
    icNumber: 0,
    customerPhone: 0,
    accountNumber: 0,
  };
}

function buildCollectionPiiRetirementShadowSelectClause(
  retiredFields: ReadonlySet<TrackedCollectionPiiField>,
): string {
  const columns = ["id"];

  if (retiredFields.has("customerName")) {
    columns.push("customer_name", "customer_name_encrypted");
  }
  if (retiredFields.has("icNumber")) {
    columns.push("ic_number", "ic_number_encrypted");
  }
  if (retiredFields.has("customerPhone")) {
    columns.push("customer_phone", "customer_phone_encrypted");
  }
  if (retiredFields.has("accountNumber")) {
    columns.push("account_number", "account_number_encrypted");
  }

  return columns.join(", ");
}

function buildCollectionPiiRetirementShadowWhereClause(
  retiredFields: ReadonlySet<TrackedCollectionPiiField>,
): string {
  const filters: string[] = [];

  if (retiredFields.has("customerName")) {
    filters.push("NULLIF(trim(COALESCE(customer_name_encrypted, '')), '') IS NOT NULL");
  }
  if (retiredFields.has("icNumber")) {
    filters.push("NULLIF(trim(COALESCE(ic_number_encrypted, '')), '') IS NOT NULL");
  }
  if (retiredFields.has("customerPhone")) {
    filters.push("NULLIF(trim(COALESCE(customer_phone_encrypted, '')), '') IS NOT NULL");
  }
  if (retiredFields.has("accountNumber")) {
    filters.push("NULLIF(trim(COALESCE(account_number_encrypted, '')), '') IS NOT NULL");
  }

  return filters.length > 0 ? filters.join(" OR ") : "FALSE";
}

async function collectCollectionPiiRetirementUnreadableShadowCounts(params: {
  query: QueryFunction;
  retiredFields: ReadonlySet<TrackedCollectionPiiField>;
}): Promise<CollectionPiiRetirementCounts> {
  const counts = createEmptyCounts();
  if (params.retiredFields.size === 0) {
    return counts;
  }

  const selectClause = buildCollectionPiiRetirementShadowSelectClause(params.retiredFields);
  const whereClause = buildCollectionPiiRetirementShadowWhereClause(params.retiredFields);
  let lastId: string | null = null;

  while (true) {
    const result = await params.query(
      `
        SELECT ${selectClause}
        FROM public.collection_records
        WHERE ($1::uuid IS NULL OR id > $1::uuid)
          AND (${whereClause})
        ORDER BY id ASC
        LIMIT $2
      `,
      [lastId, 500],
    );

    if (result.rows.length === 0) {
      break;
    }

    for (const row of result.rows as CollectionPiiRetirementShadowRow[]) {
      lastId = row.id;

      if (
        params.retiredFields.has("customerName")
        && hasUnreadableCollectionPiiShadowValue({
          plaintext: row.customer_name,
          encrypted: row.customer_name_encrypted,
        })
      ) {
        counts.customerName += 1;
      }
      if (
        params.retiredFields.has("icNumber")
        && hasUnreadableCollectionPiiShadowValue({
          plaintext: row.ic_number,
          encrypted: row.ic_number_encrypted,
        })
      ) {
        counts.icNumber += 1;
      }
      if (
        params.retiredFields.has("customerPhone")
        && hasUnreadableCollectionPiiShadowValue({
          plaintext: row.customer_phone,
          encrypted: row.customer_phone_encrypted,
        })
      ) {
        counts.customerPhone += 1;
      }
      if (
        params.retiredFields.has("accountNumber")
        && hasUnreadableCollectionPiiShadowValue({
          plaintext: row.account_number,
          encrypted: row.account_number_encrypted,
        })
      ) {
        counts.accountNumber += 1;
      }
    }

    if (result.rows.length < 500) {
      break;
    }
  }

  return counts;
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
  unreadableShadowCounts?: CollectionPiiRetirementCounts;
}): string | null {
  const retiredFields = normalizeRetiredFields(params.retiredFields);
  if (retiredFields.size === 0) {
    return null;
  }

  const failingFields = Array.from(retiredFields)
    .map((field) => `${field}=${params.counts[field]}`)
    .filter((entry) => !entry.endsWith("=0"));

  const unreadableShadowCounts = params.unreadableShadowCounts ?? createEmptyCounts();
  const unreadableShadowFields = Array.from(retiredFields)
    .map((field) => `${field}=${unreadableShadowCounts[field]}`)
    .filter((entry) => !entry.endsWith("=0"));

  if (failingFields.length === 0 && unreadableShadowFields.length === 0) {
    return null;
  }

  const lines = [
    "COLLECTION_PII_RETIRED_FIELDS is enabled for collection fields that are not ready for retired-field runtime enforcement.",
  ];

  if (failingFields.length > 0) {
    lines.push(`Remaining plaintext counts: ${failingFields.join(", ")}.`);
  }
  if (unreadableShadowFields.length > 0) {
    lines.push(`Unreadable encrypted shadow counts: ${unreadableShadowFields.join(", ")}.`);
    lines.push(
      "Investigate the affected rows before rollout. These shadows can no longer be recovered automatically from plaintext fallback.",
    );
  }

  lines.push(
    "Run 'npm run collection:pii-status -- --fields-env COLLECTION_PII_RETIRED_FIELDS --json' and complete the staged redaction or data repair before enabling retired-field runtime enforcement.",
  );
  return lines.join(" ");
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

  const query = params?.query ?? ((statement: string, values?: unknown[]) => pool.query(statement, values));
  const result = await query(COLLECTION_PII_RETIREMENT_COUNTS_QUERY);
  const counts = mapCollectionPiiRetirementCounts(
    (result.rows?.[0] ?? null) as Partial<CollectionPiiRetirementCountRow> | null,
  );
  const unreadableShadowCounts = await collectCollectionPiiRetirementUnreadableShadowCounts({
    query,
    retiredFields,
  });
  const failure = buildCollectionPiiRetirementStartupFailure({
    counts,
    retiredFields,
    unreadableShadowCounts,
  });

  if (failure) {
    throw new Error(failure);
  }
}
