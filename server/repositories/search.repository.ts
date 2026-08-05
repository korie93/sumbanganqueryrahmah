import { sql, type SQL } from "drizzle-orm";
import { db, dbRead } from "../db-postgres";
import {
  buildSavedCollectionLookupTerms,
  selectSavedCollectionSourceMatch,
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
  type SearchDataRow,
  type SearchGlobalDataRow,
  type SavedCollectionSourceCandidate,
  type SavedCollectionSourceLookup,
  type SavedCollectionSourceMatch,
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

  async findSavedCollectionSourceForRecord(
    lookup: SavedCollectionSourceLookup,
  ): Promise<SavedCollectionSourceMatch | null> {
    const terms = buildSavedCollectionLookupTerms(lookup);
    if (terms.length === 0) {
      return null;
    }

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
        AND (${sql.join(termConditions, sql` OR `)})
      ORDER BY imp.created_at DESC, dr.id DESC
      LIMIT ${MAX_SEARCH_COLLECTION_STATUS_CANDIDATES}
    `);

    const candidates = (result.rows || []).map((row): SavedCollectionSourceCandidate => {
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

    return selectSavedCollectionSourceMatch(lookup, candidates);
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
      )
      SELECT
        candidate.row_id,
        matched.record_count,
        matched.payment_date,
        matched.created_at,
        matched.collection_staff_nickname,
        matched.created_by_login,
        matched.account_number,
        matched.account_number_encrypted,
        matched.amount,
        matched.source_import_name,
        matched.source_filename,
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
          record.amount,
          record.source_import_name,
          record.source_filename,
          CASE
            WHEN record.source_data_row_id = candidate.row_id
              THEN 'source_row'
            WHEN record.source_import_id = candidate.source_import_id
              THEN 'source_and_identifier'
            ELSE 'identifier_only'
          END AS match_basis,
          COUNT(*) OVER()::int AS record_count
        FROM public.collection_records record
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
        latestAmount: value.amount == null ? null : String(value.amount),
        sourceImportName: typeof value.source_import_name === "string"
          ? value.source_import_name
          : null,
        sourceFilename: typeof value.source_filename === "string"
          ? value.source_filename
          : null,
        matchBasis: value.match_basis === "source_row"
          ? "source_row"
          : value.match_basis === "identifier_only"
            ? "identifier_only"
            : "source_and_identifier",
      };
    }).filter((match) => match.rowId);
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
