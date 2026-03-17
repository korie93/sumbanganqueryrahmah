import {
  useCallback,
  useMemo,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COLLECTION_STAFF_NICKNAME_KEY,
  getCurrentRole,
  getCurrentUsername,
} from "@/pages/collection/utils";
import { CollectionReportContent } from "@/pages/collection-report/CollectionReportContent";
import { CollectionNicknameDialog } from "@/pages/collection-report/CollectionNicknameDialog";
import { CollectionSidebar } from "@/pages/collection-report/CollectionSidebar";
import { useCollectionNicknameAccess } from "@/pages/collection-report/useCollectionNicknameAccess";
import { useCollectionReportNavigation } from "@/pages/collection-report/useCollectionReportNavigation";

export default function CollectionReport() {
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
      ? "Save Password"
      : nicknameAccess.dialogStep === "login"
        ? "Login Nickname"
        : "Continue";
  const primaryLoadingLabel =
    nicknameAccess.dialogStep === "setup"
      ? "Saving..."
      : nicknameAccess.dialogStep === "login"
        ? "Signing In..."
        : "Checking...";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <Card className="border-border/60 bg-background/75 shadow-sm">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl leading-tight">
                  Collection Report
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Staff Nickname:{" "}
                  <span className="font-medium">
                    {nicknameAccess.staffNickname || "-"}
                  </span>
                  {navigation.activeSidebarItem ? (
                    <span>
                      {" | "}Section:{" "}
                      <span className="font-medium">
                        {navigation.activeSidebarItem.label}
                      </span>
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="relative flex items-start gap-4">
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
      </div>

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
    </div>
  );
}
