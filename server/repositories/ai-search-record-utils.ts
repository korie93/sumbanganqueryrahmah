import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { mapSearchRow, readRows } from "./ai-repository-mappers";
import type {
  AiFuzzySearchRow,
  AiSearchRecordRow,
  AiSemanticSearchRow,
} from "./ai-repository-types";

const IC_FIELDS = ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"];
const PHONE_FIELDS = [
  "No. Telefon Rumah",
  "No. Telefon Bimbit",
  "Telefon",
  "Phone",
  "HP",
  "Handphone",
  "OfficePhone",
];
const ACCOUNT_FIELDS = [
  "Nombor Akaun Bank Pemohon",
  "Account No",
  "Account Number",
  "No Akaun",
  "Card No",
];

export function resolveAiKeywordFields(digits: string): string[] {
  if (digits.length === 12) return IC_FIELDS;
  if (digits.length >= 9 && digits.length <= 11) return PHONE_FIELDS;
  return ACCOUNT_FIELDS;
}

export function tokenizeAiFuzzyQuery(query: string): string[] {
  return String(query || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, ""))
    .filter((token) => token.length >= 3);
}

export async function saveAiEmbeddingRow(params: {
  importId: string;
  rowId: string;
  content: string;
  embedding: number[];
}): Promise<void> {
  const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
  await db.execute(sql`
    INSERT INTO public.data_embeddings (id, import_id, row_id, content, embedding, created_at)
    VALUES (${crypto.randomUUID()}, ${params.importId}, ${params.rowId}, ${params.content}, ${embeddingLiteral}::vector, ${new Date()})
    ON CONFLICT (row_id) DO UPDATE SET
      import_id = EXCLUDED.import_id,
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding
  `);
}

export async function semanticSearchRows(params: {
  embedding: number[];
  limit: number;
  importId?: string | null;
}): Promise<AiSemanticSearchRow[]> {
  const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
  const importFilter = params.importId ? sql`AND e.import_id = ${params.importId}` : sql``;

  try {
    await db.execute(sql`SET ivfflat.probes = 5`);
  } catch {
    // ignore when vector index settings are unavailable
  }

  const result = await db.execute(sql`
    SELECT
      e.row_id as "rowId",
      e.import_id as "importId",
      e.content as "content",
      (1 - (e.embedding <=> ${embeddingLiteral}::vector))::float as "score",
      i.name as "importName",
      i.filename as "importFilename",
      dr.json_data as "jsonDataJsonb"
    FROM public.data_embeddings e
    JOIN public.data_rows dr ON dr.id = e.row_id
    LEFT JOIN public.imports i ON i.id = e.import_id
    WHERE (i.is_deleted = false OR i.is_deleted IS NULL)
    ${importFilter}
    ORDER BY e.embedding <=> ${embeddingLiteral}::vector
    LIMIT ${params.limit}
  `);

  return readRows<AiSemanticSearchRow>(result).map(mapSearchRow);
}

export async function aiKeywordSearchRows(params: {
  query: string;
  limit: number;
}): Promise<AiSearchRecordRow[]> {
  const digits = String(params.query || "").replace(/[^0-9]/g, "");
  const limit = Math.max(1, Math.min(50, params.limit || 10));
  if (digits.length < 6) return [];

  const primaryFields = resolveAiKeywordFields(digits);
  if (primaryFields.length === 0) return [];

  const perFieldMatch = sql.join(
    primaryFields.map((key) => sql`coalesce((dr.json_data::jsonb)->>${key}, '') = ${digits}`),
    sql` OR `,
  );

  const result = await db.execute(sql`
    SELECT
      dr.id as "rowId",
      dr.import_id as "importId",
      i.name as "importName",
      i.filename as "importFilename",
      dr.json_data as "jsonDataJsonb"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND (${perFieldMatch})
    ORDER BY dr.id
    LIMIT ${limit}
  `);

  return readRows<AiSearchRecordRow>(result).map(mapSearchRow);
}

export async function aiNameSearchRows(params: {
  query: string;
  limit: number;
}): Promise<AiSearchRecordRow[]> {
  const q = String(params.query || "").trim();
  if (!q) return [];

  const nameKeysMatch = sql`
    (
      coalesce((dr.json_data::jsonb)->>'Nama','') ILIKE ${`%${q}%`} OR
      coalesce((dr.json_data::jsonb)->>'Customer Name','') ILIKE ${`%${q}%`} OR
      coalesce((dr.json_data::jsonb)->>'name','') ILIKE ${`%${q}%`} OR
      coalesce((dr.json_data::jsonb)->>'MAKLUMAT PEMOHON','') ILIKE ${`%${q}%`}
    )
  `;

  const result = await db.execute(sql`
    SELECT
      dr.id as "rowId",
      dr.import_id as "importId",
      i.name as "importName",
      i.filename as "importFilename",
      dr.json_data as "jsonDataJsonb"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND ${nameKeysMatch}
    ORDER BY dr.id
    LIMIT ${params.limit}
  `);

  return readRows<AiSearchRecordRow>(result).map(mapSearchRow);
}

export async function aiDigitsSearchRows(params: {
  digits: string;
  limit: number;
}): Promise<AiSearchRecordRow[]> {
  const result = await db.execute(sql`
    SELECT
      dr.id as "rowId",
      dr.import_id as "importId",
      i.name as "importName",
      i.filename as "importFilename",
      dr.json_data as "jsonDataJsonb"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND regexp_replace(dr.json_data::text, '[^0-9]', '', 'g') LIKE ${`%${params.digits}%`}
    ORDER BY dr.id
    LIMIT ${params.limit}
  `);

  return readRows<AiSearchRecordRow>(result).map(mapSearchRow);
}

export async function aiFuzzySearchRows(params: {
  query: string;
  limit: number;
}): Promise<AiFuzzySearchRow[]> {
  const tokens = tokenizeAiFuzzyQuery(params.query);
  if (tokens.length === 0) return [];

  const scoreSql = sql.join(
    tokens.map((token) => sql`CASE WHEN dr.json_data::text ILIKE ${`%${token}%`} THEN 1 ELSE 0 END`),
    sql` + `,
  );
  const whereSql = sql.join(
    tokens.map((token) => sql`dr.json_data::text ILIKE ${`%${token}%`}`),
    sql` OR `,
  );

  const result = await db.execute(sql`
    SELECT
      dr.id as "rowId",
      dr.import_id as "importId",
      i.name as "importName",
      i.filename as "importFilename",
      dr.json_data as "jsonDataJsonb",
      (${scoreSql})::int as "score"
    FROM public.data_rows dr
    JOIN public.imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND (${whereSql})
    ORDER BY "score" DESC, dr.id
    LIMIT ${params.limit}
  `);

  return readRows<AiFuzzySearchRow>(result).map(mapSearchRow);
}
