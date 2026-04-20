import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImportItem } from "@/pages/saved/types";

interface SavedDialogsProps {
  deleteDialogOpen: boolean;
  renameDialogOpen: boolean;
  bulkDeleteDialogOpen: boolean;
  deleting: boolean;
  renaming: boolean;
  bulkDeleting: boolean;
  bulkDeleteCount: number;
  selectedImport: ImportItem | null;
  newName: string;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onRenameDialogOpenChange: (open: boolean) => void;
  onBulkDeleteDialogOpenChange: (open: boolean) => void;
  onNewNameChange: (value: string) => void;
  onDeleteConfirm: () => void;
  onRenameConfirm: () => void;
  onBulkDeleteConfirm: () => void;
}

export function SavedDialogs({
  deleteDialogOpen,
  renameDialogOpen,
  bulkDeleteDialogOpen,
  deleting,
  renaming,
  bulkDeleting,
  bulkDeleteCount,
  selectedImport,
  newName,
  onDeleteDialogOpenChange,
  onRenameDialogOpenChange,
  onBulkDeleteDialogOpenChange,
  onNewNameChange,
  onDeleteConfirm,
  onRenameConfirm,
  onBulkDeleteConfirm,
}: SavedDialogsProps) {
  return (
    <>
      <AlertDialog open={deleteDialogOpen} onOpenChange={onDeleteDialogOpenChange}>
        <AlertDialogContent className="gap-5 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this saved import permanently. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <p className="break-words text-sm font-medium text-foreground">
              {selectedImport?.name ?? "Selected import"}
            </p>
            {selectedImport?.filename ? (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {selectedImport.filename}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="w-full sm:w-auto" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={onBulkDeleteDialogOpenChange}>
        <AlertDialogContent className="gap-5 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Files?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the selected saved imports permanently. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-foreground">
              {bulkDeleteCount} file{bulkDeleteCount === 1 ? "" : "s"} selected
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Continue only if you are sure these imports are no longer needed.
            </p>
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="w-full sm:w-auto" disabled={bulkDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onBulkDeleteConfirm}
              disabled={bulkDeleting || bulkDeleteCount === 0}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
            >
              {bulkDeleting ? "Deleting..." : "Delete Selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameDialogOpen} onOpenChange={onRenameDialogOpenChange}>
        <DialogContent className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Import</DialogTitle>
            <DialogDescription>
              Update the saved import name without changing the original file content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Current Import
              </p>
              <p className="mt-2 break-words text-sm font-medium text-foreground">
                {selectedImport?.name ?? "Selected import"}
              </p>
              {selectedImport?.filename ? (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {selectedImport.filename}
                </p>
              ) : null}
            </div>
            <Input
              id="saved-import-rename"
              name="savedImportName"
              value={newName}
              onChange={(event) => onNewNameChange(event.target.value)}
              aria-label="New import name"
              placeholder="New name"
              autoComplete="off"
              className="h-11"
              data-testid="input-rename"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onRenameDialogOpenChange(false)}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={onRenameConfirm} disabled={renaming || !newName.trim()}>
              {renaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
