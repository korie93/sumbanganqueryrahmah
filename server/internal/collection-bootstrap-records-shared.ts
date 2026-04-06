import path from "node:path";
import type { SQL } from "drizzle-orm";
import { db } from "../db-postgres";

export type BootstrapSqlExecutor = Pick<typeof db, "execute">;

export async function executeBootstrapStatements(
  database: BootstrapSqlExecutor,
  statements: readonly SQL[],
): Promise<void> {
  for (const statement of statements) {
    await database.execute(statement);
  }
}

export function inferMimeTypeFromReceiptPath(receiptPath: string): string {
  const extension = path.extname(String(receiptPath || "").trim()).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
