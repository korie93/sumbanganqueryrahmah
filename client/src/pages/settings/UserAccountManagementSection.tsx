import { useEffect, useState, useTransition } from "react";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateClosedAccountSection } from "@/pages/settings/account-management/CreateClosedAccountSection";
import { LocalMailOutboxSection } from "@/pages/settings/account-management/LocalMailOutboxSection";
import { ManagedAccountsSection } from "@/pages/settings/account-management/ManagedAccountsSection";
import { PendingPasswordResetSection } from "@/pages/settings/account-management/PendingPasswordResetSection";
import { UserAccountManagementNav } from "@/pages/settings/account-management/UserAccountManagementNav";
import type {
  DevMailOutboxPreview,
  ManagedUser,
  PendingPasswordResetRequest,
  UserAccountManagementTabId,
} from "@/pages/settings/types";
import type { DevMailOutboxPaginationState, DevMailOutboxQueryState } from "@/pages/settings/useSettingsDevMailOutbox";
import type {
  ManagedUsersPaginationState,
  ManagedUsersQueryState,
  PendingResetRequestsPaginationState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/useSettingsManagedUserData";

export interface UserAccountManagementSectionProps {
  clearingDevMailOutbox: boolean;
  createEmailInput: string;
  createFullNameInput: string;
  createRoleInput: "admin" | "user";
  createUsernameInput: string;
  creatingManagedUser: boolean;
  deletingDevMailOutboxId: string | null;
  deletingManagedUserId: string | null;
  devMailOutboxEnabled: boolean;
  devMailOutboxEntries: DevMailOutboxPreview[];
  devMailOutboxLoading: boolean;
  devMailOutboxPagination: DevMailOutboxPaginationState;
  devMailOutboxQuery: DevMailOutboxQueryState;
  isSuperuser: boolean;
  managedUsers: ManagedUser[];
  managedUsersLoading: boolean;
  managedUsersPagination: ManagedUsersPaginationState;
  managedUsersQuery: ManagedUsersQueryState;
  onClearDevMailOutbox: () => void;
  onCreateEmailInputChange: (value: string) => void;
  onCreateFullNameInputChange: (value: string) => void;
  onCreateManagedUser: () => void;
  onCreateRoleInputChange: (value: "admin" | "user") => void;
  onCreateUsernameInputChange: (value: string) => void;
  onDeleteDevMailOutboxEntry: (previewId: string) => void;
  onDeleteManagedUser: (user: ManagedUser) => void;
  onDevMailOutboxRefresh: () => void;
  onDevMailOutboxQueryChange: (query: Partial<DevMailOutboxQueryState>) => void;
  onEditManagedUser: (user: ManagedUser) => void;
  onManagedBanToggle: (user: ManagedUser) => void;
  onManagedResetPassword: (user: ManagedUser) => void;
  onManagedResendActivation: (user: ManagedUser) => void;
  onManagedUsersRefresh: () => void;
  onManagedUsersQueryChange: (query: Partial<ManagedUsersQueryState>) => void;
  onPendingResetRequestsRefresh: () => void;
  onPendingResetRequestsQueryChange: (query: Partial<PendingResetRequestsQueryState>) => void;
  pendingResetRequests: PendingPasswordResetRequest[];
  pendingResetRequestsLoading: boolean;
  pendingResetRequestsPagination: PendingResetRequestsPaginationState;
  pendingResetRequestsQuery: PendingResetRequestsQueryState;
}

export function UserAccountManagementSection({
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
  isSuperuser,
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
}: UserAccountManagementSectionProps) {
  const [activeTab, setActiveTab] = useState<UserAccountManagementTabId>("create-closed-account");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  if (!isSuperuser) {
    return null;
  }

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Users className="h-5 w-5" />
          User Account Management
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Organize account creation, mail previews, managed users, and pending reset requests into
          focused sections without crowding the main Security page.
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start">
          <UserAccountManagementNav
            activeTab={activeTab}
            collapsed={navCollapsed}
            managedUserCount={managedUsersPagination.total}
            mobileOpen={mobileNavOpen}
            outboxCount={devMailOutboxPagination.total}
            onCollapsedChange={setNavCollapsed}
            onMobileOpenChange={setMobileNavOpen}
            pendingResetCount={pendingResetRequestsPagination.total}
            onSelect={(tab) => {
              startTransition(() => {
                setActiveTab(tab);
              });
            }}
          />

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
            ) : null}

            {activeTab === "managed-account" ? (
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
            ) : null}

            {activeTab === "pending-password-reset-requests" ? (
              <PendingPasswordResetSection
                loading={pendingResetRequestsLoading}
                pagination={pendingResetRequestsPagination}
                query={pendingResetRequestsQuery}
                onQueryChange={onPendingResetRequestsQueryChange}
                onRefresh={onPendingResetRequestsRefresh}
                requests={pendingResetRequests}
              />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
