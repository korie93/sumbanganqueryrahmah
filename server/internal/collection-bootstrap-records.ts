import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  ensureCollectionRecordBaseSchema,
  ensureCollectionReceiptSchema,
} from "./collection-bootstrap-record-schema";
import { ensureCollectionRollupSchema } from "./collection-bootstrap-rollup-schema";
import type { BootstrapSqlExecutor } from "./collection-bootstrap-records-shared";

export async function ensureCollectionRecordsTables(
  database: BootstrapSqlExecutor = db,
): Promise<void> {
  await database.execute(sql`SET search_path TO public`);
  await ensureCollectionRecordBaseSchema(database);
  await ensureCollectionReceiptSchema(database);
  await ensureCollectionRollupSchema(database);
}
