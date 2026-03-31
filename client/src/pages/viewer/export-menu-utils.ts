export type ViewerExportActionKind = "csv" | "pdf" | "excel";

export interface ViewerExportMenuOption {
  id: string;
  kind: ViewerExportActionKind;
  label: string;
  exportFiltered: boolean;
  exportSelected: boolean;
  disabled: boolean;
}

export interface ViewerExportMenuSection {
  id: ViewerExportActionKind;
  title: string;
  options: ViewerExportMenuOption[];
}

interface BuildViewerExportMenuSectionsOptions {
  exportBusy: boolean;
  totalRows: number;
  filteredRowsCount: number;
  selectedRowCount: number;
  hasFilteredSubset: boolean;
}

function buildSectionOptions(
  kind: ViewerExportActionKind,
  exportBusy: boolean,
  totalRows: number,
  filteredRowsCount: number,
  selectedRowCount: number,
  hasFilteredSubset: boolean,
): ViewerExportMenuOption[] {
  const disabled = kind === "csv" ? false : exportBusy;
  const options: ViewerExportMenuOption[] = [
    {
      id: `${kind}-all`,
      kind,
      label: `All Data (${totalRows} rows)`,
      exportFiltered: false,
      exportSelected: false,
      disabled,
    },
  ];

  if (hasFilteredSubset) {
    options.push({
      id: `${kind}-filtered`,
      kind,
      label: `Filtered View (${filteredRowsCount} shown)`,
      exportFiltered: true,
      exportSelected: false,
      disabled,
    });
  }

  if (selectedRowCount > 0) {
    options.push({
      id: `${kind}-selected`,
      kind,
      label: `Selected (${selectedRowCount} rows)`,
      exportFiltered: true,
      exportSelected: true,
      disabled,
    });
  }

  return options;
}

export function buildViewerExportMenuSections({
  exportBusy,
  totalRows,
  filteredRowsCount,
  selectedRowCount,
  hasFilteredSubset,
}: BuildViewerExportMenuSectionsOptions): ViewerExportMenuSection[] {
  return [
    {
      id: "csv",
      title: "CSV Export",
      options: buildSectionOptions(
        "csv",
        exportBusy,
        totalRows,
        filteredRowsCount,
        selectedRowCount,
        hasFilteredSubset,
      ),
    },
    {
      id: "pdf",
      title: "PDF Export",
      options: buildSectionOptions(
        "pdf",
        exportBusy,
        totalRows,
        filteredRowsCount,
        selectedRowCount,
        hasFilteredSubset,
      ),
    },
    {
      id: "excel",
      title: "Excel Export",
      options: buildSectionOptions(
        "excel",
        exportBusy,
        totalRows,
        filteredRowsCount,
        selectedRowCount,
        hasFilteredSubset,
      ),
    },
  ];
}
