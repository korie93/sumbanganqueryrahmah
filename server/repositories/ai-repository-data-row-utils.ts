import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { normalizeJsonPayload, readRows } from "./ai-repository-mappers";
import type { AiEmbeddingSourceRow } from "./ai-repository-types";

export async function getAiDataRowsForEmbedding(
  importId: string,
  limit: number,
  offset: number,
): Promise<AiEmbeddingSourceRow[]> {
  const result = await db.execute(sql`
    SELECT id, json_data as "jsonDataJsonb"
    FROM public.data_rows
    WHERE import_id = ${importId}
    ORDER BY id
    LIMIT ${limit} OFFSET ${offset}
  `);

  return readRows<AiEmbeddingSourceRow>(result).map((row) => ({
    id: row.id,
    jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
  }));
}
