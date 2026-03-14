import { AlertTriangle, Shield, ShieldOff, Trash2 } from "lucide-react";
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
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

interface ActivityActionDialogsProps {
  banDialogOpen: boolean;
  deleteDialogOpen: boolean;
  kickDialogOpen: boolean;
  onBanConfirm: () => void;
  onBanDialogOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onKickConfirm: () => void;
  onKickDialogOpenChange: (open: boolean) => void;
  onUnbanConfirm: () => void;
  onUnbanDialogOpenChange: (open: boolean) => void;
  selectedActivity: ActivityRecord | null;
  selectedBannedUser: BannedUser | null;
  unbanDialogOpen: boolean;
}

export function ActivityActionDialogs({
  banDialogOpen,
  deleteDialogOpen,
  kickDialogOpen,
  onBanConfirm,
  onBanDialogOpenChange,
  onDeleteConfirm,
  onDeleteDialogOpenChange,
  onKickConfirm,
  onKickDialogOpenChange,
  onUnbanConfirm,
  onUnbanDialogOpenChange,
  selectedActivity,
  selectedBannedUser,
  unbanDialogOpen,
}: ActivityActionDialogsProps) {
  return (
    <>
      <AlertDialog open={kickDialogOpen} onOpenChange={onKickDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Kick User?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to force logout "{selectedActivity?.username}"? The user can log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onKickConfirm} data-testid="button-confirm-kick">
              Kick
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={banDialogOpen} onOpenChange={onBanDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" />
              Ban User?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to ban "{selectedActivity?.username}"? The user will not be able to log in until unbanned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBanConfirm}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-ban"
            >
              Ban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={onDeleteDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Activity Log?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the activity log for "{selectedActivity?.username}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirm}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unbanDialogOpen} onOpenChange={onUnbanDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldOff className="w-5 h-5 text-green-500" />
              Unban User?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unban "{selectedBannedUser?.username}"? The user will be able to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onUnbanConfirm}
              className="bg-green-600 text-white"
              data-testid="button-confirm-unban"
            >
              Unban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
