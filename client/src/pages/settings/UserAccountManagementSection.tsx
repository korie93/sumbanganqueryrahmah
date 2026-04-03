import { Suspense, lazy, useEffect, useState, useTransition } from "react";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { CreateClosedAccountSection } from "@/pages/settings/account-management/CreateClosedAccountSection";
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

const LocalMailOutboxSection = lazy(() =>
  import("@/pages/settings/account-management/LocalMailOutboxSection").then((module) => ({
    default: module.LocalMailOutboxSection,
  })),
);
const ManagedAccountsSection = lazy(() =>
  import("@/pages/settings/account-management/ManagedAccountsSection").then((module) => ({
    default: module.ManagedAccountsSection,
  })),
);
const PendingPasswordResetSection = lazy(() =>
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
  const isMobile = useIsMobile();
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
      <CardHeader className={isMobile ? "space-y-4 pb-4" : undefined}>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Users className="h-5 w-5" />
          User Account Management
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {isMobile
            ? "Manage closed accounts, mail previews, and reset requests in focused sections."
            : "Organize account creation, mail previews, managed users, and pending reset requests into focused sections without crowding the main Security page."}
        </p>
        {isMobile ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Accounts {managedUsersPagination.total}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Outbox {devMailOutboxPagination.total}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Reset Requests {pendingResetRequestsPagination.total}
            </Badge>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={isMobile ? "pt-0" : undefined}>
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
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
        </div>
      </CardContent>
    </Card>
  );
}
