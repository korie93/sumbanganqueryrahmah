import { createHash, createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { getAuditHmacKey } from "../config/security";
import {
  assessCanonicalSavedCollectionCompatibility,
} from "../lib/saved-collection-link-utils";
import { buildCollectionCallingWindow } from "../lib/collection-calling-window";
import { buildCollectionBillingPrincipalReport } from "../lib/collection-osp-report";
import { buildTextArraySql } from "./sql-array-utils";
import type {
  CollectionAgingBucket,
  CollectionBillingPrincipalReport,
  CollectionIndexedSourceMatch,
  CollectionOspTargetInput,
  CollectionSourceConfig,
  CollectionSourceMatchResult,
  ConfigureCollectionSourceInput,
} from "../storage-postgres-collection-types";

const SOURCE_INDEX_PAGE_SIZE = 500;
const MAX_SOURCE_MATCHES = 25;

export function normalizeCollectionSourceIdentifier(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export type CollectionSourceIdentifierKind = "account_number" | "card_number";

let collectionSourceBlindIndexKey: Buffer | null = null;

function getCollectionSourceBlindIndexKey(): Buffer {
  if (!collectionSourceBlindIndexKey) {
    // Derive a purpose-specific sub-key from the production-required audit
    // HMAC secret. This keeps Account/Card blind indexes resistant to offline
    // dictionary attacks without persisting raw identifiers or reusing the
    // audit-HMAC message domain directly.
    collectionSourceBlindIndexKey = createHmac("sha256", getAuditHmacKey())
      .update("sqr-collection-source-blind-index-key-v1", "utf8")
      .digest();
  }
  return collectionSourceBlindIndexKey;
}

export function hashCollectionSourceIdentifier(
  value: unknown,
  kind: CollectionSourceIdentifierKind = "account_number",
): string | null {
  const normalized = normalizeCollectionSourceIdentifier(value);
  if (!normalized) return null;
  return createHmac("sha256", getCollectionSourceBlindIndexKey())
    .update(`sqr-collection-source-identifier-v2:${kind}:${normalized}`, "utf8")
    .digest("hex");
}

export function buildCollectionSourceScopeHash(sourceImportIds: string[]): string {
  const canonical = Array.from(new Set(sourceImportIds.map((value) => value.trim()).filter(Boolean)))
    .sort()
    .join("\n");
  return createHash("sha256")
    .update(`sqr-collection-osp-source-scope-v1:${canonical}`, "utf8")
    .digest("hex");
}

function mapSourceConfig(row: Record<string, unknown>): CollectionSourceConfig {
  return {
    sourceImportId: String(row.source_import_id || ""),
    sourceImportName: String(row.source_import_name || ""),
    sourceFilename: String(row.source_filename || ""),
    rowCount: Math.max(0, Number(row.row_count || 0)),
    validFrom: String(row.valid_from || "").slice(0, 10),
    validTo: String(row.valid_to || "").slice(0, 10),
    cycleKey: String(row.cycle_key || ""),
    enabled: row.enabled === true,
    compatibilityStatus: row.compatibility_status === "compatible" ? "compatible" : "incompatible",
    compatibilityIssues: Array.isArray(row.compatibility_issues)
      ? row.compatibility_issues.map(String)
      : [],
    indexedRowCount: Math.max(0, Number(row.indexed_row_count || 0)),
    configuredBy: String(row.configured_by || ""),
    configuredAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at || 0)),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at || 0)),
    status: row.derived_status === "active"
      || row.derived_status === "upcoming"
      || row.derived_status === "expired"
      || row.derived_status === "disabled"
      ? row.derived_status
      : "incompatible",
  };
}

const SOURCE_CONFIG_SELECT = sql`
  config.source_import_id,
  imp.name AS source_import_name,
  imp.filename AS source_filename,
  (SELECT COUNT(*)::int FROM public.data_rows source_count
    WHERE source_count.import_id = config.source_import_id) AS row_count,
  config.valid_from,
  config.valid_to,
  config.cycle_key,
  config.enabled,
  config.compatibility_status,
  config.compatibility_issues,
  config.indexed_row_count,
  config.configured_by,
  config.created_at,
  config.updated_at,
  CASE
    WHEN config.compatibility_status <> 'compatible' THEN 'incompatible'
    WHEN config.enabled = false THEN 'disabled'
    WHEN CURRENT_DATE < config.valid_from THEN 'upcoming'
    WHEN CURRENT_DATE > config.valid_to THEN 'expired'
    ELSE 'active'
  END AS derived_status
`;

export async function listCollectionSourceConfigs(): Promise<CollectionSourceConfig[]> {
  const result = await db.execute(sql`
    SELECT ${SOURCE_CONFIG_SELECT}
    FROM public.collection_source_configs config
    JOIN public.imports imp ON imp.id = config.source_import_id
    WHERE imp.is_deleted = false
    ORDER BY config.valid_from DESC, config.updated_at DESC, config.source_import_id ASC
  `);
  return (result.rows || []).map((row) => mapSourceConfig(row as Record<string, unknown>));
}

export async function getCollectionSourceConfig(
  sourceImportId: string,
): Promise<CollectionSourceConfig | undefined> {
  const result = await db.execute(sql`
    SELECT ${SOURCE_CONFIG_SELECT}
    FROM public.collection_source_configs config
    JOIN public.imports imp ON imp.id = config.source_import_id
    WHERE config.source_import_id = ${sourceImportId}
      AND imp.is_deleted = false
    LIMIT 1
  `);
  const row = result.rows?.[0] as Record<string, unknown> | undefined;
  return row ? mapSourceConfig(row) : undefined;
}

export async function configureCollectionSource(
  input: ConfigureCollectionSourceInput,
): Promise<CollectionSourceConfig> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`collection-source:${input.sourceImportId}`}, 0))
    `);
    const importResult = await tx.execute(sql`
      SELECT id
      FROM public.imports
      WHERE id = ${input.sourceImportId}
        AND is_deleted = false
      FOR UPDATE
    `);
    if (!importResult.rows?.[0]) {
      throw new Error("Collection source import was not found.");
    }

    await tx.execute(sql`
      DELETE FROM public.collection_source_rows
      WHERE source_import_id = ${input.sourceImportId}
    `);

    let cursor = "";
    let sourceRowCount = 0;
    let indexedRowCount = 0;
    const issues = new Set<string>();

    while (true) {
      const page = await tx.execute(sql`
        SELECT source_row.id, source_row.json_data
        FROM public.data_rows source_row
        JOIN public.imports imp ON imp.id = source_row.import_id
        WHERE source_row.import_id = ${input.sourceImportId}
          AND imp.is_deleted = false
          AND (${cursor} = '' OR source_row.id > ${cursor})
        ORDER BY source_row.id ASC
        LIMIT ${SOURCE_INDEX_PAGE_SIZE}
        FOR SHARE OF source_row, imp
      `);
      const rows = (page.rows || []) as Array<Record<string, unknown>>;
      if (rows.length === 0) break;

      const values = [];
      for (const sourceRow of rows) {
        sourceRowCount += 1;
        const assessment = assessCanonicalSavedCollectionCompatibility(sourceRow.json_data);
        for (const issue of assessment.issues) issues.add(issue);
        if (!assessment.compatible) continue;

        const accountHash = hashCollectionSourceIdentifier(
          assessment.row.accountNumber,
          "account_number",
        );
        const cardHash = hashCollectionSourceIdentifier(
          assessment.row.cardNumber,
          "card_number",
        );
        const canonicalObligationKey = accountHash
          ? `account:${accountHash}`
          : cardHash
            ? `card:${cardHash}`
            : null;
        if (!canonicalObligationKey) {
          issues.add("missing_account_or_card");
          continue;
        }
        const normalizedCard = normalizeCollectionSourceIdentifier(assessment.row.cardNumber);
        values.push(sql`(
          ${input.sourceImportId},
          ${String(sourceRow.id)},
          ${accountHash},
          ${cardHash},
          ${normalizedCard ? normalizedCard.slice(-4) : null},
          ${canonicalObligationKey},
          ${assessment.row.totalDue},
          ${assessment.row.billingPrincipalOsp},
          ${assessment.row.totalOsb},
          ${assessment.row.agingBucket},
          ${assessment.row.callingDate}::date
        )`);
      }

      if (values.length > 0) {
        await tx.execute(sql`
          INSERT INTO public.collection_source_rows (
            source_import_id,
            source_data_row_id,
            account_number_hash,
            card_number_hash,
            card_number_last4,
            canonical_obligation_key,
            total_due,
            billing_principal_osp,
            total_osb,
            aging_bucket,
            calling_date
          ) VALUES ${sql.join(values, sql`, `)}
        `);
        indexedRowCount += values.length;
      }

      cursor = String(rows[rows.length - 1]?.id || "");
      if (rows.length < SOURCE_INDEX_PAGE_SIZE) break;
    }

    if (sourceRowCount === 0) issues.add("empty_source");
    if (indexedRowCount !== sourceRowCount) issues.add("invalid_source_rows");
    const compatible = issues.size === 0;
    if (!compatible) {
      await tx.execute(sql`
        DELETE FROM public.collection_source_rows
        WHERE source_import_id = ${input.sourceImportId}
      `);
      indexedRowCount = 0;
    }

    const issueArray = Array.from(issues).sort();
    const cycleKey = input.validFrom.slice(0, 7);
    await tx.execute(sql`
      INSERT INTO public.collection_source_configs (
        source_import_id,
        valid_from,
        valid_to,
        cycle_key,
        enabled,
        compatibility_status,
        compatibility_issues,
        indexed_row_count,
        configured_by,
        created_at,
        updated_at
      ) VALUES (
        ${input.sourceImportId},
        ${input.validFrom}::date,
        ${input.validTo}::date,
        ${cycleKey},
        ${compatible && input.enabled},
        ${compatible ? "compatible" : "incompatible"},
        ${buildTextArraySql(issueArray)},
        ${indexedRowCount},
        ${input.configuredBy},
        now(),
        now()
      )
      ON CONFLICT (source_import_id) DO UPDATE SET
        valid_from = EXCLUDED.valid_from,
        valid_to = EXCLUDED.valid_to,
        cycle_key = EXCLUDED.cycle_key,
        enabled = EXCLUDED.enabled,
        compatibility_status = EXCLUDED.compatibility_status,
        compatibility_issues = EXCLUDED.compatibility_issues,
        indexed_row_count = EXCLUDED.indexed_row_count,
        configured_by = EXCLUDED.configured_by,
        updated_at = now()
    `);
  });

  const configured = await getCollectionSourceConfig(input.sourceImportId);
  if (!configured) throw new Error("Configured Collection source could not be reloaded.");
  return configured;
}

export async function deleteCollectionSource(sourceImportId: string): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`collection-source:${sourceImportId}`}, 0))
    `);
    await tx.execute(sql`
      DELETE FROM public.collection_source_rows WHERE source_import_id = ${sourceImportId}
    `);
    return tx.execute(sql`
      DELETE FROM public.collection_source_configs
      WHERE source_import_id = ${sourceImportId}
      RETURNING source_import_id
    `);
  });
  return Boolean(result.rows?.[0]);
}

export async function findEligibleCollectionSourceMatches(input: {
  paymentDate: string;
  accountNumber?: string;
  cardNumber?: string;
}): Promise<CollectionSourceMatchResult> {
  const accountHash = hashCollectionSourceIdentifier(input.accountNumber, "account_number");
  const cardHash = hashCollectionSourceIdentifier(input.cardNumber, "card_number");
  const eligibleResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM public.collection_source_configs config
    JOIN public.imports imp ON imp.id = config.source_import_id
    WHERE config.enabled = true
      AND config.compatibility_status = 'compatible'
      AND ${input.paymentDate}::date BETWEEN config.valid_from AND config.valid_to
      AND imp.is_deleted = false
  `);
  const eligibleSourceCount = Number((eligibleResult.rows?.[0] as { count?: unknown } | undefined)?.count || 0);
  if (eligibleSourceCount === 0 || (!accountHash && !cardHash)) {
    return { eligibleSourceCount, matches: [] };
  }

  // When callers provide both strong identifiers, the same indexed master row
  // must own both values. Falling back to an OR here could accept an account
  // match even when the supplied card belongs to a different obligation.
  const matchCondition = accountHash && cardHash
    ? sql`source_row.account_number_hash = ${accountHash} AND source_row.card_number_hash = ${cardHash}`
    : cardHash
      ? sql`source_row.card_number_hash = ${cardHash}`
      : sql`source_row.account_number_hash = ${accountHash}`;

  const result = await db.execute(sql`
    SELECT
      source_row.source_import_id,
      source_row.source_data_row_id,
      imp.name AS source_import_name,
      imp.filename AS source_filename,
      source_row.canonical_obligation_key,
      config.cycle_key,
      source_row.card_number_last4,
      source_row.total_due::text AS total_due,
      source_row.billing_principal_osp::text AS billing_principal_osp,
      source_row.total_osb::text AS total_osb,
      source_row.aging_bucket,
      source_row.calling_date,
      config.valid_from,
      config.updated_at,
      CASE
        WHEN source_row.account_number_hash = ${accountHash}
          AND source_row.card_number_hash = ${cardHash} THEN 'account_and_card'
        WHEN source_row.account_number_hash = ${accountHash} THEN 'account_number'
        ELSE 'card_number'
      END AS match_basis
    FROM public.collection_source_rows source_row
    JOIN public.collection_source_configs config
      ON config.source_import_id = source_row.source_import_id
    JOIN public.imports imp ON imp.id = source_row.source_import_id
    WHERE config.enabled = true
      AND config.compatibility_status = 'compatible'
      AND ${input.paymentDate}::date BETWEEN config.valid_from AND config.valid_to
      AND imp.is_deleted = false
      AND (${matchCondition})
    ORDER BY
      CASE WHEN source_row.account_number_hash = ${accountHash} THEN 0 ELSE 1 END,
      source_row.calling_date DESC,
      config.valid_from DESC,
      config.updated_at DESC,
      source_row.source_import_id ASC,
      source_row.source_data_row_id ASC
    LIMIT ${MAX_SOURCE_MATCHES}
  `);

  const mapped = (result.rows || []).map((raw): CollectionIndexedSourceMatch => {
    const row = raw as Record<string, unknown>;
    const callingDate = String(row.calling_date || "").slice(0, 10);
    const window = buildCollectionCallingWindow(callingDate);
    return {
      sourceImportId: String(row.source_import_id || ""),
      sourceDataRowId: String(row.source_data_row_id || ""),
      sourceImportName: String(row.source_import_name || ""),
      sourceFilename: String(row.source_filename || ""),
      sourceObligationKey: String(row.canonical_obligation_key || ""),
      // A source config's valid-from month is not a settlement cycle: files
      // such as P10/P25 can share that month. Calling Date is the trusted
      // cycle boundary, while the obligation key prevents cross-account
      // aggregation.
      settlementCycleKey: `${callingDate}:${String(row.canonical_obligation_key || "")}`,
      cardNumberLast4: String(row.card_number_last4 || "") || null,
      matchBasis: row.match_basis === "account_and_card"
        ? "account_and_card"
        : row.match_basis === "account_number"
          ? "account_number"
          : "card_number",
      totalDue: String(row.total_due || "0.00") as CollectionIndexedSourceMatch["totalDue"],
      billingPrincipalOsp: String(row.billing_principal_osp || "0.00") as CollectionIndexedSourceMatch["billingPrincipalOsp"],
      totalOsb: row.total_osb == null
        ? null
        : String(row.total_osb) as CollectionIndexedSourceMatch["totalOsb"],
      agingBucket: String(row.aging_bucket || "") as CollectionAgingBucket,
      callingDate,
      callingWindowEnd: window?.endInclusive || "",
      callingWindowEndExclusive: window?.endExclusive || "",
      duplicateSourceCount: 1,
    };
  });

  const grouped = new Map<string, CollectionIndexedSourceMatch[]>();
  for (const match of mapped) {
    const values = grouped.get(match.settlementCycleKey) || [];
    values.push(match);
    grouped.set(match.settlementCycleKey, values);
  }
  const matches = Array.from(grouped.values()).map((values) => ({
    ...values[0]!,
    duplicateSourceCount: values.length,
  }));
  return { eligibleSourceCount, matches };
}

function normalizeAgingAggregateRows(rows: unknown[]): {
  amounts: Partial<Record<CollectionAgingBucket, string>>;
  counts: Partial<Record<CollectionAgingBucket, number>>;
} {
  const amounts: Partial<Record<CollectionAgingBucket, string>> = {};
  const counts: Partial<Record<CollectionAgingBucket, number>> = {};
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const aging = String(row.aging_bucket || "") as CollectionAgingBucket;
    if (!(["D3", "D4", "D5", "D6"] as string[]).includes(aging)) continue;
    amounts[aging] = String(row.amount || "0.00");
    counts[aging] = Math.max(0, Number(row.account_count || 0));
  }
  return { amounts, counts };
}

export async function getCollectionBillingPrincipalReport(input: {
  sourceImportIds: string[];
  from: string;
  to: string;
  agingBuckets?: CollectionAgingBucket[] | undefined;
  nicknames?: string[] | undefined;
  createdByLogin?: string | undefined;
}): Promise<CollectionBillingPrincipalReport> {
  const sourceIdsSql = buildTextArraySql(input.sourceImportIds);
  const agingSql = input.agingBuckets?.length ? buildTextArraySql(input.agingBuckets) : null;
  const nicknameSql = input.nicknames?.length
    ? buildTextArraySql(input.nicknames.map((value) => value.toLowerCase()))
    : null;
  const baseline = await db.execute(sql`
    WITH ranked_source AS (
      SELECT
        source_row.aging_bucket,
        source_row.billing_principal_osp,
        ROW_NUMBER() OVER (
          PARTITION BY source_row.canonical_obligation_key
          ORDER BY source_row.calling_date DESC, config.valid_from DESC,
            source_row.source_import_id ASC, source_row.source_data_row_id ASC
        ) AS source_rank
      FROM public.collection_source_rows source_row
      JOIN public.collection_source_configs config
        ON config.source_import_id = source_row.source_import_id
      JOIN public.imports imp
        ON imp.id = source_row.source_import_id
      WHERE source_row.source_import_id = ANY(${sourceIdsSql})
        AND config.compatibility_status = 'compatible'
        AND imp.is_deleted = false
        ${agingSql ? sql`AND source_row.aging_bucket = ANY(${agingSql})` : sql``}
    )
    SELECT
      aging_bucket,
      COALESCE(SUM(billing_principal_osp), 0)::numeric(16,2)::text AS amount,
      COUNT(*)::int AS account_count
    FROM ranked_source
    WHERE source_rank = 1
    GROUP BY aging_bucket
  `);

  const closed = await db.execute(sql`
    WITH canonical_abort_events AS (
      SELECT DISTINCT ON (record.source_obligation_key)
        record.source_obligation_key,
        record.aging_bucket,
        record.billing_principal_osp,
        record.payment_date,
        record.collection_staff_nickname,
        record.created_by_login
      FROM public.collection_records record
      JOIN public.collection_source_configs config
        ON config.source_import_id = record.source_import_id
      JOIN public.imports imp
        ON imp.id = record.source_import_id
      WHERE record.classification = 'abort_cp'
        AND record.duplicate_receipt_flag = false
        AND record.source_data_row_id IS NOT NULL
        AND record.source_match_basis IS NOT NULL
        AND record.source_obligation_key IS NOT NULL
        AND record.total_due IS NOT NULL
        AND record.billing_principal_osp IS NOT NULL
        AND record.calling_date IS NOT NULL
        AND record.calling_window_end_exclusive IS NOT NULL
        AND record.payment_date >= record.calling_date
        AND record.payment_date < record.calling_window_end_exclusive
        AND record.source_import_id = ANY(${sourceIdsSql})
        AND config.compatibility_status = 'compatible'
        AND imp.is_deleted = false
      ORDER BY record.source_obligation_key, record.payment_date, record.created_at, record.id
    ), filtered_abort_events AS (
      SELECT aging_bucket, billing_principal_osp
      FROM canonical_abort_events
      WHERE payment_date BETWEEN ${input.from}::date AND ${input.to}::date
        ${agingSql ? sql`AND aging_bucket = ANY(${agingSql})` : sql``}
        ${nicknameSql ? sql`AND lower(collection_staff_nickname) = ANY(${nicknameSql})` : sql``}
        ${input.createdByLogin ? sql`AND lower(created_by_login) = ${input.createdByLogin.toLowerCase()}` : sql``}
    )
    SELECT
      aging_bucket,
      COALESCE(SUM(billing_principal_osp), 0)::numeric(16,2)::text AS amount,
      COUNT(*)::int AS account_count
    FROM filtered_abort_events
    GROUP BY aging_bucket
  `);

  const scopeHash = buildCollectionSourceScopeHash(input.sourceImportIds);
  const targetRows = await db.execute(sql`
    SELECT aging_bucket, total_osp_baseline::text, target_percentage::text
    FROM public.collection_osp_targets
    WHERE source_scope_hash = ${scopeHash}
      AND period_from = ${input.from}::date
      AND period_to = ${input.to}::date
  `);
  const targets = (targetRows.rows || []).map((raw): CollectionOspTargetInput => {
    const row = raw as Record<string, unknown>;
    return {
      agingBucket: String(row.aging_bucket || "") as CollectionAgingBucket,
      totalOspBaseline: row.total_osp_baseline == null ? null : String(row.total_osp_baseline),
      targetPercentage: String(row.target_percentage || "0"),
    };
  });
  const baselineRows = normalizeAgingAggregateRows(baseline.rows || []);
  const closedRows = normalizeAgingAggregateRows(closed.rows || []);
  return buildCollectionBillingPrincipalReport({
    rawTotalOspByAging: baselineRows.amounts,
    ospClosedByAging: closedRows.amounts,
    closedAccountCountByAging: closedRows.counts,
    targets,
  });
}

export async function upsertCollectionOspTargets(input: {
  sourceImportIds: string[];
  from: string;
  to: string;
  targets: CollectionOspTargetInput[];
  configuredBy: string;
}): Promise<CollectionOspTargetInput[]> {
  const sourceImportIds = Array.from(
    new Set(input.sourceImportIds.map((value) => String(value).trim()).filter(Boolean)),
  ).sort();
  if (sourceImportIds.length < 1 || sourceImportIds.length > 5) {
    throw new Error("Collection OSP targets require between 1 and 5 source imports.");
  }
  const targetBuckets = input.targets.map((target) => target.agingBucket);
  if (
    targetBuckets.some((bucket, index) => targetBuckets.indexOf(bucket) !== index)
    || targetBuckets.some((bucket) => !(["D3", "D4", "D5", "D6"] as string[]).includes(bucket))
  ) {
    throw new Error("Collection OSP targets must contain one row for each unique D3-D6 bucket.");
  }
  const sourceScopeHash = buildCollectionSourceScopeHash(sourceImportIds);
  await db.transaction(async (tx) => {
    const sourceResult = await tx.execute(sql`
      SELECT id
      FROM public.imports
      WHERE id = ANY(${buildTextArraySql(sourceImportIds)})
        AND is_deleted = false
      FOR SHARE
    `);
    if ((sourceResult.rows || []).length !== sourceImportIds.length) {
      throw new Error("One or more collection source imports were not found.");
    }
    for (const target of input.targets) {
      await tx.execute(sql`
        INSERT INTO public.collection_osp_targets (
          id, source_scope_hash, source_import_ids, period_from, period_to,
          aging_bucket, total_osp_baseline, target_percentage, configured_by,
          created_at, updated_at
        ) VALUES (
          ${randomUUID()}::uuid,
          ${sourceScopeHash},
          ${buildTextArraySql(sourceImportIds)},
          ${input.from}::date,
          ${input.to}::date,
          ${target.agingBucket},
          ${target.totalOspBaseline},
          ${target.targetPercentage},
          ${input.configuredBy},
          now(),
          now()
        )
        ON CONFLICT (source_scope_hash, period_from, period_to, aging_bucket)
        DO UPDATE SET
          source_import_ids = EXCLUDED.source_import_ids,
          total_osp_baseline = EXCLUDED.total_osp_baseline,
          target_percentage = EXCLUDED.target_percentage,
          configured_by = EXCLUDED.configured_by,
          updated_at = now()
      `);
    }
  });
  return input.targets;
}
