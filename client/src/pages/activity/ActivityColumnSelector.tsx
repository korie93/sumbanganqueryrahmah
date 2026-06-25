import { ArrowDown, ArrowUp, Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ACTIVITY_COLUMN_DEFINITIONS,
  type ActivityColumnId,
  type ActivityColumnPreferences,
} from "@/pages/activity/activity-column-preferences";

type ActivityColumnSelectorProps = {
  preferences: ActivityColumnPreferences;
  onMoveColumn: (column: ActivityColumnId, direction: -1 | 1) => void;
  onReset: () => void;
  onToggleColumn: (column: ActivityColumnId) => void;
};

const ACTIVITY_COLUMN_DEFINITION_BY_ID = new Map(
  ACTIVITY_COLUMN_DEFINITIONS.map((column) => [column.id, column]),
);

export function ActivityColumnSelector({
  preferences,
  onMoveColumn,
  onReset,
  onToggleColumn,
}: ActivityColumnSelectorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          data-testid="button-activity-columns"
        >
          <Columns3 aria-hidden="true" />
          Columns ({preferences.visible.length}/{preferences.order.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Activity columns</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Choose and arrange desktop audit fields.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Reset columns"
            onClick={onReset}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          {preferences.order.map((column, index) => {
            const definition = ACTIVITY_COLUMN_DEFINITION_BY_ID.get(column);
            if (!definition) {
              return null;
            }
            const checkboxId = `activity-column-${column}`;
            return (
              <div
                key={column}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    id={checkboxId}
                    checked={preferences.visible.includes(column)}
                    onCheckedChange={() => onToggleColumn(column)}
                    aria-label={`Show ${definition.label} column`}
                  />
                  <Label htmlFor={checkboxId} className="min-w-0 cursor-pointer truncate text-sm">
                    {definition.label}
                  </Label>
                </div>
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={`Move ${definition.label} up`}
                    disabled={index === 0}
                    onClick={() => onMoveColumn(column, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={`Move ${definition.label} down`}
                    disabled={index === preferences.order.length - 1}
                    onClick={() => onMoveColumn(column, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
