import { sql, type SQL } from "drizzle-orm";
import { db, dbRead } from "../db-postgres";
import {
  buildSavedCollectionLookupTerms,
  selectSavedCollectionSourceMatch,
  selectSavedCollectionSourceMatches,
} from "../lib/saved-collection-link-utils";
import { resolveCollectionPiiFieldValueFailClosed } from "../lib/collection-pii-encryption";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import {
  mapAdvancedSearchDataRow,
  mapSearchDataRow,
  mapSearchGlobalDataRow,
} from "./search-repository-mappers";
import {
  buildSearchFieldCondition,
  buildJsonTextContainsCondition,
  getSearchTotalFromRows,
  isSearchOffsetBeyondRuntimeWindow,
  MAX_SEARCH_COLUMN_KEYS,
  MAX_SEARCH_LIMIT,
  normalizeSearchOffset,
  SEARCH_ALLOWED_OPERATORS,
} from "./search-repository-shared";
import {
  MAX_SEARCH_COLLECTION_STATUS_CANDIDATES,
  type AdvancedSearchDataRow,
  type SearchColumnFilter,
  type SearchCollectionStatusCandidate,
  type SearchCollectionStatusMatch,
  type SearchCollectionViewerScope,
  type SearchCollectionHistoryPage,
  type SearchCollectionHistoryItem,
  type SearchCollectionHistorySourceRow,
  type SearchDataRow,
  type SearchGlobalDataRow,
  type SavedCollectionSourceCandidate,
  type SavedCollectionSourceLookup,
  type SavedCollectionSourceMatch,
  type CollectionSettlementProjection,
  type CollectionSettlementProjectionInput,
} from "./search-repository-types";

export { MAX_SEARCH_LIMIT, MAX_SEARCH_OFFSET } from "./search-repository-shared";
export type {
  SearchDataRow,
  SearchGlobalDataRow,
} from "./search-repository-types";

const ADVANCED_SEARCH_COLUMN_CACHE_TTL_MS = 60_000;

type ColumnNameCacheEntry = {
  columns: string[];
  expiresAt: number;
};

export class SearchRepository {
  private allColumnNamesCache: ColumnNameCacheEntry | null = null;

  private async loadSavedCollectionSourceCandidates(
    lookup: SavedCollectionSourceLookup,
  ): Promise<SavedCollectionSourceCandidate[]> {
    const terms = buildSavedCollectionLookupTerms(lookup);
    if (terms.length === 0) {
      return [];
    }

    const sourceImportId = String(lookup.sourceImportId || "").trim();
    const termConditions = terms.map((term) => buildJsonTextContainsCondition(term));
    const result = await db.execute(sql`
      SELECT
        dr.id AS row_id,
        dr.import_id AS source_import_id,
        dr.json_data AS json_data_jsonb,
        imp.name AS source_import_name,
        imp.filename AS source_filename,
        imp.created_at AS source_created_at
      FROM public.data_rows dr
      JOIN public.imports imp ON imp.id = dr.import_id
      WHERE imp.is_deleted = false
        ${sourceImportId ? sql`AND imp.id = ${sourceImportId}` : sql``}
        AND (${sql.join(termConditions, sql` OR `)})
      ORDER BY imp.created_at DESC, dr.id DESC
      LIMIT ${MAX_SEARCH_COLLECTION_STATUS_CANDIDATES}
    `);

    return (result.rows || []).map((row): SavedCollectionSourceCandidate => {
      const value = row as Record<string, unknown>;
      return {
        rowId: String(value.row_id || ""),
        sourceImportId: String(value.source_import_id || ""),
        sourceImportName: typeof value.source_import_name === "string" ? value.source_import_name : null,
        sourceFilename: typeof value.source_filename === "string" ? value.source_filename : null,
        sourceCreatedAt: value.source_created_at instanceof Date
          ? value.source_created_at
          : typeof value.source_created_at === "string"
            ? value.source_created_at
            : null,
        jsonDataJsonb: value.json_data_jsonb,
      };
    }).filter((candidate) => candidate.rowId && candidate.sourceImportId);
  }

  async findSavedCollectionSourcesForRecord(
    lookup: SavedCollectionSourceLookup,
  ): Promise<SavedCollectionSourceMatch[]> {
    const candidates = await this.loadSavedCollectionSourceCandidates(lookup);
    return selectSavedCollectionSourceMatches(lookup, candidates);
  }

  async findSavedCollectionSourceForRecord(
    lookup: SavedCollectionSourceLookup,
  ): Promise<SavedCollectionSourceMatch | null> {
    const candidates = await this.loadSavedCollectionSourceCandidates(lookup);
    return selectSavedCollectionSourceMatch(lookup, candidates);
  }

  async getCollectionSettlementProjection(
    input: CollectionSettlementProjectionInput,
  ): Promise<CollectionSettlementProjection> {
    const excludeRecordId = String(input.excludeRecordId || "").trim();
    const settlementCycleKey = String(input.settlementCycleKey || "").trim();
    const settlementScope = settlementCycleKey
      ? sql`record.settlement_cycle_key = ${settlementCycleKey}`
      : sql`
          record.source_import_id = ${input.sourceImportId}
          AND record.source_data_row_id = ${input.sourceDataRowId}
          AND record.calling_date = ${input.callingDate}::date
          AND record.calling_window_end_exclusive = ${input.callingWindowEndExclusive}::date
        `;
    const result = await db.execute(sql`
      WITH existing_settlement AS (
        SELECT
          COALESCE(SUM(record.amount), 0)::numeric(14,2) AS existing_cumulative,
          COALESCE(
            SUM(record.amount) FILTER (
              WHERE record.payment_date <= ${input.paymentDate}::date
            ),
            0
          )::numeric(14,2) AS prior_cumulative
        FROM public.collection_records record
        WHERE ${settlementScope}
          AND record.payment_date >= ${input.callingDate}::date
          AND record.payment_date < ${input.callingWindowEndExclusive}::date
          AND record.source_match_basis IS NOT NULL
          AND record.total_due IS NOT NULL
          AND record.duplicate_receipt_flag = false
          AND (${excludeRecordId} = '' OR record.id::text <> ${excludeRecordId})
      ), projected_settlement AS (
        SELECT
          existing_cumulative,
          prior_cumulative,
          ${input.currentAmount}::numeric(14,2) AS current_entry,
          (existing_cumulative + ${input.currentAmount}::numeric(14,2))::numeric(14,2)
            AS projected_cumulative,
          ${input.totalDue}::numeric(14,2) AS total_due
        FROM existing_settlement
      )
      SELECT
        existing_cumulative::text AS existing_cumulative,
        current_entry::text AS current_entry,
        projected_cumulative::text AS projected_cumulative,
        GREATEST(total_due - projected_cumulative, 0)::numeric(14,2)::text AS remaining_after_save,
        projected_cumulative >= total_due AS projected_total_due_covered,
        prior_cumulative < total_due
          AND prior_cumulative + current_entry >= total_due AS projected_entry_is_abort
      FROM projected_settlement
    `);

    const row = (result.rows?.[0] || {}) as Record<string, unknown>;
    const covered = row.projected_total_due_covered === true;
    const existingCumulative = String(row.existing_cumulative || "0.00");
    return {
      existingCumulative,
      currentEntry: String(row.current_entry || input.currentAmount),
      projectedCumulative: String(row.projected_cumulative || input.currentAmount),
      remainingAfterSave: String(row.remaining_after_save || "0.00"),
      projectedTotalDueCovered: covered,
      projectedCpStatus: row.projected_entry_is_abort === true ? "abort_cp" : "cp",
    };
  }

  async findCollectionStatusesForRows(
    candidates: SearchCollectionStatusCandidate[],
    viewerScope: SearchCollectionViewerScope,
  ): Promise<SearchCollectionStatusMatch[]> {
    const boundedCandidates = candidates.slice(0, MAX_SEARCH_COLLECTION_STATUS_CANDIDATES);
    if (boundedCandidates.length === 0 || viewerScope.kind === "none") {
      return [];
    }

    const scopeCondition = viewerScope.kind === "all"
      ? sql`true`
      : viewerScope.kind === "created_by"
        ? sql`lower(record.created_by_login) = ${viewerScope.username.trim().toLowerCase()}`
        : viewerScope.nicknames.length > 0
          ? sql`lower(record.collection_staff_nickname) IN (${sql.join(
              viewerScope.nicknames.slice(0, 200).map((nickname) => sql`${nickname.trim().toLowerCase()}`),
              sql`, `,
            )})`
          : sql`false`;

    const candidateJson = JSON.stringify(boundedCandidates.map((candidate) => ({
      row_id: candidate.rowId,
      source_import_id: candidate.sourceImportId,
      ic_hash: candidate.icHash,
      ic_value: candidate.icValue,
      phone_hash: candidate.phoneHash,
      phone_value: candidate.phoneValue,
      account_hashes: candidate.accountHashes,
      account_values: candidate.accountValues,
    })));
    const result = await dbRead.execute(sql`
      WITH candidates AS (
        SELECT *
        FROM jsonb_to_recordset(${candidateJson}::jsonb) AS candidate(
          row_id text,
          source_import_id text,
          ic_hash text,
          ic_value text,
          phone_hash text,
          phone_value text,
          account_hashes jsonb,
          account_values jsonb
        )
      ),
      collection_status_records AS (
        SELECT
          id,
          source_import_id,
          source_data_row_id,
          source_import_name,
          source_filename,
          ic_number,
          ic_number_search_hash,
          customer_phone,
          customer_phone_search_hash,
          account_number,
          account_number_encrypted,
          account_number_search_hash,
          payment_date,
          amount,
          created_by_login,
          collection_staff_nickname,
          created_at,
          false AS is_historical,
          NULL::timestamptz AS purged_at,
          NULL::text AS purged_by
        FROM public.collection_records

        UNION ALL

        SELECT
          original_record_id AS id,
          source_import_id,
          source_data_row_id,
          source_import_name,
          source_filename,
          NULL::text AS ic_number,
          ic_number_search_hash,
          NULL::text AS customer_phone,
          customer_phone_search_hash,
          NULL::text AS account_number,
          NULL::text AS account_number_encrypted,
          account_number_search_hash,
          payment_date,
          amount,
          created_by_login,
          collection_staff_nickname,
          original_created_at AS created_at,
          true AS is_historical,
          purged_at,
          purged_by
        FROM public.collection_record_purge_history
      )
      SELECT
        candidate.row_id,
        matched.record_count,
        matched.is_historical,
        matched.payment_date,
        matched.created_at,
        matched.collection_staff_nickname,
        matched.created_by_login,
        matched.account_number,
        matched.account_number_encrypted,
        matched.account_number_search_hash,
        matched.amount,
        matched.source_import_name,
        matched.source_filename,
        matched.purged_at,
        matched.purged_by,
        matched.match_basis
      FROM candidates candidate
      JOIN LATERAL (
        SELECT
          record.payment_date,
          record.created_at,
          record.collection_staff_nickname,
          record.created_by_login,
          ${buildProtectedCollectionPiiSelect(
            "account_number",
            "account_number_encrypted",
            "account_number",
            "accountNumber",
          )},
          record.account_number_encrypted,
          record.account_number_search_hash,
          record.amount,
          record.source_import_name,
          record.source_filename,
          record.is_historical,
          record.purged_at,
          record.purged_by,
          CASE
            WHEN record.source_data_row_id = candidate.row_id
              THEN 'source_row'
            WHEN record.source_import_id = candidate.source_import_id
              THEN 'source_and_identifier'
            ELSE 'identifier_only'
          END AS match_basis,
          COUNT(*) OVER ()::int AS record_count
        FROM collection_status_records record
        CROSS JOIN LATERAL (
          SELECT regexp_replace(COALESCE(record.customer_phone, ''), '[^0-9]+', '', 'g') AS phone_digits
        ) normalized_record
        CROSS JOIN LATERAL (
          SELECT
            COALESCE((
              (candidate.ic_hash IS NOT NULL AND record.ic_number_search_hash = candidate.ic_hash)
              OR (
                record.ic_number_search_hash IS NULL
                AND candidate.ic_value IS NOT NULL
                AND regexp_replace(upper(COALESCE(record.ic_number, '')), '[^0-9A-Z]+', '', 'g') = candidate.ic_value
              )
            ), false) AS ic_match,
            COALESCE((
              (candidate.phone_hash IS NOT NULL AND record.customer_phone_search_hash = candidate.phone_hash)
              OR (
                record.customer_phone_search_hash IS NULL
                AND candidate.phone_value IS NOT NULL
                AND CASE
                  WHEN normalized_record.phone_digits LIKE '0060%' AND length(normalized_record.phone_digits) > 4
                    THEN '0' || substr(normalized_record.phone_digits, 5)
                  WHEN normalized_record.phone_digits LIKE '60%' AND length(normalized_record.phone_digits) > 2
                    THEN '0' || substr(normalized_record.phone_digits, 3)
                  ELSE normalized_record.phone_digits
                END = candidate.phone_value
              )
            ), false) AS phone_match,
            (
              jsonb_array_length(COALESCE(candidate.account_hashes, '[]'::jsonb)) > 0
              OR jsonb_array_length(COALESCE(candidate.account_values, '[]'::jsonb)) > 0
            ) AS account_candidate_present,
            COALESCE((
              (
                record.account_number_search_hash IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(
                    COALESCE(candidate.account_hashes, '[]'::jsonb)
                  ) candidate_account_hash(value)
                  WHERE candidate_account_hash.value = record.account_number_search_hash
                )
              )
              OR (
                record.account_number_search_hash IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(
                    COALESCE(candidate.account_values, '[]'::jsonb)
                  ) candidate_account_value(value)
                  WHERE candidate_account_value.value = regexp_replace(
                    upper(COALESCE(record.account_number, '')),
                    '\\s+',
                    '',
                    'g'
                  )
                )
              )
            ), false) AS account_match
        ) identity_match
        WHERE ${scopeCondition}
          AND (
            record.source_data_row_id = candidate.row_id
            OR (
              record.source_import_id = candidate.source_import_id
              AND (identity_match.ic_match OR identity_match.phone_match OR identity_match.account_match)
              AND (NOT identity_match.account_candidate_present OR identity_match.account_match)
            )
            OR (
              identity_match.ic_match
              AND (NOT identity_match.account_candidate_present OR identity_match.account_match)
            )
            OR (identity_match.phone_match AND identity_match.account_match)
          )
        ORDER BY
          record.is_historical ASC,
          record.payment_date DESC,
          record.created_at DESC,
          CASE
            WHEN record.source_data_row_id = candidate.row_id THEN 3
            WHEN record.source_import_id = candidate.source_import_id THEN 2
            ELSE 1
          END DESC,
          record.id DESC
        LIMIT 1
      ) matched ON true
    `);

    return (result.rows || []).map((row): SearchCollectionStatusMatch => {
      const value = row as Record<string, unknown>;
      const createdAt = value.created_at;
      return {
        rowId: String(value.row_id || ""),
        recordCount: Math.max(1, Number(value.record_count || 1)),
        isHistorical: value.is_historical === true,
        latestPaymentDate: value.payment_date == null ? null : String(value.payment_date),
        latestCreatedAt: createdAt instanceof Date
          ? createdAt.toISOString()
          : createdAt == null
            ? null
            : String(createdAt),
        latestStaffNickname: typeof value.collection_staff_nickname === "string"
          ? value.collection_staff_nickname
          : null,
        latestCreatedByLogin: typeof value.created_by_login === "string"
          ? value.created_by_login
          : null,
        latestAccountNumber: resolveCollectionPiiFieldValueFailClosed({
          field: "accountNumber",
          plaintext: value.account_number,
          encrypted: value.account_number_encrypted,
        }) || null,
        matchedAccountHash: typeof value.account_number_search_hash === "string"
          ? value.account_number_search_hash
          : null,
        latestAmount: value.amount == null ? null : String(value.amount),
        sourceImportName: typeof value.source_import_name === "string"
          ? value.source_import_name
          : null,
        sourceFilename: typeof value.source_filename === "string"
          ? value.source_filename
          : null,
        purgedAt: value.purged_at instanceof Date
          ? value.purged_at.toISOString()
          : typeof value.purged_at === "string"
            ? value.purged_at
            : null,
        purgedBy: typeof value.purged_by === "string" ? value.purged_by : null,
        matchBasis: value.match_basis === "source_row"
          ? "source_row"
          : value.match_basis === "identifier_only"
            ? "identifier_only"
            : "source_and_identifier",
      };
    }).filter((match) => match.rowId);
  }

  async findCollectionHistorySourceRow(params: {
    sourceImportId: string;
    sourceDataRowId: string;
  }): Promise<SearchCollectionHistorySourceRow | null> {
    const result = await dbRead.execute(sql`
      SELECT
        data_row.id,
        data_row.import_id,
        data_row.json_data AS json_data_jsonb,
        source_row.canonical_obligation_key
      FROM public.data_rows data_row
      JOIN public.imports source_import
        ON source_import.id = data_row.import_id
        AND source_import.is_deleted = false
      LEFT JOIN public.collection_source_rows source_row
        ON source_row.source_import_id = data_row.import_id
        AND source_row.source_data_row_id = data_row.id
      WHERE data_row.import_id = ${params.sourceImportId}
        AND data_row.id = ${params.sourceDataRowId}
      LIMIT 1
    `);
    const row = result.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id || ""),
      importId: String(row.import_id || ""),
      jsonDataJsonb: row.json_data_jsonb,
      sourceObligationKey: typeof row.canonical_obligation_key === "string"
        ? row.canonical_obligation_key
        : null,
    };
  }

  async findCollectionHistoryForRow(params: {
    candidate: SearchCollectionStatusCandidate;
    sourceObligationKey: string | null;
    viewerScope: SearchCollectionViewerScope;
    includeManualAuditDetails: boolean;
    includeSourceDetails: boolean;
    page: number;
    pageSize: number;
  }): Promise<SearchCollectionHistoryPage> {
    const page = Math.max(1, Math.min(10_000, Math.trunc(params.page)));
    const pageSize = Math.max(1, Math.min(50, Math.trunc(params.pageSize)));
    const offset = (page - 1) * pageSize;
    if (params.viewerScope.kind === "none") {
      return {
        items: [],
        summary: {
          recordCount: 0,
          activeRecordCount: 0,
          historicalRecordCount: 0,
          poolContributionCount: 0,
          collectionAmount: "0.00",
          poolAmount: "0.00",
          totalCoveredAmount: "0.00",
          effectiveStatus: "unclassified",
        },
        page,
        pageSize,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: page > 1,
      };
    }

    const buildScopeCondition = (): SQL => {
      if (params.viewerScope.kind === "all") return sql`true`;
      if (params.viewerScope.kind === "created_by") {
        return sql`lower(record.created_by_login) = ${params.viewerScope.username.trim().toLowerCase()}`;
      }
      if (params.viewerScope.kind === "nicknames" && params.viewerScope.nicknames.length > 0) {
        return sql`lower(record.collection_staff_nickname) IN (${sql.join(
          params.viewerScope.nicknames.slice(0, 200).map((nickname) => sql`${nickname.trim().toLowerCase()}`),
          sql`, `,
        )})`;
      }
      return sql`false`;
    };
    const scopeCondition = buildScopeCondition();
    const sourceObligationKey = String(params.sourceObligationKey || "").trim();
    // Once the governed source index supplies a canonical obligation, an
    // account-number fallback is too broad: one account can contain multiple
    // cards/contracts. Use fallback identifiers only for legacy source rows
    // that genuinely have no canonical obligation identity.
    const allowAccountFallback = sourceObligationKey === "";
    const accountHashCondition = allowAccountFallback && params.candidate.accountHashes.length > 0
      ? sql`record.account_number_search_hash IN (${sql.join(
          params.candidate.accountHashes.slice(0, 8).map((hash) => sql`${hash}`),
          sql`, `,
        )})`
      : sql`false`;
    const accountValueCondition = allowAccountFallback && params.candidate.accountValues.length > 0
      ? sql`
          record.account_number_search_hash IS NULL
          AND regexp_replace(upper(COALESCE(record.account_number, '')), '\\s+', '', 'g') IN (${sql.join(
            params.candidate.accountValues.slice(0, 8).map((value) => sql`${value}`),
            sql`, `,
          )})
        `
      : sql`false`;
    const purgeAccountHashCondition = allowAccountFallback && params.candidate.accountHashes.length > 0
      ? sql`record.account_number_search_hash IN (${sql.join(
          params.candidate.accountHashes.slice(0, 8).map((hash) => sql`${hash}`),
          sql`, `,
        )})`
      : sql`false`;
    const manualReasonSelect = params.includeManualAuditDetails
      ? sql`record.manual_settlement_reason`
      : sql`NULL::text`;
    const manualNoteSelect = params.includeManualAuditDetails
      ? sql`record.manual_settlement_note`
      : sql`NULL::text`;
    const manualReferenceSelect = params.includeManualAuditDetails
      ? sql`record.manual_settlement_reference`
      : sql`NULL::text`;
    const sourceNameSelect = params.includeSourceDetails
      ? sql`record.source_import_name`
      : sql`NULL::text`;
    const sourceFilenameSelect = params.includeSourceDetails
      ? sql`record.source_filename`
      : sql`NULL::text`;

    const result = await dbRead.execute(sql`
      WITH matched_active_base AS (
        SELECT record.*
        FROM public.collection_records record
        WHERE ${scopeCondition}
          AND (
            (
              record.source_import_id = ${params.candidate.sourceImportId}
              AND record.source_data_row_id = ${params.candidate.rowId}
            )
            OR (${sourceObligationKey} <> '' AND record.source_obligation_key = ${sourceObligationKey})
            OR (${sourceObligationKey} = '' AND (
              (${accountHashCondition})
              OR (${accountValueCondition})
            ))
          )
      ),
      relevant_cycles AS (
        SELECT DISTINCT settlement_cycle_key
        FROM matched_active_base
        WHERE settlement_cycle_key IS NOT NULL
      ),
      cycle_overrides AS (
        SELECT DISTINCT ON (record.settlement_cycle_key)
          record.settlement_cycle_key,
          record.settlement_override_status,
          record.pool_amount,
          record.total_due,
          record.manual_settlement_date,
          record.manual_settlement_verified_by,
          record.manual_settlement_verified_at
        FROM public.collection_records record
        JOIN relevant_cycles cycle
          ON cycle.settlement_cycle_key = record.settlement_cycle_key
        WHERE record.settlement_override_status IS NOT NULL
        ORDER BY
          record.settlement_cycle_key,
          (record.settlement_override_status = 'ACTIVE') DESC,
          record.manual_settlement_updated_at DESC NULLS LAST,
          record.manual_settlement_verified_at DESC NULLS LAST,
          record.id DESC
      ),
      cycle_collection_totals AS (
        SELECT
          override_row.settlement_cycle_key,
          COALESCE(SUM(record.amount) FILTER (
            WHERE record.source_match_basis IS NOT NULL
              AND record.total_due IS NOT NULL
              AND record.duplicate_receipt_flag = false
              AND record.calling_date IS NOT NULL
              AND record.calling_window_end_exclusive IS NOT NULL
              AND record.payment_date >= record.calling_date
              AND record.payment_date < record.calling_window_end_exclusive
              AND record.payment_date <= override_row.manual_settlement_date
          ), 0)::numeric(14,2) AS collection_amount,
          COALESCE(BOOL_OR(record.classification = 'abort_cp'), false)
            AS has_automatic_abort
        FROM cycle_overrides override_row
        LEFT JOIN public.collection_records record
          ON record.settlement_cycle_key = override_row.settlement_cycle_key
        GROUP BY override_row.settlement_cycle_key
      ),
      cycle_state AS (
        SELECT
          cycle.settlement_cycle_key,
          COALESCE(total.collection_amount, 0)::numeric(14,2) AS collection_amount,
          COALESCE(total.has_automatic_abort, false) AS has_automatic_abort,
          override_row.settlement_override_status,
          override_row.pool_amount,
          override_row.manual_settlement_date,
          (
            override_row.settlement_override_status = 'ACTIVE'
            AND override_row.pool_amount > 0
            AND override_row.total_due > 0
            AND override_row.manual_settlement_date IS NOT NULL
            AND override_row.manual_settlement_verified_by IS NOT NULL
            AND override_row.manual_settlement_verified_at IS NOT NULL
            AND NOT COALESCE(total.has_automatic_abort, false)
            AND COALESCE(total.collection_amount, 0) + override_row.pool_amount >= override_row.total_due
          ) AS manual_is_valid
        FROM relevant_cycles cycle
        LEFT JOIN cycle_collection_totals total USING (settlement_cycle_key)
        LEFT JOIN cycle_overrides override_row USING (settlement_cycle_key)
      ),
      active_history AS (
        SELECT
          record.id::text AS item_id,
          'collection'::text AS item_kind,
          false AS is_historical,
          record.payment_date,
          record.created_at,
          record.amount,
          CASE
            WHEN record.classification = 'abort_cp' THEN 'automatic'
            WHEN COALESCE(cycle.has_automatic_abort, false) THEN 'automatic'
            WHEN cycle.manual_is_valid THEN 'manual_verified_abort'
            WHEN cycle.settlement_override_status = 'ACTIVE' THEN 'manual_verified_abort'
            ELSE 'automatic'
          END::text AS classification_source,
          record.classification AS automatic_classification,
          CASE
            WHEN record.classification = 'abort_cp' THEN 'abort_cp'
            WHEN cycle.manual_is_valid THEN 'abort_cp'
            WHEN COALESCE(cycle.has_automatic_abort, false) AND record.classification = 'cp' THEN 'cp'
            WHEN cycle.settlement_override_status = 'ACTIVE' THEN 'requires_revalidation'
            WHEN record.classification = 'cp' THEN 'cp'
            ELSE 'unclassified'
          END::text AS effective_status,
          CASE
            WHEN cycle.manual_is_valid THEN cycle.manual_settlement_date
            WHEN record.classification = 'abort_cp' THEN record.payment_date
            ELSE NULL::date
          END AS settlement_date,
          record.collection_staff_nickname,
          record.created_by_login,
          ${sourceNameSelect} AS source_import_name,
          ${sourceFilenameSelect} AS source_filename,
          NULL::timestamptz AS purged_at,
          NULL::text AS purged_by,
          NULL::text AS manual_reason,
          NULL::text AS manual_note,
          NULL::text AS manual_reference
        FROM matched_active_base record
        LEFT JOIN cycle_state cycle USING (settlement_cycle_key)
      ),
      pool_history AS (
        SELECT
          ('pool:' || record.id::text || ':' || record.manual_settlement_version::text) AS item_id,
          'pool'::text AS item_kind,
          false AS is_historical,
          record.manual_settlement_date AS payment_date,
          COALESCE(
            record.manual_settlement_updated_at,
            record.manual_settlement_verified_at,
            record.created_at
          ) AS created_at,
          record.pool_amount AS amount,
          'manual_verified_abort'::text AS classification_source,
          NULL::text AS automatic_classification,
          CASE
            WHEN record.settlement_override_status = 'REVOKED' THEN 'revoked'
            WHEN COALESCE(cycle.has_automatic_abort, false) THEN 'superseded_by_automatic'
            WHEN cycle.manual_is_valid THEN 'abort_cp'
            ELSE 'requires_revalidation'
          END::text AS effective_status,
          record.manual_settlement_date AS settlement_date,
          NULL::text AS collection_staff_nickname,
          COALESCE(record.manual_settlement_updated_by, record.manual_settlement_verified_by)
            AS created_by_login,
          ${sourceNameSelect} AS source_import_name,
          ${sourceFilenameSelect} AS source_filename,
          record.manual_settlement_revoked_at AS purged_at,
          record.manual_settlement_revoked_by AS purged_by,
          ${manualReasonSelect} AS manual_reason,
          ${manualNoteSelect} AS manual_note,
          ${manualReferenceSelect} AS manual_reference
        FROM matched_active_base record
        LEFT JOIN cycle_state cycle USING (settlement_cycle_key)
        WHERE record.settlement_override_status IS NOT NULL
          AND record.pool_amount IS NOT NULL
          AND record.manual_settlement_date IS NOT NULL
      ),
      purge_history AS (
        SELECT
          record.original_record_id::text AS item_id,
          'collection'::text AS item_kind,
          true AS is_historical,
          record.payment_date,
          record.original_created_at AS created_at,
          record.amount,
          'automatic'::text AS classification_source,
          record.automatic_classification,
          CASE
            WHEN record.automatic_classification = 'abort_cp' THEN 'abort_cp'
            WHEN record.automatic_classification = 'cp' THEN 'cp'
            ELSE 'historical'
          END::text AS effective_status,
          CASE
            WHEN record.automatic_classification = 'abort_cp' THEN record.payment_date
            ELSE NULL::date
          END AS settlement_date,
          record.collection_staff_nickname,
          record.created_by_login,
          ${sourceNameSelect} AS source_import_name,
          ${sourceFilenameSelect} AS source_filename,
          record.purged_at,
          record.purged_by,
          NULL::text AS manual_reason,
          NULL::text AS manual_note,
          NULL::text AS manual_reference
        FROM public.collection_record_purge_history record
        WHERE ${scopeCondition}
          AND (
            (
              record.source_import_id = ${params.candidate.sourceImportId}
              AND record.source_data_row_id = ${params.candidate.rowId}
            )
            OR (${sourceObligationKey} <> '' AND record.source_obligation_key = ${sourceObligationKey})
            OR (${sourceObligationKey} = '' AND (${purgeAccountHashCondition}))
          )
      ),
      purged_pool_history AS (
        SELECT
          ('pool:' || record.original_record_id::text || ':' || record.manual_settlement_version::text)
            AS item_id,
          'pool'::text AS item_kind,
          true AS is_historical,
          record.manual_settlement_date AS payment_date,
          COALESCE(
            record.manual_settlement_updated_at,
            record.manual_settlement_verified_at,
            record.original_created_at
          ) AS created_at,
          record.pool_amount AS amount,
          'manual_verified_abort'::text AS classification_source,
          NULL::text AS automatic_classification,
          CASE
            WHEN record.settlement_override_status = 'REVOKED' THEN 'revoked'
            ELSE 'historical'
          END::text AS effective_status,
          record.manual_settlement_date AS settlement_date,
          NULL::text AS collection_staff_nickname,
          COALESCE(record.manual_settlement_updated_by, record.manual_settlement_verified_by)
            AS created_by_login,
          ${sourceNameSelect} AS source_import_name,
          ${sourceFilenameSelect} AS source_filename,
          record.manual_settlement_revoked_at AS purged_at,
          record.manual_settlement_revoked_by AS purged_by,
          ${manualReasonSelect} AS manual_reason,
          ${manualNoteSelect} AS manual_note,
          ${manualReferenceSelect} AS manual_reference
        FROM public.collection_record_purge_history record
        WHERE record.settlement_override_status IS NOT NULL
          AND record.pool_amount IS NOT NULL
          AND record.manual_settlement_date IS NOT NULL
          AND ${scopeCondition}
          AND (
            (
              record.source_import_id = ${params.candidate.sourceImportId}
              AND record.source_data_row_id = ${params.candidate.rowId}
            )
            OR (${sourceObligationKey} <> '' AND record.source_obligation_key = ${sourceObligationKey})
            OR (${sourceObligationKey} = '' AND (${purgeAccountHashCondition}))
          )
      ),
      history_rows AS (
        SELECT * FROM active_history
        UNION ALL
        SELECT * FROM pool_history
        UNION ALL
        SELECT * FROM purge_history
        UNION ALL
        SELECT * FROM purged_pool_history
      ),
      history_summary AS (
        SELECT
          COUNT(*)::int AS history_item_count,
          COUNT(*) FILTER (WHERE item_kind = 'collection')::int AS record_count,
          COUNT(*) FILTER (WHERE item_kind = 'collection' AND NOT is_historical)::int
            AS active_record_count,
          COUNT(*) FILTER (WHERE item_kind = 'collection' AND is_historical)::int
            AS historical_record_count,
          COUNT(*) FILTER (WHERE item_kind = 'pool')::int AS pool_contribution_count,
          COALESCE(SUM(amount) FILTER (
            WHERE item_kind = 'collection'
          ), 0)::numeric(14,2) AS collection_amount,
          COALESCE(SUM(amount) FILTER (
            WHERE item_kind = 'pool' AND effective_status = 'abort_cp'
          ), 0)::numeric(14,2) AS pool_amount
        FROM history_rows
      ),
      paged_history AS (
        SELECT *
        FROM history_rows
        ORDER BY payment_date DESC, created_at DESC, item_id DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      )
      SELECT
        summary.history_item_count,
        summary.record_count,
        summary.active_record_count,
        summary.historical_record_count,
        summary.pool_contribution_count,
        summary.collection_amount::text AS summary_collection_amount,
        summary.pool_amount::text AS summary_pool_amount,
        (summary.collection_amount + summary.pool_amount)::numeric(14,2)::text
          AS summary_total_covered_amount,
        COALESCE((
          SELECT current_record.effective_status
          FROM history_rows current_record
          WHERE current_record.item_kind = 'collection'
            AND NOT current_record.is_historical
          ORDER BY
            current_record.payment_date DESC,
            current_record.created_at DESC,
            current_record.item_id DESC
          LIMIT 1
        ), CASE WHEN summary.historical_record_count > 0 THEN 'historical' ELSE 'unclassified' END)
          AS summary_effective_status,
        history.item_id,
        history.item_kind,
        history.is_historical,
        history.payment_date,
        history.created_at,
        history.amount::text,
        history.classification_source,
        history.automatic_classification,
        history.effective_status,
        history.settlement_date,
        history.collection_staff_nickname,
        history.created_by_login,
        history.source_import_name,
        history.source_filename,
        history.purged_at,
        history.purged_by,
        history.manual_reason,
        history.manual_note,
        history.manual_reference
      FROM history_summary summary
      LEFT JOIN paged_history history ON true
      ORDER BY history.payment_date DESC, history.created_at DESC, history.item_id DESC
    `);

    const rows = (result.rows || []) as Array<Record<string, unknown>>;
    const summaryRow = rows[0] || {};
    const total = Math.max(0, Number(summaryRow.history_item_count || 0));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const toIso = (value: unknown): string | null => value instanceof Date
      ? value.toISOString()
      : value == null
        ? null
        : String(value);
    const items = rows.flatMap((row) => {
      const id = String(row.item_id || "");
      if (!id) return [];
      const automaticClassification: "cp" | "abort_cp" | null = row.automatic_classification === "cp"
        || row.automatic_classification === "abort_cp"
        ? row.automatic_classification
        : null;
      const effectiveStatus: SearchCollectionHistoryItem["effectiveStatus"] = row.effective_status === "cp"
        || row.effective_status === "abort_cp"
        || row.effective_status === "requires_revalidation"
        || row.effective_status === "superseded_by_automatic"
        || row.effective_status === "revoked"
        || row.effective_status === "historical"
        ? row.effective_status
        : "unclassified";
      return [{
        id,
        kind: row.item_kind === "pool" ? "pool" as const : "collection" as const,
        isHistorical: row.is_historical === true,
        paymentDate: String(row.payment_date || ""),
        createdAt: toIso(row.created_at) || "",
        amount: String(row.amount || "0.00"),
        classificationSource: row.classification_source === "manual_verified_abort"
          ? "manual_verified_abort" as const
          : "automatic" as const,
        automaticClassification,
        effectiveStatus,
        settlementDate: row.settlement_date == null ? null : String(row.settlement_date),
        staffNickname: typeof row.collection_staff_nickname === "string"
          ? row.collection_staff_nickname
          : null,
        createdByLogin: typeof row.created_by_login === "string" ? row.created_by_login : null,
        sourceImportName: typeof row.source_import_name === "string" ? row.source_import_name : null,
        sourceFilename: typeof row.source_filename === "string" ? row.source_filename : null,
        purgedAt: toIso(row.purged_at),
        purgedBy: typeof row.purged_by === "string" ? row.purged_by : null,
        ...(params.includeManualAuditDetails
          ? {
              reason: typeof row.manual_reason === "string" ? row.manual_reason : null,
              note: typeof row.manual_note === "string" ? row.manual_note : null,
              reference: typeof row.manual_reference === "string" ? row.manual_reference : null,
            }
          : {}),
      }];
    });
    const summaryStatus = summaryRow.summary_effective_status === "cp"
      || summaryRow.summary_effective_status === "abort_cp"
      || summaryRow.summary_effective_status === "requires_revalidation"
      || summaryRow.summary_effective_status === "historical"
      ? summaryRow.summary_effective_status
      : "unclassified";

    return {
      items,
      summary: {
        recordCount: Math.max(0, Number(summaryRow.record_count || 0)),
        activeRecordCount: Math.max(0, Number(summaryRow.active_record_count || 0)),
        historicalRecordCount: Math.max(0, Number(summaryRow.historical_record_count || 0)),
        poolContributionCount: Math.max(0, Number(summaryRow.pool_contribution_count || 0)),
        collectionAmount: String(summaryRow.summary_collection_amount || "0.00"),
        poolAmount: String(summaryRow.summary_pool_amount || "0.00"),
        totalCoveredAmount: String(summaryRow.summary_total_covered_amount || "0.00"),
        effectiveStatus: summaryStatus,
      },
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  private async getGlobalSearchTotal(search: string): Promise<number> {
    const jsonSearchCondition = buildJsonTextContainsCondition(search);
    const totalResult = await dbRead.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND ${jsonSearchCondition}
    `);

    return getSearchTotalFromRows(totalResult.rows || []);
  }

  private async getImportSearchTotal(whereClause: SQL): Promise<number> {
    const totalResult = await dbRead.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      WHERE ${whereClause}
    `);

    return getSearchTotalFromRows(totalResult.rows || []);
  }

  private async getImportColumnNames(importId: string): Promise<Set<string>> {
    const result = await dbRead.execute(sql`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE dr.import_id = ${importId}
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_SEARCH_COLUMN_KEYS}
    `);

    return new Set(
      (result.rows || [])
        .map((row) => String((row as Record<string, unknown>).column_name || "").trim())
        .filter(Boolean),
    );
  }

  async searchGlobalDataRows(params: {
    search: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: SearchGlobalDataRow[]; total: number; totalIsApproximate: boolean }> {
    const { search, limit, offset } = params;
    const jsonSearchCondition = buildJsonTextContainsCondition(search);
    const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT));
    const safeOffset = normalizeSearchOffset(offset);

    if (isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      return {
        rows: [],
        total: await this.getGlobalSearchTotal(search),
        totalIsApproximate: false,
      };
    }

    const rowsResult = await dbRead.execute(sql`
      SELECT
        dr.id,
        dr.import_id,
        dr.json_data as json_data_jsonb,
        i.name as import_name,
        i.filename as import_filename
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND ${jsonSearchCondition}
      ORDER BY dr.id
      LIMIT ${safeLimit + 1}
      OFFSET ${safeOffset}
    `);

    const rawRows = (rowsResult.rows || []).map((row) =>
      mapSearchGlobalDataRow(row as Record<string, unknown>),
    );
    const hasMore = rawRows.length > safeLimit;
    const rows = hasMore ? rawRows.slice(0, safeLimit) : rawRows;
    let total = 0;
    if (hasMore) {
      total = safeOffset + rows.length + 1;
    } else if (rows.length > 0) {
      total = safeOffset + rows.length;
    } else if (safeOffset > 0) {
      total = await this.getGlobalSearchTotal(search);
    }

    return { rows, total, totalIsApproximate: hasMore };
  }

  async searchSimpleDataRows(search: string) {
    const jsonSearchCondition = buildJsonTextContainsCondition(search);
    return dbRead.execute(sql`
      SELECT
        dr.import_id as "importId",
        i.name as "importName",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND ${jsonSearchCondition}
      LIMIT ${MAX_SEARCH_LIMIT}
    `);
  }

  async searchDataRows(params: {
    importId: string;
    search?: string | null;
    limit: number;
    offset: number;
    columnFilters?: SearchColumnFilter[];
    cursor?: string | null;
  }): Promise<{ rows: SearchDataRow[]; total: number; nextCursorRowId: string | null }> {
    const { importId, search, limit, offset } = params;
    const trimmedSearch = search && search.trim() ? search.trim() : null;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const safeOffset = normalizeSearchOffset(offset);
    const cursor = String(params.cursor || "").trim() || null;
    const requestedColumnFilters = Array.isArray(params.columnFilters)
      ? params.columnFilters
          .map((filter) => ({
            column: String(filter?.column ?? "").trim(),
            operator: String(filter?.operator ?? "").trim(),
            value: String(filter?.value ?? "").trim(),
          }))
          .filter((filter) =>
            filter.column !== ""
            && filter.value !== ""
            && SEARCH_ALLOWED_OPERATORS.has(filter.operator),
          )
      : [];
    const allowedColumns = requestedColumnFilters.length > 0
      ? await this.getImportColumnNames(importId)
      : null;
    const safeColumnFilters = allowedColumns
      ? requestedColumnFilters.filter((filter) => allowedColumns.has(filter.column))
      : [];

    if (trimmedSearch && trimmedSearch.length < 2) {
      return { rows: [], total: 0, nextCursorRowId: null };
    }
    const conditions: SQL[] = [sql`dr.import_id = ${importId}`];

    if (trimmedSearch) {
      conditions.push(buildJsonTextContainsCondition(trimmedSearch));
    }

    for (const filter of safeColumnFilters) {
      conditions.push(buildSearchFieldCondition(filter.column, filter.operator, filter.value));
    }

    if (cursor) {
      conditions.push(sql`dr.id > ${cursor}`);
    }

    const whereClause = conditions.length === 1
      ? conditions[0]
      : sql.join(conditions, sql` AND `);

    if (!cursor && isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      return {
        rows: [],
        total: await this.getImportSearchTotal(whereClause),
        nextCursorRowId: null,
      };
    }

    const rowsResult = await dbRead.execute(sql`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb",
        COUNT(*) OVER()::int AS total
      FROM public.data_rows dr
      WHERE ${whereClause}
      ORDER BY dr.id
      LIMIT ${safeLimit + 1}
      ${cursor ? sql`` : sql`OFFSET ${safeOffset}`}
    `);

    const rawRows = (rowsResult.rows || []).map((row) =>
      mapSearchDataRow(row as Record<string, unknown>),
    );
    const hasMore = rawRows.length > safeLimit;
    const items = hasMore ? rawRows.slice(0, safeLimit) : rawRows;
    const total = rawRows.length > 0
      ? getSearchTotalFromRows(rowsResult.rows || [])
      : !cursor && safeOffset > 0
        ? await this.getImportSearchTotal(whereClause)
        : 0;

    return {
      rows: items,
      total,
      nextCursorRowId: hasMore ? String(items[items.length - 1]?.id || "") || null : null,
    };
  }

  async advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number,
  ): Promise<{ rows: AdvancedSearchDataRow[]; total: number }> {
    const allowedColumns = new Set(await this.getAllColumnNamesCached());

    const safeFilters = filters.filter((filter) =>
      allowedColumns.has(filter.field) && SEARCH_ALLOWED_OPERATORS.has(filter.operator),
    );

    if (safeFilters.length === 0) {
      return { rows: [], total: 0 };
    }

    const conditions = safeFilters.map((filter) =>
      buildSearchFieldCondition(filter.field, filter.operator, String(filter.value ?? "")),
    );

    const conditionSql = conditions.length === 1
      ? conditions[0]
      : sql.join(conditions, logic === "AND" ? sql` AND ` : sql` OR `);

    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const safeOffset = normalizeSearchOffset(offset);

    const totalResult = await dbRead.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${conditionSql})
    `);

    if (isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      return {
        rows: [],
        total: getSearchTotalFromRows(totalResult.rows || []),
      };
    }

    const rowsResult = await dbRead.execute(sql`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb",
        i.name as "importName",
        i.filename as "importFilename"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${conditionSql})
      ORDER BY dr.id
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `);

    return {
      rows: (rowsResult.rows || []).map((row) =>
        mapAdvancedSearchDataRow(row as Record<string, unknown>),
      ),
      total: getSearchTotalFromRows(totalResult.rows || []),
    };
  }

  async getAllColumnNames(): Promise<string[]> {
    const result = await dbRead.execute(sql`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE i.is_deleted = false
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_SEARCH_COLUMN_KEYS}
    `);

    return (result.rows || [])
      .map((row) => String((row as Record<string, unknown>).column_name || "").trim())
      .filter(Boolean);
  }

  private async getAllColumnNamesCached(): Promise<string[]> {
    const now = Date.now();
    if (this.allColumnNamesCache && this.allColumnNamesCache.expiresAt > now) {
      return this.allColumnNamesCache.columns;
    }

    const columns = await this.getAllColumnNames();
    this.allColumnNamesCache = {
      columns,
      expiresAt: now + ADVANCED_SEARCH_COLUMN_CACHE_TTL_MS,
    };
    return columns;
  }
}
