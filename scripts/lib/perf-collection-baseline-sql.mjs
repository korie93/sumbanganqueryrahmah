function parseCollectionPiiRetiredFields(env = process.env) {
  return new Set(
    String(env.COLLECTION_PII_RETIRED_FIELDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function buildProtectedCollectionPiiSelectSql({
  columnName,
  encryptedColumnName,
  aliasName = columnName,
  fieldName,
  env = process.env,
}) {
  const retiredFields = parseCollectionPiiRetiredFields(env);
  if (fieldName && retiredFields.has(fieldName)) {
    return `NULL AS ${aliasName}`;
  }

  return `CASE
        WHEN NULLIF(trim(COALESCE(${encryptedColumnName}, '')), '') IS NOT NULL THEN NULL
        ELSE NULLIF(trim(COALESCE(${columnName}, '')), '')
      END AS ${aliasName}`;
}
