import { useRef } from "react";
import { Edit3, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CollectionRecord } from "@/lib/api";
import type { CollectionRecordsTableProps } from "./CollectionRecordsTable";

type CollectionRecordActionsProps = {
  record: CollectionRecord;
  recordNumber: number;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: CollectionRecordsTableProps["onEdit"];
  onDelete: CollectionRecordsTableProps["onDelete"];
};

export function CollectionRecordActions({
  record,
  recordNumber,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: CollectionRecordActionsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handingOffFocus = useRef(false);

  const openOverlay = (action: CollectionRecordsTableProps["onEdit"]) => {
    handingOffFocus.current = true;
    action(record, triggerRef.current ?? undefined);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          className="min-h-11 gap-2 rounded-md sm:min-h-9"
          aria-label={`Actions for record ${recordNumber}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          // A dialog owns the next focus move only after selecting its action.
          if (handingOffFocus.current) event.preventDefault();
          handingOffFocus.current = false;
        }}
      >
        {canEdit ? (
          <DropdownMenuItem className="min-h-11 sm:min-h-9" onSelect={() => openOverlay(onEdit)}>
            <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />
            Edit
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem
            className="min-h-11 text-destructive focus:text-destructive sm:min-h-9"
            onSelect={() => openOverlay(onDelete)}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
