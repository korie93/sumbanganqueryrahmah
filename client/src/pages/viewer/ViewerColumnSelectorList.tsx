import { memo, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ViewerColumnSelectorListProps {
  headers: string[];
  selectedColumns: Set<string>;
  onToggleColumn: (column: string) => void;
}

interface ViewerColumnSelectorItemProps {
  header: string;
  selected: boolean;
  onToggleColumn: (column: string) => void;
}

const ViewerColumnSelectorItem = memo(function ViewerColumnSelectorItem({
  header,
  selected,
  onToggleColumn,
}: ViewerColumnSelectorItemProps) {
  const handleToggleColumn = useCallback(() => {
    onToggleColumn(header);
  }, [header, onToggleColumn]);

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`col-${header}`}
        checked={selected}
        onCheckedChange={handleToggleColumn}
        data-testid={`checkbox-column-${header}`}
      />
      <Label htmlFor={`col-${header}`} className="cursor-pointer text-sm">
        {header}
      </Label>
    </div>
  );
});

function ViewerColumnSelectorListImpl({
  headers,
  selectedColumns,
  onToggleColumn,
}: ViewerColumnSelectorListProps) {
  return (
    <div className="max-h-48 space-y-2 overflow-y-auto scroll-fade-y">
      {headers.map((header) => (
        <ViewerColumnSelectorItem
          key={header}
          header={header}
          selected={selectedColumns.has(header)}
          onToggleColumn={onToggleColumn}
        />
      ))}
    </div>
  );
}

export const ViewerColumnSelectorList = memo(ViewerColumnSelectorListImpl);
