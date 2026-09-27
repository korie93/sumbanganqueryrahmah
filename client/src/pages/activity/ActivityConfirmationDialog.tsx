import type { ReactNode } from "react";
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
import { useActivityOverlayFocus } from "./ActivityOverlayFocusContext";
import type { ActivityOverlay } from "./activity-overlay-focus";

type ActivityConfirmationDialogProps = {
  confirmClassName?: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  focusOrigin?: ActivityOverlay;
  description: string;
  icon: ReactNode;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  open: boolean;
  testId: string;
  title: string;
};

export function ActivityConfirmationDialog({
  confirmClassName,
  confirmDisabled = false,
  confirmLabel,
  focusOrigin,
  description,
  icon,
  onConfirm,
  onOpenChange,
  onCloseAutoFocus,
  open,
  testId,
  title,
}: ActivityConfirmationDialogProps) {
  const overlayFocus = useActivityOverlayFocus();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        if (onCloseAutoFocus) onCloseAutoFocus(event);
        else if (focusOrigin) overlayFocus?.restore(focusOrigin, event);
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={confirmClassName}
            data-testid={testId}
            disabled={confirmDisabled}
            onClick={() => {
              // The originating row may disappear after an asynchronous mutation.
              if (focusOrigin) overlayFocus?.remember(focusOrigin, null);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
