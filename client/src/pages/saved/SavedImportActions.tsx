import { useRef } from "react";
import { BarChart3, Edit2, Eye, Info, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ImportItem } from "@/pages/saved/types";
import { useSavedOverlayFocus } from "@/pages/saved/SavedOverlayFocusContext";
import type { SavedOverlay } from "@/pages/saved/saved-overlay-focus";

type SavedImportActionsProps = {
  actionsDisabled: boolean;
  isActive: boolean;
  isSuperuser: boolean;
  item: ImportItem;
  onAnalysis: (item: ImportItem) => void;
  onDelete: (item: ImportItem) => void;
  onInspect: (item: ImportItem) => void;
  onRename: (item: ImportItem) => void;
  onView: (item: ImportItem) => void;
};

export function SavedImportActions({
  actionsDisabled,
  isActive,
  isSuperuser,
  item,
  onAnalysis,
  onDelete,
  onInspect,
  onRename,
  onView,
}: SavedImportActionsProps) {
  const overlayFocus = useSavedOverlayFocus();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handingOffFocus = useRef(false);
  const openOverlay = (overlay: SavedOverlay, action: (item: ImportItem) => void) => {
    overlayFocus?.remember(overlay, triggerRef.current);
    handingOffFocus.current = true;
    action(item);
  };
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        className="h-11 flex-1 px-3 md:h-9 md:flex-none"
        onClick={() => onView(item)}
        data-testid={`button-view-${item.id}`}
      >
        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
        View
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 md:h-9 md:w-9"
            aria-label={`More actions for ${item.name}`}
            data-testid={`button-import-actions-${item.id}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 max-w-[calc(100vw-1.5rem)]"
          onCloseAutoFocus={(event) => {
            if (handingOffFocus.current) event.preventDefault();
            handingOffFocus.current = false;
          }}
        >
          <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">
            {item.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11 md:min-h-9" onSelect={() => onAnalysis(item)} data-testid={`button-analysis-${item.id}`}>
            <BarChart3 aria-hidden="true" />Analysis
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 md:min-h-9" onSelect={() => openOverlay("details", onInspect)} data-testid={`button-inspect-${item.id}`}>
            <Info aria-hidden="true" />{isActive ? "Selected" : "Details"}
          </DropdownMenuItem>
          {isSuperuser ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11 md:min-h-9" onSelect={() => openOverlay("rename", onRename)} disabled={actionsDisabled} data-testid={`button-rename-${item.id}`}>
                <Edit2 aria-hidden="true" />Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive md:min-h-9" onSelect={() => openOverlay("delete", onDelete)} disabled={actionsDisabled} data-testid={`button-delete-${item.id}`}>
                <Trash2 aria-hidden="true" />Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
