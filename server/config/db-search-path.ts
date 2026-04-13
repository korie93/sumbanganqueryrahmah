function isBareSchemaIdentifier(value: string) {
  return /^\$?[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function isQuotedSchemaIdentifier(value: string) {
  return /^"[^"]+"$/.test(value);
}

export function parseAndValidatePgSearchPath(searchPath: string): string[] {
  const normalized = String(searchPath || "").trim();
  if (!normalized) {
    throw new Error('Invalid PG search_path: ""');
  }

  const schemas = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (schemas.length === 0) {
    throw new Error(`Invalid PG search_path: "${searchPath}"`);
  }

  for (const schema of schemas) {
    if (isBareSchemaIdentifier(schema) || isQuotedSchemaIdentifier(schema)) {
      continue;
    }

    throw new Error(`Invalid PG search_path: "${searchPath}"`);
  }

  return schemas;
}

export function validatePgSearchPath(searchPath: string): string {
  return parseAndValidatePgSearchPath(searchPath).join(", ");
}
