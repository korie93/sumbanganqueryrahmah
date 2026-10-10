import { useEffect, useRef } from "react";
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

type SaveCollectionResetDialogProps = {
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function SaveCollectionResetDialog({
  open,
  disabled,
  onOpenChange,
  onConfirm,
}: SaveCollectionResetDialogProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const preserveBackdropFocus = (event: PointerEvent) => {
      // AlertDialog blocks outside dismissal, but a backdrop click can still
      // blur Cancel to body. Keep focus inside this confirmation so keyboard
      // handling stays reliable even when the dialog is rapidly reopened.
      if (event.button === 0 && !event.ctrlKey && event.target instanceof Element
        && event.target.classList.contains("save-collection-reset-overlay")) {
        event.preventDefault();
      }
    };
    document.addEventListener("pointerdown", preserveBackdropFocus, true);
    return () => document.removeEventListener("pointerdown", preserveBackdropFocus, true);
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="sm:max-w-md"
        overlayClassName="save-collection-reset-overlay"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) onOpenChange(false);
        }}
        onOpenAutoFocus={() => {
          // Radix focuses Cancel by default. Restore the opener after either
          // safe cancellation or a confirmed reset, without a trigger wrapper.
          const active = document.activeElement;
          returnFocusRef.current = active instanceof HTMLElement && active !== document.body
            ? active
            : document.getElementById("save-collection-reset-form");
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (open) return;
          const target = returnFocusRef.current;
          if (target?.isConnected) target.focus({ preventScroll: true });
          returnFocusRef.current = null;
        }}
      >
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Kosongkan borang?</AlertDialogTitle>
          <AlertDialogDescription>
            Kosongkan borang dan pilihan resit yang belum disimpan? Draf sesi ini juga akan dikosongkan.
            Rekod collection yang sudah disimpan tidak terjejas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0 min-h-11" disabled={disabled}>
            Teruskan Mengisi
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={disabled}
            onClick={onConfirm}
          >
            Kosongkan Borang
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
