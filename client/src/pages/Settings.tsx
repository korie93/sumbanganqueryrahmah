import { Suspense, useEffect, useMemo, useState } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { ACTIVE_SETTINGS_SECTION_KEY } from "@/app/constants";
import { replaceHistory } from "@/app/routing";
import type { TabVisibility } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { getBrowserLocalStorage, safeGetStorageItem, safeSetStorageItem } from "@/lib/browser-storage";
import {
  OperationalPage,
  OperationalPageHeader,
  OperationalSectionCard,
} from "@/components/layout/OperationalPage";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { SettingsSaveBar } from "@/pages/settings/SettingsSaveBar";
import { SettingsSidebar } from "@/pages/settings/SettingsSidebar";
import { SettingsCriticalSaveDialog } from "@/pages/settings/SettingsCriticalSaveDialog";
import { MaintenanceSettingsNotice } from "@/pages/settings/MaintenanceSettingsNotice";
import { useSettingsController } from "@/pages/settings/useSettingsController";

type SettingsPageProps = {
  tabVisibility?: TabVisibility;
  initialSectionId?: string;
};

const BackupRestore = lazyWithPreload(() => import("@/pages/BackupRestore"));
const AccountSecuritySection = lazyWithPreload(() =>
  import("@/pages/settings/AccountSecuritySection").then((module) => ({
    default: module.AccountSecuritySection,
  })),
);
const SettingsRoleSections = lazyWithPreload(() =>
  import("@/pages/settings/SettingsRoleSections").then((module) => ({
    default: module.SettingsRoleSections,
  })),
);
const SettingsAccountManagementBoundary = lazyWithPreload(() =>
  import("@/pages/settings/SettingsAccountManagementBoundary").then((module) => ({
    default: module.SettingsAccountManagementBoundary,
  })),
);

function SettingsSectionFallback({ label }: { label: string }) {
  return (
    <OperationalSectionCard contentClassName="p-10 text-center text-muted-foreground">
      <div role="status" aria-live="polite">
        {label}
      </div>
    </OperationalSectionCard>
  );
}

export default function SettingsPage({
  tabVisibility,
  initialSectionId,
}: SettingsPageProps) {
  const isMobile = useIsMobile();
  const storage = getBrowserLocalStorage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const requestedSection = useMemo(() => {
    if (typeof window === "undefined") return initialSectionId;
    const sectionFromUrl = new URLSearchParams(window.location.search).get("section");
    return sectionFromUrl || initialSectionId || safeGetStorageItem(storage, ACTIVE_SETTINGS_SECTION_KEY) || undefined;
  }, [initialSectionId, storage]);

  const controller = useSettingsController({
    initialSectionId: requestedSection,
    tabVisibility,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !controller.selectedCategory) return;
    safeSetStorageItem(storage, ACTIVE_SETTINGS_SECTION_KEY, controller.selectedCategory);
    replaceHistory(`/settings?section=${encodeURIComponent(controller.selectedCategory)}`);
  }, [controller.selectedCategory, storage]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [controller.selectedCategory]);

  if (
    controller.loadingState.profileLoading ||
    ((controller.canEditSystemSettings || controller.canAccessBackupSection) && controller.loadingState.loading)
  ) {
    return (
      <OperationalPage width="content">
        <OperationalSectionCard contentClassName="p-10 text-center text-muted-foreground">
              {controller.loadingState.profileLoading
                ? "Loading account profile..."
                : "Loading system settings..."}
        </OperationalSectionCard>
      </OperationalPage>
    );
  }

  if (!controller.currentUser) {
    return (
      <OperationalPage width="content">
        <OperationalSectionCard contentClassName="p-10 text-center text-muted-foreground">
              Unable to load account profile.
        </OperationalSectionCard>
      </OperationalPage>
    );
  }

  return (
    <OperationalPage width="wide">
        {!controller.canEditSystemSettings && !controller.canAccessBackupSection ? (
          <OperationalSectionCard contentClassName="p-10 text-center text-muted-foreground">
              No settings or backup tools are available for this account.
          </OperationalSectionCard>
        ) : (
          <>
            <OperationalPageHeader
              title={controller.currentCategory?.name || "System Settings"}
              eyebrow="Administration"
              description={
                controller.currentCategory?.description ||
                (isMobile
                  ? "Manage system tools and protected admin sections from one place."
                  : "Enterprise system configuration with role-based access and audit.")
              }
              badge={
                isMobile ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                    {controller.categories.length} sections
                  </Badge>
                ) : null
              }
              className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
            />

            <div className="relative flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
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
                {controller.maintenanceSettingsSummary ? (
                  <MaintenanceSettingsNotice
                    summary={controller.maintenanceSettingsSummary}
                    currentUserRole={controller.currentUserRole}
                  />
                ) : null}

                <AppRouteErrorBoundary
                  routeKey={`settings:${controller.selectedCategory}`}
                  routeLabel={controller.currentCategory?.name || "settings"}
                  fullscreen={false}
                >
                  {controller.isBackupCategory ? (
                    <Suspense fallback={<SettingsSectionFallback label="Loading backup tools..." />}>
                      <BackupRestore userRole={controller.currentUserRole} embedded />
                    </Suspense>
                  ) : controller.isSecurityCategory &&
                    controller.canAccessAccountSecurity &&
                    controller.security ? (
                      <Suspense fallback={<SettingsSectionFallback label="Loading account security..." />}>
                        <AccountSecuritySection {...controller.security} />
                      </Suspense>
                    ) : controller.isAccountManagementCategory ? (
                      <Suspense fallback={<SettingsSectionFallback label="Loading account management..." />}>
                        <SettingsAccountManagementBoundary
                          confirmCriticalOpen={controller.criticalSaveDialog.confirmCriticalOpen}
                          isSuperuser={controller.isSuperuser}
                          onConfirmCriticalOpenChange={controller.criticalSaveDialog.onConfirmCriticalOpenChange}
                          onSaveCriticalSettings={controller.criticalSaveDialog.onSaveCriticalSettings}
                          saving={controller.criticalSaveDialog.saving}
                        />
                      </Suspense>
                    ) : controller.isRolePermissionCategory ? (
                      <Suspense fallback={<SettingsSectionFallback label="Loading permission settings..." />}>
                        <SettingsRoleSections
                          renderSettingCard={controller.renderSettingCard}
                          roleSections={controller.roleSections}
                        />
                      </Suspense>
                    ) : (
                      (controller.currentCategory?.settings || []).map(
                        controller.renderSettingCard,
                      )
                    )}
                </AppRouteErrorBoundary>

                {!controller.isAccountManagementCategory && !controller.isBackupCategory ? (
                  <>
                    <SettingsSaveBar {...controller.saveBar} />
                    <SettingsCriticalSaveDialog
                      open={controller.criticalSaveDialog.confirmCriticalOpen}
                      saving={controller.criticalSaveDialog.saving}
                      onOpenChange={controller.criticalSaveDialog.onConfirmCriticalOpenChange}
                      onConfirm={controller.criticalSaveDialog.onSaveCriticalSettings}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </>
        )}
    </OperationalPage>
  );
}
