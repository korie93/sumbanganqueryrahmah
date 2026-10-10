import { useRef } from "react";
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

type CollectionRecordDiscardDialogProps = {
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
};

export function CollectionRecordDiscardDialog({
  open,
  saving,
  onOpenChange,
  onDiscard,
}: CollectionRecordDiscardDialogProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="sm:max-w-md"
        overlayClassName="z-[var(--z-modal-content)]"
        onKeyDown={(event) => {
          // A rapidly reopened layer can receive focus before Radix's document
          // Escape listener is ready. Handle only an otherwise unhandled Escape.
          if (event.key !== "Escape" || event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          if (!saving) onOpenChange(false);
        }}
        onOpenAutoFocus={() => {
          // Radix then focuses Cancel (the safe choice). Remember the edit
          // control because this confirmation has no single trigger button.
          const active = document.activeElement;
          returnFocusRef.current = active instanceof HTMLElement && active.closest('[role="dialog"]')
            ? active
            // Touch dismissal is deferred to click; the tapped backdrop may
            // already have blurred the edit control before this callback.
            : document.getElementById("edit-collection-customer-name");
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // A rapid reopen can overlap the previous content's focus cleanup.
          if (open) return;
          // A discarded/unmounted edit has its own launcher restoration.
          // Never steal that focus back to a detached draft control.
          const target = returnFocusRef.current;
          if (target?.isConnected && target.closest('[role="dialog"][data-state="open"]')) {
            target.focus({ preventScroll: true });
          }
          returnFocusRef.current = null;
        }}
      >
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Perubahan belum disimpan</AlertDialogTitle>
          <AlertDialogDescription>
            Perubahan pada rekod dan resit belum disimpan. Buang perubahan ini?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0 min-h-11" disabled={saving}>
            Teruskan Edit
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={saving}
            onClick={onDiscard}
          >
            Buang Perubahan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
