import { sql, type SQL } from "drizzle-orm";
import type { CollectionPiiFieldName } from "../lib/collection-pii-encryption";
import { isCollectionPiiPlaintextRetiredField } from "../config/security";
import { assertSqlIdentifier } from "./sql-identifier-utils";

export function buildProtectedCollectionPiiSelect(
  columnName: string,
  encryptedColumnName: string,
  aliasName = columnName,
  fieldName?: CollectionPiiFieldName,
): SQL {
  const safeColumnName = assertSqlIdentifier(columnName);
  const safeEncryptedColumnName = assertSqlIdentifier(encryptedColumnName);
  const safeAliasName = assertSqlIdentifier(aliasName);

  if (fieldName && isCollectionPiiPlaintextRetiredField(fieldName)) {
    return sql.raw(`NULL AS "${safeAliasName}"`);
  }

  return sql.raw(
    `CASE
      WHEN NULLIF(trim(COALESCE(${safeEncryptedColumnName}, '')), '') IS NOT NULL THEN NULL
      ELSE NULLIF(trim(COALESCE(${safeColumnName}, '')), '')
    END AS "${safeAliasName}"`,
  );
}
