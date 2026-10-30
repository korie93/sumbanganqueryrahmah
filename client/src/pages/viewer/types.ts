import type { ImportDataColumnFilter } from "@shared/common/import-data-filters";

export interface ColumnFilter extends ImportDataColumnFilter {
  id?: string;
}

export type ViewerFilterMutableField = Exclude<keyof ColumnFilter, "id">;

export interface DataRowWithId {
  __rowId: number;
  [key: string]: unknown;
}

export interface ViewerVirtualRowData {
  density: import("@/hooks/usePersistentTableDensity").TableDensity;
  rows: DataRowWithId[];
  visibleHeaders: string[];
  pinnedColumn?: string | null | undefined;
  selectedRowIds: Set<number>;
  onToggleRowSelection: (rowId: number) => void;
  onInspectRow?: ((row: DataRowWithId) => void) | undefined;
  gridTemplateColumns: string;
}
