import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountSecuritySection } from "@/pages/settings/AccountSecuritySection";
import { ManagedUserDialog } from "@/pages/settings/ManagedUserDialog";
import { ManagedSecretDialog } from "@/pages/settings/ManagedSecretDialog";
import { SettingsRoleSections } from "@/pages/settings/SettingsRoleSections";
import { SettingsSaveBar } from "@/pages/settings/SettingsSaveBar";
import { SettingsSidebar } from "@/pages/settings/SettingsSidebar";
import { useSettingsController } from "@/pages/settings/useSettingsController";

export default function SettingsPage() {
  const controller = useSettingsController();

  if (
    controller.loadingState.profileLoading ||
    (controller.canEditSystemSettings && controller.loadingState.loading)
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
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {!controller.canEditSystemSettings ? (
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">
              Hanya admin dan superuser dibenarkan mengakses Settings.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-12 gap-6">
            <SettingsSidebar
              categories={controller.categories}
              categoryDirtyMap={controller.categoryDirtyMap}
              onSelectCategory={controller.setSelectedCategory}
              selectedCategory={controller.selectedCategory}
            />

            <div className="col-span-12 space-y-4 lg:col-span-9">
              <Card className="border-border/60 bg-background/70">
                <CardHeader>
                  <CardTitle className="text-2xl">
                    {controller.currentCategory?.name || "System Settings"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {controller.currentCategory?.description ||
                      "Enterprise system configuration with role-based access and audit."}
                  </p>
                </CardHeader>
              </Card>

              {controller.isSecurityCategory &&
              controller.canAccessAccountSecurity ? (
                <AccountSecuritySection {...controller.security} />
              ) : null}

              {controller.isRolePermissionCategory ? (
                <SettingsRoleSections
                  renderSettingCard={controller.renderSettingCard}
                  roleSections={controller.roleSections}
                />
              ) : (
                (controller.currentCategory?.settings || []).map(
                  controller.renderSettingCard,
                )
              )}

              <SettingsSaveBar {...controller.saveBar} />
            </div>
          </div>
        )}
      </div>

      <ManagedUserDialog {...controller.managedDialog} />
      <ManagedSecretDialog {...controller.managedSecretDialog} />
    </div>
  );
}
