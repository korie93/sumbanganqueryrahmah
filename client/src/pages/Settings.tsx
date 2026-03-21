import { useEffect, useMemo, useState } from "react";
import { ACTIVE_SETTINGS_SECTION_KEY } from "@/app/constants";
import { replaceHistory } from "@/app/routing";
import type { TabVisibility } from "@/app/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BackupRestore from "@/pages/BackupRestore";
import { AccountSecuritySection } from "@/pages/settings/AccountSecuritySection";
import { ManagedUserDialog } from "@/pages/settings/ManagedUserDialog";
import { ManagedSecretDialog } from "@/pages/settings/ManagedSecretDialog";
import { SettingsRoleSections } from "@/pages/settings/SettingsRoleSections";
import { SettingsSaveBar } from "@/pages/settings/SettingsSaveBar";
import { SettingsSidebar } from "@/pages/settings/SettingsSidebar";
import { UserAccountManagementSection } from "@/pages/settings/UserAccountManagementSection";
import { useSettingsController } from "@/pages/settings/useSettingsController";

type SettingsPageProps = {
  tabVisibility?: TabVisibility;
  initialSectionId?: string;
};

export default function SettingsPage({
  tabVisibility,
  initialSectionId,
}: SettingsPageProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const requestedSection = useMemo(() => {
    if (typeof window === "undefined") return initialSectionId;
    const sectionFromUrl = new URLSearchParams(window.location.search).get("section");
    return sectionFromUrl || initialSectionId || localStorage.getItem(ACTIVE_SETTINGS_SECTION_KEY) || undefined;
  }, [initialSectionId]);

  const controller = useSettingsController({
    initialSectionId: requestedSection,
    tabVisibility,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !controller.selectedCategory) return;
    localStorage.setItem(ACTIVE_SETTINGS_SECTION_KEY, controller.selectedCategory);
    replaceHistory(`/settings?section=${encodeURIComponent(controller.selectedCategory)}`);
  }, [controller.selectedCategory]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [controller.selectedCategory]);

  if (
    controller.loadingState.profileLoading ||
    ((controller.canEditSystemSettings || controller.canAccessBackupSection) && controller.loadingState.loading)
  ) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
        <div className="mx-auto max-w-7xl">
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">
              {controller.loadingState.profileLoading
                ? "Loading account profile..."
                : "Loading system settings..."}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!controller.currentUser) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
        <div className="mx-auto max-w-7xl">
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">
              Unable to load account profile.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        {!controller.canEditSystemSettings && !controller.canAccessBackupSection ? (
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">
              No settings or backup tools are available for this account.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border/60 bg-background/75 shadow-sm">
              <CardHeader className="py-4">
                <CardTitle className="text-2xl">
                  {controller.currentCategory?.name || "System Settings"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {controller.currentCategory?.description ||
                    "Enterprise system configuration with role-based access and audit."}
                </p>
              </CardHeader>
            </Card>

            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start">
              <SettingsSidebar
                categories={controller.categories}
                categoryDirtyMap={controller.categoryDirtyMap}
                mobileOpen={mobileSidebarOpen}
                onMobileOpenChange={setMobileSidebarOpen}
                onSelectCategory={controller.setSelectedCategory}
                onSidebarCollapsedChange={setSidebarCollapsed}
                selectedCategory={controller.selectedCategory}
                sidebarCollapsed={sidebarCollapsed}
              />

              <div className="min-w-0 flex-1 space-y-4">
                {controller.isBackupCategory ? (
                  <BackupRestore userRole={controller.currentUserRole} embedded />
                ) : controller.isSecurityCategory &&
                  controller.canAccessAccountSecurity ? (
                    <AccountSecuritySection {...controller.security} showAccountManagement={false} />
                  ) : controller.isAccountManagementCategory ? (
                    <UserAccountManagementSection {...controller.accountManagement} />
                  ) : controller.isRolePermissionCategory ? (
                    <SettingsRoleSections
                      renderSettingCard={controller.renderSettingCard}
                      roleSections={controller.roleSections}
                    />
                  ) : (
                    (controller.currentCategory?.settings || []).map(
                      controller.renderSettingCard,
                    )
                  )}

                {!controller.isAccountManagementCategory && !controller.isBackupCategory ? (
                  <SettingsSaveBar {...controller.saveBar} />
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      <ManagedUserDialog {...controller.managedDialog} />
      <ManagedSecretDialog {...controller.managedSecretDialog} />
    </div>
  );
}
