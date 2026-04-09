export interface ColumnFilter {
  id?: string;
  column: string;
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "notEquals";
  value: string;
}

export type ViewerFilterMutableField = Exclude<keyof ColumnFilter, "id">;

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
