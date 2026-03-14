export interface FilterRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface SearchOperatorOption {
  value: string;
  label: string;
}

export type SearchResultRow = Record<string, unknown>;
