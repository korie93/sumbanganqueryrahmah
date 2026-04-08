import { sql, type SQL } from "drizzle-orm";

export function buildProtectedCollectionPiiSelect(
  columnName: string,
  encryptedColumnName: string,
  aliasName = columnName,
): SQL {
  return sql.raw(
    `CASE WHEN NULLIF(trim(COALESCE(${encryptedColumnName}, '')), '') IS NOT NULL THEN '' ELSE ${columnName} END AS "${aliasName}"`,
  );
}
