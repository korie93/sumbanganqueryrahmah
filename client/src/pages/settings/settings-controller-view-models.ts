import type { ManagedSecretDialogProps } from "@/pages/settings/ManagedSecretDialog";
import type { ManagedUserDialogProps } from "@/pages/settings/ManagedUserDialog";
import type { ManagedUser } from "@/pages/settings/types";
import type { ManageableUserRole } from "@shared/user-roles";

type ManagedDialogViewModelArgs = {
  confirmCriticalOpen: boolean;
  managedDialogOpen: boolean;
  managedEmailInput: string;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: ManageableUserRole;
  managedSaving: boolean;
  managedSelectedUser: ManagedUser | null;
  managedStatusInput: "pending_activation" | "active" | "suspended" | "disabled";
  managedUsernameInput: string;
  onCloseManagedDialog: () => void;
  onConfirmCriticalOpenChange: (open: boolean) => void;
  onConfirmManagedSave: () => void;
  onManagedDialogOpenChange: (open: boolean) => void;
  onManagedEmailInputChange: (value: string) => void;
  onManagedFullNameInputChange: (value: string) => void;
  onManagedIsBannedChange: (value: boolean) => void;
  onManagedRoleInputChange: (value: ManageableUserRole) => void;
  onManagedStatusInputChange: (
    value: "pending_activation" | "active" | "suspended" | "disabled",
  ) => void;
  onManagedUsernameInputChange: (value: string) => void;
  onSaveCriticalSettings: () => Promise<void>;
  saving: boolean;
};

export function buildManagedDialogViewModel(
  args: ManagedDialogViewModelArgs,
): ManagedUserDialogProps {
  return {
    confirmCriticalOpen: args.confirmCriticalOpen,
    managedDialogOpen: args.managedDialogOpen,
    managedEmailInput: args.managedEmailInput,
    managedFullNameInput: args.managedFullNameInput,
    managedIsBanned: args.managedIsBanned,
    managedRoleInput: args.managedRoleInput,
    managedSaving: args.managedSaving,
    managedSelectedUser: args.managedSelectedUser,
    managedStatusInput: args.managedStatusInput,
    managedUsernameInput: args.managedUsernameInput,
    onCloseManagedDialog: args.onCloseManagedDialog,
    onConfirmCriticalOpenChange: args.onConfirmCriticalOpenChange,
    onConfirmManagedSave: args.onConfirmManagedSave,
    onManagedDialogOpenChange: args.onManagedDialogOpenChange,
    onManagedEmailInputChange: args.onManagedEmailInputChange,
    onManagedFullNameInputChange: args.onManagedFullNameInputChange,
    onManagedIsBannedChange: args.onManagedIsBannedChange,
    onManagedRoleInputChange: args.onManagedRoleInputChange,
    onManagedStatusInputChange: args.onManagedStatusInputChange,
    onManagedUsernameInputChange: args.onManagedUsernameInputChange,
    onSaveCriticalSettings: args.onSaveCriticalSettings,
    saving: args.saving,
  };
}

export function buildManagedSecretDialogViewModel(args: {
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  value?: string;
}): ManagedSecretDialogProps {
  return {
    description: args.description,
    onOpenChange: args.onOpenChange,
    open: args.open,
    title: args.title,
    value: args.value,
  };
}
