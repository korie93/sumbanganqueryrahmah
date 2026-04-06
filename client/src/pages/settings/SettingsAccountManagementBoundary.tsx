import { Suspense, lazy, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { UserAccountManagementSection } from "@/pages/settings/UserAccountManagementSection";
import { useSettingsAccountManagementPreload } from "@/pages/settings/useSettingsAccountManagementPreload";
import { useSettingsAccountManagement } from "@/pages/settings/useSettingsAccountManagement";
import { useSettingsManagedDialogViewModels } from "@/pages/settings/useSettingsManagedDialogViewModels";

const ManagedUserDialog = lazy(() =>
  import("@/pages/settings/ManagedUserDialog").then((module) => ({
    default: module.ManagedUserDialog,
  })),
);
const ManagedSecretDialog = lazy(() =>
  import("@/pages/settings/ManagedSecretDialog").then((module) => ({
    default: module.ManagedSecretDialog,
  })),
);

type SettingsAccountManagementBoundaryProps = {
  confirmCriticalOpen: boolean;
  isSuperuser: boolean;
  onConfirmCriticalOpenChange: (open: boolean) => void;
  onSaveCriticalSettings: () => Promise<void>;
  saving: boolean;
};

function SettingsDialogFallback() {
  return null;
}

export function SettingsAccountManagementBoundary({
  confirmCriticalOpen,
  isSuperuser,
  onConfirmCriticalOpenChange,
  onSaveCriticalSettings,
  saving,
}: SettingsAccountManagementBoundaryProps) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const accountManagement = useSettingsAccountManagement({
    isMountedRef,
    toast,
  });

  useSettingsAccountManagementPreload({
    devMailOutboxLoaded: accountManagement.devMailOutboxLoaded,
    devMailOutboxLoading: accountManagement.devMailOutboxLoading,
    isSuperuser,
    loadDevMailOutbox: accountManagement.loadDevMailOutbox,
    loadManagedUsers: accountManagement.loadManagedUsers,
    loadPendingResetRequests: accountManagement.loadPendingResetRequests,
    managedUsersLoaded: accountManagement.managedUsersLoaded,
    managedUsersLoading: accountManagement.managedUsersLoading,
    pendingResetRequestsLoaded: accountManagement.pendingResetRequestsLoaded,
    pendingResetRequestsLoading: accountManagement.pendingResetRequestsLoading,
  });

  const { managedDialog, managedSecretDialog } = useSettingsManagedDialogViewModels({
    accountManagement,
    confirmCriticalOpen,
    onConfirmCriticalOpenChange,
    onSaveCriticalSettings,
    saving,
  });

  if (!isSuperuser) {
    return null;
  }

  return (
    <>
      <UserAccountManagementSection
        clearingDevMailOutbox={accountManagement.clearingDevMailOutbox}
        createEmailInput={accountManagement.createEmailInput}
        createFullNameInput={accountManagement.createFullNameInput}
        createRoleInput={accountManagement.createRoleInput}
        createUsernameInput={accountManagement.createUsernameInput}
        creatingManagedUser={accountManagement.creatingManagedUser}
        deletingDevMailOutboxId={accountManagement.deletingDevMailOutboxId}
        deletingManagedUserId={accountManagement.deletingManagedUserId}
        devMailOutboxEnabled={accountManagement.devMailOutboxEnabled}
        devMailOutboxEntries={accountManagement.devMailOutboxEntries}
        devMailOutboxLoading={accountManagement.devMailOutboxLoading}
        devMailOutboxPagination={accountManagement.devMailOutboxPagination}
        devMailOutboxQuery={accountManagement.devMailOutboxQuery}
        isSuperuser={isSuperuser}
        managedUsers={accountManagement.managedUsers}
        managedUsersLoading={accountManagement.managedUsersLoading}
        managedUsersPagination={accountManagement.managedUsersPagination}
        managedUsersQuery={accountManagement.managedUsersQuery}
        onClearDevMailOutbox={() => void accountManagement.handleClearDevMailOutbox()}
        onCreateEmailInputChange={accountManagement.setCreateEmailInput}
        onCreateFullNameInputChange={accountManagement.setCreateFullNameInput}
        onCreateManagedUser={() => void accountManagement.handleCreateManagedUser()}
        onCreateRoleInputChange={accountManagement.setCreateRoleInput}
        onCreateUsernameInputChange={accountManagement.setCreateUsernameInput}
        onDeleteDevMailOutboxEntry={(previewId) =>
          void accountManagement.handleDeleteDevMailOutboxEntry(previewId)
        }
        onDeleteManagedUser={(user) => void accountManagement.handleDeleteManagedUser(user)}
        onDevMailOutboxRefresh={() => void accountManagement.refreshDevMailOutboxSection()}
        onDevMailOutboxQueryChange={(query) => void accountManagement.updateDevMailOutboxQuery(query)}
        onEditManagedUser={accountManagement.openManagedEditor}
        onManagedBanToggle={(user) => void accountManagement.handleManagedBanToggle(user)}
        onManagedResetPassword={(user) => void accountManagement.handleResetManagedUserPassword(user)}
        onManagedResendActivation={(user) =>
          void accountManagement.handleResendManagedUserActivation(user)
        }
        onManagedUsersRefresh={() => void accountManagement.refreshManagedUsersSection()}
        onManagedUsersQueryChange={(query) => void accountManagement.updateManagedUsersQuery(query)}
        onPendingResetRequestsRefresh={() => void accountManagement.refreshPendingResetRequestsSection()}
        onPendingResetRequestsQueryChange={(query) =>
          void accountManagement.updatePendingResetRequestsQuery(query)
        }
        pendingResetRequests={accountManagement.pendingResetRequests}
        pendingResetRequestsLoading={accountManagement.pendingResetRequestsLoading}
        pendingResetRequestsPagination={accountManagement.pendingResetRequestsPagination}
        pendingResetRequestsQuery={accountManagement.pendingResetRequestsQuery}
      />

      {managedDialog.managedDialogOpen || managedDialog.confirmCriticalOpen ? (
        <Suspense fallback={<SettingsDialogFallback />}>
          <ManagedUserDialog {...managedDialog} />
        </Suspense>
      ) : null}

      {managedSecretDialog.open ? (
        <Suspense fallback={<SettingsDialogFallback />}>
          <ManagedSecretDialog {...managedSecretDialog} />
        </Suspense>
      ) : null}
    </>
  );
}
