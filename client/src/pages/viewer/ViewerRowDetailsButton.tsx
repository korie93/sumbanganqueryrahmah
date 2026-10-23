import { memo, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DataRowWithId } from "@/pages/viewer/types";

interface ViewerRowDetailsButtonProps {
  row: DataRowWithId;
  onInspectRow?: ((row: DataRowWithId) => void) | undefined;
}

export const ViewerRowDetailsButton = memo(function ViewerRowDetailsButton({ row, onInspectRow }: ViewerRowDetailsButtonProps) {
  const handleInspect = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onInspectRow?.(row);
  }, [onInspectRow, row]);

  if (!onInspectRow) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground sm:h-8 sm:w-8"
      aria-label={`View details for row ${row.__rowId + 1}`}
      aria-haspopup="dialog"
      data-testid={`button-viewer-row-details-${row.__rowId}`}
      onClick={handleInspect}
    >
      <ChevronRight aria-hidden="true" />
    </Button>
  );
});
