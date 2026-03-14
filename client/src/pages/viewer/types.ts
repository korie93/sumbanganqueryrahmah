export interface ColumnFilter {
  column: string;
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "notEquals";
  value: string;
}

export interface DataRowWithId {
  __rowId: number;
  [key: string]: unknown;
}

export interface ViewerVirtualRowData {
  rows: DataRowWithId[];
  visibleHeaders: string[];
  selectedRowIds: Set<number>;
  onToggleRowSelection: (rowId: number) => void;
  gridTemplateColumns: string;
}
