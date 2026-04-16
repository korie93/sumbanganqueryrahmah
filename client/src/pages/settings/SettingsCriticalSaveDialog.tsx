import { Loader2 } from "lucide-react";
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
import { logClientError } from "@/lib/client-logger";

type SettingsCriticalSaveDialogProps = {
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
};

export function SettingsCriticalSaveDialog({
  open,
  saving,
  onOpenChange,
  onConfirm,
}: SettingsCriticalSaveDialogProps) {
  const handleConfirmClick = () => {
    onOpenChange(false);
    void onConfirm().catch((error: unknown) => {
      logClientError("Critical settings save confirmation failed", error, {
        source: "client.log",
        component: "SettingsCriticalSaveDialog",
      });
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Critical Change</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to update critical system settings. Continue only if this change has been
            reviewed and is intended for the live system.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={handleConfirmClick}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving..." : "Yes, Save"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
