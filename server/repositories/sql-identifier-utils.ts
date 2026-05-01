const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertSqlIdentifier(value: string): string {
  const normalized = String(value || "").trim();

  if (!SQL_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error("Unsafe SQL identifier.");
  }

  return normalized;
}
