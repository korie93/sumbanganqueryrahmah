import { Suspense, lazy, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  buildManagedDialogViewModel,
  buildManagedSecretDialogViewModel,
} from "@/pages/settings/settings-controller-view-models";
import { UserAccountManagementSection } from "@/pages/settings/UserAccountManagementSection";
import { useSettingsAccountManagement } from "@/pages/settings/useSettingsAccountManagement";

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

  useEffect(() => {
    if (!isSuperuser) {
      return;
    }

    const pendingLoads: Promise<unknown>[] = [];

    if (!accountManagement.managedUsersLoaded && !accountManagement.managedUsersLoading) {
      pendingLoads.push(accountManagement.loadManagedUsers());
    }

    if (
      !accountManagement.pendingResetRequestsLoaded &&
      !accountManagement.pendingResetRequestsLoading
    ) {
      pendingLoads.push(accountManagement.loadPendingResetRequests());
    }

    if (!accountManagement.devMailOutboxLoaded && !accountManagement.devMailOutboxLoading) {
      pendingLoads.push(accountManagement.loadDevMailOutbox());
    }

    if (pendingLoads.length === 0) {
      return;
    }

    void Promise.all(pendingLoads);
  }, [
    accountManagement.devMailOutboxLoaded,
    accountManagement.devMailOutboxLoading,
    accountManagement.loadDevMailOutbox,
    accountManagement.loadManagedUsers,
    accountManagement.loadPendingResetRequests,
    accountManagement.managedUsersLoaded,
    accountManagement.managedUsersLoading,
    accountManagement.pendingResetRequestsLoaded,
    accountManagement.pendingResetRequestsLoading,
    isSuperuser,
  ]);

  const managedDialog = useMemo(
    () =>
      buildManagedDialogViewModel({
        confirmCriticalOpen,
        managedDialogOpen: accountManagement.managedDialogOpen,
        managedEmailInput: accountManagement.managedEmailInput,
        managedFullNameInput: accountManagement.managedFullNameInput,
        managedIsBanned: accountManagement.managedIsBanned,
        managedRoleInput: accountManagement.managedRoleInput,
        managedSaving: accountManagement.managedSaving,
        managedSelectedUser: accountManagement.managedSelectedUser,
        managedStatusInput: accountManagement.managedStatusInput,
        managedUsernameInput: accountManagement.managedUsernameInput,
        onCloseManagedDialog: () => accountManagement.handleManagedDialogChange(false),
        onConfirmCriticalOpenChange,
        onConfirmManagedSave: () => void accountManagement.handleSaveManagedUser(),
        onManagedDialogOpenChange: accountManagement.handleManagedDialogChange,
        onManagedEmailInputChange: accountManagement.setManagedEmailInput,
        onManagedFullNameInputChange: accountManagement.setManagedFullNameInput,
        onManagedIsBannedChange: accountManagement.setManagedIsBanned,
        onManagedRoleInputChange: accountManagement.setManagedRoleInput,
        onManagedStatusInputChange: accountManagement.setManagedStatusInput,
        onManagedUsernameInputChange: accountManagement.setManagedUsernameInput,
        onSaveCriticalSettings,
        saving,
      }),
    [
      accountManagement.handleManagedDialogChange,
      accountManagement.handleSaveManagedUser,
      accountManagement.managedDialogOpen,
      accountManagement.managedEmailInput,
      accountManagement.managedFullNameInput,
      accountManagement.managedIsBanned,
      accountManagement.managedRoleInput,
      accountManagement.managedSaving,
      accountManagement.managedSelectedUser,
      accountManagement.managedStatusInput,
      accountManagement.managedUsernameInput,
      accountManagement.setManagedEmailInput,
      accountManagement.setManagedFullNameInput,
      accountManagement.setManagedIsBanned,
      accountManagement.setManagedRoleInput,
      accountManagement.setManagedStatusInput,
      accountManagement.setManagedUsernameInput,
      confirmCriticalOpen,
      onConfirmCriticalOpenChange,
      onSaveCriticalSettings,
      saving,
    ],
  );

  const managedSecretDialog = useMemo(
    () =>
      buildManagedSecretDialogViewModel({
        description: accountManagement.managedSecretDialogDescription,
        onOpenChange: accountManagement.setManagedSecretDialogOpen,
        open: accountManagement.managedSecretDialogOpen,
        title: accountManagement.managedSecretDialogTitle,
        value: accountManagement.managedSecretDialogValue,
      }),
    [
      accountManagement.managedSecretDialogDescription,
      accountManagement.managedSecretDialogOpen,
      accountManagement.managedSecretDialogTitle,
      accountManagement.managedSecretDialogValue,
      accountManagement.setManagedSecretDialogOpen,
    ],
  );

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
