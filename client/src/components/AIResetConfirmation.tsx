import { useCallback, useRef, useState, type RefObject } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type AIResetControl = { requestReset: () => void; hasDraft: boolean };

export function useAIResetConfirmation({ hasDraft, isActive, onReset, fallbackFocusRef }: {
  hasDraft: boolean;
  isActive: boolean;
  onReset: () => void;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const requestReset = useCallback(() => {
    if (!hasDraft && !isActive) { onReset(); return; }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, [hasDraft, isActive, onReset]);
  const confirmReset = useCallback(() => { setOpen(false); onReset(); }, [onReset]);
  const restoreFocus = useCallback((event: Event) => {
    event.preventDefault();
    const previous = returnFocusRef.current;
    returnFocusRef.current = null;
    const target = previous?.isConnected && !previous.closest("[hidden], [inert]") && !previous.matches(":disabled")
      ? previous : fallbackFocusRef.current;
    target?.focus({ preventScroll: true });
  }, [fallbackFocusRef]);
  return { open, onOpenChange: setOpen, requestReset, confirmReset, restoreFocus };
}

export function AIResetConfirmation({ open, onOpenChange, confirmReset, restoreFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmReset: () => void;
  restoreFocus: (event: Event) => void;
}) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent data-ai-reset-confirmation="true"
      className="max-w-sm gap-4 motion-reduce:animate-none" onCloseAutoFocus={restoreFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>Mulakan sembang baharu?</AlertDialogTitle>
        <AlertDialogDescription>Draf dan perbualan semasa akan dikosongkan.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="h-11">Batal</AlertDialogCancel>
        <AlertDialogAction className="h-11" onClick={confirmReset}>Sembang Baharu</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
