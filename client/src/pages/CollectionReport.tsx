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
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  COLLECTION_STAFF_NICKNAME_KEY,
  getCurrentRole,
  getCurrentUsername,
} from "@/pages/collection/utils";
import { CollectionReportContent } from "@/pages/collection-report/CollectionReportContent";
import { CollectionSidebar } from "@/pages/collection-report/CollectionSidebar";
import { useCollectionNicknameAccess } from "@/pages/collection-report/useCollectionNicknameAccess";
import { useCollectionReportNavigation } from "@/pages/collection-report/useCollectionReportNavigation";

const CollectionNicknameDialog = lazy(() =>
  import("@/pages/collection-report/CollectionNicknameDialog").then((module) => ({
    default: module.CollectionNicknameDialog,
  })),
);

export default function CollectionReport() {
  const isMobile = useIsMobile();
  const role = useMemo(() => getCurrentRole(), []);
  const currentUsername = useMemo(() => getCurrentUsername(), []);
  const isSuperuser = role === "superuser";
  const canAccessNicknameSummary = role === "admin" || role === "superuser";
  const requiresNicknamePassword = role === "admin" || role === "user";

  const nicknameAccess = useCollectionNicknameAccess({
    currentUsername,
    isSuperuser,
    requiresNicknamePassword,
    role,
  });
  const navigation = useCollectionReportNavigation({
    canAccessNicknameSummary,
    isSuperuser,
  });

  const redirectToSearchTab = useCallback(() => {
    nicknameAccess.clearNicknameSession();
    localStorage.setItem("activeTab", "general-search");
    localStorage.setItem("lastPage", "general-search");
    if (typeof window !== "undefined") {
      window.location.assign("/");
    }
  }, [nicknameAccess]);

  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      nicknameAccess.setNicknameDialogOpen(true);
      return;
    }
    if (!isSuperuser && !nicknameAccess.canAccessCollection) {
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
  const subtitle = isMobile
    ? `Staff Nickname: ${nicknameAccess.staffNickname || "-"}`
    : `Staff Nickname: ${nicknameAccess.staffNickname || "-"} | Section: ${sectionLabel}`;
  const shouldRenderNicknameDialog =
    nicknameAccess.nicknameDialogOpen || (!isSuperuser && !nicknameAccess.canAccessCollection);

  return (
    <OperationalPage width="wide">
      <OperationalPageHeader
        title="Collection Report"
        eyebrow="Operational Workspace"
        description={subtitle}
        badge={
          isMobile ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
              {sectionLabel}
            </Badge>
          ) : undefined
        }
        className={isMobile ? "border-border/60 bg-background/92" : undefined}
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
            role={role}
            staffNickname={nicknameAccess.staffNickname}
            subPage={navigation.subPage}
            onOpenNicknameDialog={() => nicknameAccess.setNicknameDialogOpen(true)}
          />
        </div>
      </div>

      {shouldRenderNicknameDialog ? (
        <Suspense fallback={null}>
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
              nicknameAccess.setResolvedNickname(
                String(sessionStorage.getItem(COLLECTION_STAFF_NICKNAME_KEY) || "").trim(),
              );
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
