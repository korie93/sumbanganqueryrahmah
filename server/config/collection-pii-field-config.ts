export const COLLECTION_PII_RETIRED_FIELD_NAMES = [
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
] as const;

export type CollectionPiiRetiredFieldName = typeof COLLECTION_PII_RETIRED_FIELD_NAMES[number];

const COLLECTION_PII_RETIRED_FIELD_NAME_SET: ReadonlySet<string> = new Set(
  COLLECTION_PII_RETIRED_FIELD_NAMES,
);

export const COLLECTION_PII_RETIRED_FIELD_LIST_LABEL =
  COLLECTION_PII_RETIRED_FIELD_NAMES.join(", ");

export function isAllowedCollectionPiiRetiredField(
  field: string,
): field is CollectionPiiRetiredFieldName {
  return COLLECTION_PII_RETIRED_FIELD_NAME_SET.has(field);
}
