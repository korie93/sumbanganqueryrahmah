import { sql, type SQL } from "drizzle-orm";
import type { CollectionPiiFieldName } from "../lib/collection-pii-encryption";
import { isCollectionPiiPlaintextRetiredField } from "../config/security";

export function buildProtectedCollectionPiiSelect(
  columnName: string,
  encryptedColumnName: string,
  aliasName = columnName,
  fieldName?: CollectionPiiFieldName,
): SQL {
  if (fieldName && isCollectionPiiPlaintextRetiredField(fieldName)) {
    return sql.raw(`NULL AS "${aliasName}"`);
  }

  return sql.raw(
    `CASE
      WHEN NULLIF(trim(COALESCE(${encryptedColumnName}, '')), '') IS NOT NULL THEN NULL
      ELSE NULLIF(trim(COALESCE(${columnName}, '')), '')
    END AS "${aliasName}"`,
  );
}
