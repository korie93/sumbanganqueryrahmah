import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { CreateClosedAccountSection } from "@/pages/settings/account-management/CreateClosedAccountSection";
import type {
  UserAccountManagementSectionProps,
  UserAccountManagementSectionState,
} from "@/pages/settings/account-management/user-account-management-shared";

const LocalMailOutboxSection = lazyWithPreload(() =>
  import("@/pages/settings/account-management/LocalMailOutboxSection").then((module) => ({
    default: module.LocalMailOutboxSection,
  })),
);
const ManagedAccountsSection = lazyWithPreload(() =>
  import("@/pages/settings/account-management/ManagedAccountsSection").then((module) => ({
    default: module.ManagedAccountsSection,
  })),
);
const PendingPasswordResetSection = lazyWithPreload(() =>
  import("@/pages/settings/account-management/PendingPasswordResetSection").then((module) => ({
    default: module.PendingPasswordResetSection,
  })),
);

function UserAccountManagementTabFallback({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

type UserAccountManagementContentProps = Pick<
  UserAccountManagementSectionState,
  "activeTab" | "isPending"
> &
  Omit<UserAccountManagementSectionProps, "isSuperuser">;

export function UserAccountManagementContent({
  activeTab,
  clearingDevMailOutbox,
  createEmailInput,
  createFullNameInput,
  createRoleInput,
  createUsernameInput,
  creatingManagedUser,
  deletingDevMailOutboxId,
  deletingManagedUserId,
  devMailOutboxEnabled,
  devMailOutboxEntries,
  devMailOutboxLoading,
  devMailOutboxPagination,
  devMailOutboxQuery,
  isPending,
  managedUsers,
  managedUsersLoading,
  managedUsersPagination,
  managedUsersQuery,
  onClearDevMailOutbox,
  onCreateEmailInputChange,
  onCreateFullNameInputChange,
  onCreateManagedUser,
  onCreateRoleInputChange,
  onCreateUsernameInputChange,
  onDeleteDevMailOutboxEntry,
  onDeleteManagedUser,
  onDevMailOutboxRefresh,
  onDevMailOutboxQueryChange,
  onEditManagedUser,
  onManagedBanToggle,
  onManagedResetPassword,
  onManagedResendActivation,
  onManagedUsersRefresh,
  onManagedUsersQueryChange,
  onPendingResetRequestsRefresh,
  onPendingResetRequestsQueryChange,
  pendingResetRequests,
  pendingResetRequestsLoading,
  pendingResetRequestsPagination,
  pendingResetRequestsQuery,
}: UserAccountManagementContentProps) {
  return (
    <div className={`min-w-0 flex-1 ${isPending ? "opacity-90 transition-opacity" : ""}`}>
      {activeTab === "create-closed-account" ? (
        <CreateClosedAccountSection
          createEmailInput={createEmailInput}
          createFullNameInput={createFullNameInput}
          createRoleInput={createRoleInput}
          createUsernameInput={createUsernameInput}
          creatingManagedUser={creatingManagedUser}
          onCreateEmailInputChange={onCreateEmailInputChange}
          onCreateFullNameInputChange={onCreateFullNameInputChange}
          onCreateManagedUser={onCreateManagedUser}
          onCreateRoleInputChange={onCreateRoleInputChange}
          onCreateUsernameInputChange={onCreateUsernameInputChange}
        />
      ) : null}

      {activeTab === "local-mail-outbox" ? (
        <Suspense fallback={<UserAccountManagementTabFallback label="Loading local mail outbox..." />}>
          <LocalMailOutboxSection
            clearingDevMailOutbox={clearingDevMailOutbox}
            deletingDevMailOutboxId={deletingDevMailOutboxId}
            enabled={devMailOutboxEnabled}
            entries={devMailOutboxEntries}
            loading={devMailOutboxLoading}
            pagination={devMailOutboxPagination}
            query={devMailOutboxQuery}
            onClear={onClearDevMailOutbox}
            onDeleteEntry={onDeleteDevMailOutboxEntry}
            onQueryChange={onDevMailOutboxQueryChange}
            onRefresh={onDevMailOutboxRefresh}
          />
        </Suspense>
      ) : null}

      {activeTab === "managed-account" ? (
        <Suspense fallback={<UserAccountManagementTabFallback label="Loading managed accounts..." />}>
          <ManagedAccountsSection
            deletingManagedUserId={deletingManagedUserId}
            loading={managedUsersLoading}
            managedUsers={managedUsers}
            pagination={managedUsersPagination}
            query={managedUsersQuery}
            onBanToggle={onManagedBanToggle}
            onDeleteUser={onDeleteManagedUser}
            onEditUser={onEditManagedUser}
            onQueryChange={onManagedUsersQueryChange}
            onRefresh={onManagedUsersRefresh}
            onResetPassword={onManagedResetPassword}
            onResendActivation={onManagedResendActivation}
          />
        </Suspense>
      ) : null}

      {activeTab === "pending-password-reset-requests" ? (
        <Suspense fallback={<UserAccountManagementTabFallback label="Loading reset requests..." />}>
          <PendingPasswordResetSection
            loading={pendingResetRequestsLoading}
            pagination={pendingResetRequestsPagination}
            query={pendingResetRequestsQuery}
            onQueryChange={onPendingResetRequestsQueryChange}
            onRefresh={onPendingResetRequestsRefresh}
            requests={pendingResetRequests}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
