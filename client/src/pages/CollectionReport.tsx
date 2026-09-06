import {
  Suspense,
  useCallback,
  lazy,
  useMemo,
} from "react";
import {
  OperationalPage,
  OperationalPageHeader,
} from "@/components/layout/OperationalPage";
import { LazyDialogFallback } from "@/components/LazySuspenseFallback";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage";
import {
  getCurrentRole,
  getCurrentUsername,
} from "@/pages/collection/utils";
import { getStoredCollectionNickname } from "@/pages/collection-report/utils";
import { CollectionReportContent } from "@/pages/collection-report/CollectionReportContent";
import { CollectionSidebar } from "@/pages/collection-report/CollectionSidebar";
import { useCollectionNicknameAccess } from "@/pages/collection-report/useCollectionNicknameAccess";
import { useCollectionReportNavigation } from "@/pages/collection-report/useCollectionReportNavigation";
import { canViewCollectionNicknameSummary } from "@shared/user-roles";

const CollectionNicknameDialog = lazy(() =>
  import("@/pages/collection-report/CollectionNicknameDialog").then((module) => ({
    default: module.CollectionNicknameDialog,
  })),
);

export default function CollectionReport() {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const role = useMemo(() => getCurrentRole(), []);
  const currentUsername = useMemo(() => getCurrentUsername(), []);
  const isSuperuser = role === "superuser";
  const isReadOnlyManager = role === "manager";
  const bypassesNicknameAccess = isSuperuser || isReadOnlyManager;
  const canAccessNicknameSummary = canViewCollectionNicknameSummary(role);
  const requiresNicknamePassword = role === "admin" || role === "user";

  const nicknameAccess = useCollectionNicknameAccess({
    bypassesNicknameAccess,
    currentUsername,
    requiresNicknamePassword,
    role,
  });
  const navigation = useCollectionReportNavigation({
    canAccessBilling: ["admin", "manager", "superuser"].includes(role),
    canAccessNicknameSummary,
    isReadOnlyManager,
    isSuperuser,
  });

  const redirectToSearchTab = useCallback(() => {
    nicknameAccess.clearNicknameSession();
    const storage = getBrowserLocalStorage();
    safeSetStorageItem(storage, "activeTab", "general-search");
    safeSetStorageItem(storage, "lastPage", "general-search");
    navigate("/");
  }, [navigate, nicknameAccess]);

  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      nicknameAccess.setNicknameDialogOpen(true);
      return;
    }
    if (!bypassesNicknameAccess && !nicknameAccess.canAccessCollection) {
      redirectToSearchTab();
      return;
    }
    nicknameAccess.setNicknameDialogOpen(false);
  };

  const primaryActionLabel =
    nicknameAccess.dialogStep === "setup"
      ? nicknameAccess.setupMode === "forced-change"
        ? "Set New Password"
        : "Save Password"
      : nicknameAccess.dialogStep === "login"
        ? "Login Nickname"
        : "Continue";
  const primaryLoadingLabel =
    nicknameAccess.dialogStep === "setup"
      ? nicknameAccess.setupMode === "forced-change"
        ? "Updating..."
        : "Saving..."
      : nicknameAccess.dialogStep === "login"
        ? "Signing In..."
        : "Checking...";
  const sectionLabel = navigation.activeSidebarItem?.label || "Choose a section";
  const staffNicknameLabel = nicknameAccess.staffNickname.trim();
  const headerActions = isMobile ? undefined : (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {staffNicknameLabel ? (
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-2xs">
          Staff Nickname: {staffNicknameLabel}
        </Badge>
      ) : null}
      <Badge variant="outline" className="rounded-full px-3 py-1 text-2xs">
        Section: {sectionLabel}
      </Badge>
    </div>
  );
  const subtitle = isMobile
    ? staffNicknameLabel
      ? `Staff Nickname: ${staffNicknameLabel}`
      : "Collection workspace for entry, records, summaries, and comparisons."
    : "Collection workspace for entry, records, summaries, and comparisons.";
  const shouldRenderNicknameDialog =
    navigation.subPage !== "billing-principal"
    && !nicknameAccess.checkingNicknameSession
    && (nicknameAccess.nicknameDialogOpen
      || (!bypassesNicknameAccess && !nicknameAccess.canAccessCollection));

  return (
    <OperationalPage width="wide">
      <OperationalPageHeader
        title="Collection Report"
        eyebrow="Operational Workspace"
        description={subtitle}
        badge={
          isMobile ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-2xs">
              {sectionLabel}
            </Badge>
          ) : undefined
        }
        actions={headerActions}
        className={isMobile ? "border-border/60 bg-background" : ""}
      />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start">
        <CollectionSidebar
          items={navigation.sidebarItems}
          mobileOpen={navigation.mobileSidebarOpen}
          onMobileOpenChange={navigation.setMobileSidebarOpen}
          onSelectSubPage={navigation.handleSelectSubPage}
          onSidebarCollapsedChange={navigation.setSidebarCollapsed}
          selectedSubPage={navigation.subPage}
          sidebarCollapsed={navigation.sidebarCollapsed}
        />

        <div className="min-w-0 flex-1">
          <CollectionReportContent
            canAccessCollection={nicknameAccess.canAccessCollection}
            checkingNicknameSession={nicknameAccess.checkingNicknameSession}
            nicknameReauthenticationRequired={nicknameAccess.nicknameReauthenticationRequired}
            onReauthenticateNickname={nicknameAccess.requestNicknameReauthentication}
            role={role}
            staffNickname={nicknameAccess.staffNickname}
            subPage={navigation.subPage}
            onOpenNicknameDialog={() => nicknameAccess.setNicknameDialogOpen(true)}
          />
        </div>
      </div>

      {shouldRenderNicknameDialog ? (
        <Suspense fallback={<LazyDialogFallback label="Loading collection nickname dialog..." />}>
          <CollectionNicknameDialog
            confirmNicknamePassword={nicknameAccess.confirmNicknamePassword}
            dialogStep={nicknameAccess.dialogStep}
            nicknameDialogOpen={nicknameAccess.nicknameDialogOpen}
            nicknameInput={nicknameAccess.nicknameInput}
            nicknamePassword={nicknameAccess.nicknamePassword}
            onConfirmNicknamePasswordChange={nicknameAccess.setConfirmNicknamePassword}
            onDialogOpenChange={handleDialogOpenChange}
            onNicknameInputChange={nicknameAccess.setNicknameInput}
            onNicknamePasswordChange={nicknameAccess.setNicknamePassword}
            onPrimaryAction={() => {
              if (nicknameAccess.dialogStep === "setup") {
                void nicknameAccess.handleSetupNicknamePassword();
                return;
              }
              if (nicknameAccess.dialogStep === "login") {
                void nicknameAccess.handleNicknameLogin();
                return;
              }
              void nicknameAccess.handleCheckNickname();
            }}
            onResetTemporaryValues={() => {
              nicknameAccess.setNicknamePassword("");
              nicknameAccess.setConfirmNicknamePassword("");
              nicknameAccess.setResolvedNickname(getStoredCollectionNickname());
              nicknameAccess.setShowLoginPassword(false);
              nicknameAccess.setShowSetupPassword(false);
              nicknameAccess.setShowSetupConfirmPassword(false);
            }}
            onReturnToSearch={redirectToSearchTab}
            onStepChange={nicknameAccess.setDialogStep}
            onToggleLoginPassword={() =>
              nicknameAccess.setShowLoginPassword(!nicknameAccess.showLoginPassword)
            }
            onToggleSetupConfirmPassword={() =>
              nicknameAccess.setShowSetupConfirmPassword(
                !nicknameAccess.showSetupConfirmPassword,
              )
            }
            onToggleSetupPassword={() =>
              nicknameAccess.setShowSetupPassword(!nicknameAccess.showSetupPassword)
            }
            primaryLabel={primaryActionLabel}
            primaryLoadingLabel={primaryLoadingLabel}
            resolvedNickname={nicknameAccess.resolvedNickname}
            setSetupModeFirstTime={() => nicknameAccess.setSetupMode("first-time")}
            setupMode={nicknameAccess.setupMode}
            showLoginPassword={nicknameAccess.showLoginPassword}
            showSetupConfirmPassword={nicknameAccess.showSetupConfirmPassword}
            showSetupPassword={nicknameAccess.showSetupPassword}
            submittingNicknameAuth={nicknameAccess.submittingNicknameAuth}
          />
        </Suspense>
      ) : null}
    </OperationalPage>
  );
}
