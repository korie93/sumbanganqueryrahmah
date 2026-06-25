import { memo, useCallback, useId } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ViewerColumnSelectorListProps {
  headers: string[];
  selectedColumns: Set<string>;
  onToggleColumn: (column: string) => void;
  onMoveColumn: (column: string, direction: -1 | 1) => void;
}

interface ViewerColumnSelectorItemProps {
  header: string;
  selected: boolean;
  onToggleColumn: (column: string) => void;
  onMoveColumn: (column: string, direction: -1 | 1) => void;
  canMoveDown: boolean;
  canMoveUp: boolean;
}

const ViewerColumnSelectorItem = memo(function ViewerColumnSelectorItem({
  header,
  selected,
  onToggleColumn,
  onMoveColumn,
  canMoveDown,
  canMoveUp,
}: ViewerColumnSelectorItemProps) {
  const checkboxId = useId();
  const handleToggleColumn = useCallback(() => {
    onToggleColumn(header);
  }, [header, onToggleColumn]);
  const handleMoveUp = useCallback(() => {
    onMoveColumn(header, -1);
  }, [header, onMoveColumn]);
  const handleMoveDown = useCallback(() => {
    onMoveColumn(header, 1);
  }, [header, onMoveColumn]);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={selected}
          onCheckedChange={handleToggleColumn}
          data-testid={`checkbox-column-${header}`}
        />
        <Label htmlFor={checkboxId} className="min-w-0 cursor-pointer truncate text-sm">
          {header}
        </Label>
      </div>
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={`Move ${header} up`}
          disabled={!canMoveUp}
          onClick={handleMoveUp}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={`Move ${header} down`}
          disabled={!canMoveDown}
          onClick={handleMoveDown}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
});

function ViewerColumnSelectorListImpl({
  headers,
  selectedColumns,
  onToggleColumn,
  onMoveColumn,
}: ViewerColumnSelectorListProps) {
  return (
    <div className="max-h-48 space-y-2 overflow-y-auto scroll-fade-y">
      {headers.map((header, index) => (
        <ViewerColumnSelectorItem
          key={header}
          header={header}
          selected={selectedColumns.has(header)}
          onToggleColumn={onToggleColumn}
          onMoveColumn={onMoveColumn}
          canMoveUp={index > 0}
          canMoveDown={index < headers.length - 1}
        />
      ))}
    </div>
  );
}

export const ViewerColumnSelectorList = memo(ViewerColumnSelectorListImpl);
