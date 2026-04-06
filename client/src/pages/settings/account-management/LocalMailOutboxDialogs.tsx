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
import { UrlPreviewDialog } from "@/components/dialogs/UrlPreviewDialog";
import type { DevMailOutboxPreview } from "@/pages/settings/types";

type LocalMailOutboxDialogsProps = {
  clearAllOpen: boolean;
  clearingDevMailOutbox: boolean;
  deletingDevMailOutboxId: string | null;
  previewEntry: DevMailOutboxPreview | null;
  previewToDelete: DevMailOutboxPreview | null;
  onClear: () => void;
  onCloseDeleteDialog: () => void;
  onClosePreviewDialog: () => void;
  onDeleteEntry: (previewId: string) => void;
  onSetClearAllOpen: (open: boolean) => void;
};

export function LocalMailOutboxDialogs({
  clearAllOpen,
  clearingDevMailOutbox,
  deletingDevMailOutboxId,
  previewEntry,
  previewToDelete,
  onClear,
  onCloseDeleteDialog,
  onClosePreviewDialog,
  onDeleteEntry,
  onSetClearAllOpen,
}: LocalMailOutboxDialogsProps) {
  return (
    <>
      <AlertDialog
        open={previewToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            onCloseDeleteDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Local Email Preview</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the local mail preview for{" "}
              <span className="font-medium">{previewToDelete?.to || "this recipient"}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingDevMailOutboxId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingDevMailOutboxId) || !previewToDelete}
              onClick={() => {
                if (previewToDelete) {
                  onDeleteEntry(previewToDelete.id);
                }
              }}
            >
              {deletingDevMailOutboxId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllOpen} onOpenChange={onSetClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Local Email Previews</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every email currently stored in the local development outbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingDevMailOutbox}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearingDevMailOutbox}
              onClick={() => {
                onClear();
              }}
            >
              {clearingDevMailOutbox ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UrlPreviewDialog
        open={previewEntry !== null}
        title="Local Email Preview"
        description={
          previewEntry
            ? `${previewEntry.subject} for ${previewEntry.to}`
            : "Preview the stored development email."
        }
        url={previewEntry?.previewUrl || ""}
        onOpenChange={(open) => {
          if (!open) {
            onClosePreviewDialog();
          }
        }}
        onClose={onClosePreviewDialog}
      />
    </>
  );
}
