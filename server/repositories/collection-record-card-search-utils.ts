import { sql } from "drizzle-orm";
import type { CollectionRecordCardSearchLink } from "../storage-postgres-collection-types";
import type { CollectionRepositoryExecutor } from "./collection-nickname-utils";
import type { CollectionRecordFilters } from "./collection-record-query-shared";
import { buildCollectionRecordConditions } from "./collection-record-query-filter-utils";
import { verifyCollectionRecordSourceIdentity } from "./collection-record-source-account-utils";
import {
  hashCollectionSourceIdentifier,
  normalizeCollectionSourceIdentifier,
} from "./collection-source-repository-utils";

// ECMAScript whitespace used by the existing source identifier normalizer.
const SOURCE_WHITESPACE = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

/**
 * Resolve only exact-card candidate SOURCE identities, not Collection rows.
 * Authorization/filter scopes are applied in SQL before reading candidates.
 * The indexed hash handles configured sources; historical links with no index
 * use an exact JSON comparison on their own linked row (never arbitrary Saved
 * files). Canonical parsing/HMAC verification stays identical to display and
 * keeps keys out of SQL. Rows AND counts then filter by these verified triples
 * in SQL before ordering/pagination; there is no post-page filtering or N+1.
 */
export async function resolveCollectionRecordCardSearchLinks(
  executor: CollectionRepositoryExecutor,
  filters: CollectionRecordFilters,
): Promise<CollectionRecordCardSearchLink[]> {
  const search = normalizeCollectionSourceIdentifier(filters.search);
  if (!search || search.length > 256) return [];
  const cardHash = hashCollectionSourceIdentifier(search, "card_number");
  if (!cardHash) return [];
  const scope = buildCollectionRecordConditions({ ...filters, search: undefined, cardSearchSourceLinks: undefined });
  const result = await executor.execute(sql`
    WITH scoped_links AS (
      SELECT DISTINCT record.source_import_id, record.source_data_row_id,
        record.source_obligation_key AS record_obligation_key
      FROM public.collection_records record
      WHERE record.source_import_id IS NOT NULL
        AND record.source_data_row_id IS NOT NULL
        AND (record.source_obligation_key LIKE 'account:%' OR record.source_obligation_key LIKE 'card:%')
        ${scope.length ? sql`AND ${sql.join(scope, sql` AND `)}` : sql``}
    )
    SELECT target.source_import_id, target.source_data_row_id, target.record_obligation_key,
      source_data.json_data AS source_json_data,
      source_index.card_number_hash AS source_card_number_hash,
      source_index.card_number_last4 AS source_card_number_last4,
      source_index.canonical_obligation_key AS source_obligation_key
    FROM scoped_links target
    JOIN public.data_rows source_data
      ON source_data.import_id = target.source_import_id
      AND source_data.id = target.source_data_row_id
    LEFT JOIN public.collection_source_rows source_index
      ON source_index.source_import_id = target.source_import_id
      AND source_index.source_data_row_id = target.source_data_row_id
    WHERE source_index.card_number_hash = ${cardHash}
      OR (
        NULLIF(btrim(source_index.card_number_hash), '') IS NULL
        AND NULLIF(btrim(source_index.card_number_last4), '') IS NULL
        AND NULLIF(btrim(source_index.canonical_obligation_key), '') IS NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_each_text(CASE
            WHEN jsonb_typeof(source_data.json_data::jsonb) = 'object'
              THEN source_data.json_data::jsonb ELSE '{}'::jsonb END) card_field
          WHERE regexp_replace(lower(normalize(card_field.key, NFKD)), '[^a-z0-9]', '', 'g')
            IN ('cardno', 'cardnumber', 'nocard', 'nomborkad')
            AND upper(translate(left(card_field.value, 256), ${SOURCE_WHITESPACE}, '')) = ${search}
        )
      )
  `);
  const verified = new Map<string, CollectionRecordCardSearchLink>();
  for (const raw of result.rows || []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const sourceImportId = String(row.source_import_id ?? "").trim();
    const sourceDataRowId = String(row.source_data_row_id ?? "").trim();
    const sourceObligationKey = String(row.record_obligation_key ?? "").trim();
    if (!sourceImportId || !sourceDataRowId || !sourceObligationKey) continue;
    const identity = verifyCollectionRecordSourceIdentity(row, sourceObligationKey);
    if (!identity?.cardNumber || identity.cardNumber !== search) continue;
    verified.set(JSON.stringify([sourceImportId, sourceDataRowId, sourceObligationKey]), {
      sourceImportId, sourceDataRowId, sourceObligationKey,
    });
  }
  return [...verified.values()];
}
