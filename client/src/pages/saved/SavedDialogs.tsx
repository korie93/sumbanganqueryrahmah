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
  deleting: boolean;
  renaming: boolean;
  selectedImport: ImportItem | null;
  newName: string;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onRenameDialogOpenChange: (open: boolean) => void;
  onNewNameChange: (value: string) => void;
  onDeleteConfirm: () => void;
  onRenameConfirm: () => void;
}

export function SavedDialogs({
  deleteDialogOpen,
  renameDialogOpen,
  deleting,
  renaming,
  selectedImport,
  newName,
  onDeleteDialogOpenChange,
  onRenameDialogOpenChange,
  onNewNameChange,
  onDeleteConfirm,
  onRenameConfirm,
}: SavedDialogsProps) {
  return (
    <>
      <AlertDialog open={deleteDialogOpen} onOpenChange={onDeleteDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedImport?.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameDialogOpen} onOpenChange={onRenameDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Import</DialogTitle>
            <DialogDescription>
              Enter a new name for "{selectedImport?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(event) => onNewNameChange(event.target.value)}
              placeholder="New name"
              data-testid="input-rename"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onRenameDialogOpenChange(false)}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button onClick={onRenameConfirm} disabled={renaming || !newName.trim()}>
              {renaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
