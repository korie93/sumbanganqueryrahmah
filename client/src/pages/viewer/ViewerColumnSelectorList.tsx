import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ViewerColumnSelectorListProps {
  headers: string[];
  selectedColumns: Set<string>;
  onToggleColumn: (column: string) => void;
}

export function ViewerColumnSelectorList({
  headers,
  selectedColumns,
  onToggleColumn,
}: ViewerColumnSelectorListProps) {
  return (
    <div className="max-h-48 space-y-2 overflow-y-auto">
      {headers.map((header) => (
        <div key={header} className="flex items-center gap-2">
          <Checkbox
            id={`col-${header}`}
            checked={selectedColumns.has(header)}
            onCheckedChange={() => onToggleColumn(header)}
            data-testid={`checkbox-column-${header}`}
          />
          <Label htmlFor={`col-${header}`} className="cursor-pointer text-sm">
            {header}
          </Label>
        </div>
      ))}
    </div>
  );
}
