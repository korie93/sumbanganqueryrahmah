import type { ReactNode, UIEvent } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchResultRow } from "@/pages/general-search/types";
import { getCellDisplayText, getPriorityRank } from "@/pages/general-search/utils";

interface GeneralSearchDesktopResultsTableProps {
  bottomSpacerHeight: number;
  enableVirtualRows: boolean;
  headers: string[];
  onRecordSelect: (record: SearchResultRow) => void;
  onScroll?: ((event: UIEvent<HTMLDivElement>) => void) | undefined;
  renderCellValue: (safeText: string) => ReactNode;
  topSpacerHeight: number;
  virtualRows: SearchResultRow[];
  virtualStartRow: number;
}

export function GeneralSearchDesktopResultsTable({
  bottomSpacerHeight,
  enableVirtualRows,
  headers,
  onRecordSelect,
  onScroll,
  renderCellValue,
  topSpacerHeight,
  virtualRows,
  virtualStartRow,
}: GeneralSearchDesktopResultsTableProps) {
  const buildRowKey = (row: SearchResultRow, rowNumber: number) => {
    const explicitId = row.id ?? row.ID ?? row.recordId ?? row.record_id;
    if (typeof explicitId === "string" || typeof explicitId === "number") {
      return `search-result-${explicitId}`;
    }

    const visibleFingerprint = headers
      .slice(0, 4)
      .map((header) => getCellDisplayText(row?.[header]))
      .join("|");

    return `search-result-${rowNumber}-${visibleFingerprint}`;
  };

  return (
    <div
      className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-lg border border-border scrollbar-visible"
      onScroll={onScroll}
    >
      <style>{`
        .scrollbar-visible {
          -ms-overflow-style: auto;
        }
        .scrollbar-visible::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .scrollbar-visible::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.1);
          border-radius: 4px;
        }
        .scrollbar-visible::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.5);
          border-radius: 4px;
        }
        .scrollbar-visible::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.8);
        }
      `}</style>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th className="p-3 text-left font-medium text-muted-foreground">#</th>
            <th className="p-3 text-left font-medium text-muted-foreground">Action</th>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {enableVirtualRows && topSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={headers.length + 2} height={topSpacerHeight} className="p-0" />
            </tr>
          ) : null}
          {virtualRows.map((row, rowIndex) => {
            const actualRowIndex = enableVirtualRows ? virtualStartRow + rowIndex : rowIndex;

            return (
              <tr key={buildRowKey(row, actualRowIndex)} className="h-[52px] border-t border-border hover:bg-muted/50">
                <td className="p-3 text-muted-foreground">{actualRowIndex + 1}</td>
                <td className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRecordSelect(row)}
                    data-testid={`button-view-${actualRowIndex}`}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                </td>
                {headers.map((header) => {
                  const safeText = getCellDisplayText(row?.[header]);
                  return (
                    <td
                      key={`${actualRowIndex}-${header}`}
                      className={`max-w-[280px] truncate whitespace-nowrap p-3 text-foreground ${
                        getPriorityRank(header) <= 2 ? "font-semibold" : ""
                      }`}
                      title={safeText}
                    >
                      {renderCellValue(safeText)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {enableVirtualRows && bottomSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={headers.length + 2} height={bottomSpacerHeight} className="p-0" />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
