export const COLLECTION_PII_SCRIPT_COLUMN_GROUPS = {
  customerName: [
    "customer_name",
    "customer_name_encrypted",
    "customer_name_search_hash",
    "customer_name_search_hashes",
  ],
  icNumber: [
    "ic_number",
    "ic_number_encrypted",
    "ic_number_search_hash",
  ],
  customerPhone: [
    "customer_phone",
    "customer_phone_encrypted",
    "customer_phone_search_hash",
  ],
  accountNumber: [
    "account_number",
    "account_number_encrypted",
    "account_number_search_hash",
  ],
} as const;

export type CollectionPiiScriptField = keyof typeof COLLECTION_PII_SCRIPT_COLUMN_GROUPS;

export const COLLECTION_PII_SCRIPT_FIELDS = [
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
] as const satisfies readonly CollectionPiiScriptField[];

export function parseCollectionPiiScriptFields(
  rawValue: string,
  flagName = "--fields",
): ReadonlySet<CollectionPiiScriptField> {
  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error(`${flagName} requires at least one known collection PII field.`);
  }

  const nextFields = new Set<CollectionPiiScriptField>();
  for (const value of values) {
    if (!COLLECTION_PII_SCRIPT_FIELDS.includes(value as CollectionPiiScriptField)) {
      throw new Error(
        `Unknown collection PII field '${value}'. Expected one of: ${COLLECTION_PII_SCRIPT_FIELDS.join(", ")}`,
      );
    }
    nextFields.add(value as CollectionPiiScriptField);
  }

  return nextFields;
}

export function buildCollectionPiiScriptSelectColumns(
  fields: ReadonlySet<CollectionPiiScriptField>,
): string[] {
  const columns = new Set<string>(["id"]);
  for (const field of fields) {
    for (const column of COLLECTION_PII_SCRIPT_COLUMN_GROUPS[field]) {
      columns.add(column);
    }
  }
  return Array.from(columns);
}

export function buildCollectionPiiScriptSelectClause(
  fields: ReadonlySet<CollectionPiiScriptField>,
): string {
  return buildCollectionPiiScriptSelectColumns(fields).join(",\n          ");
}
