import { Suspense, useRef, useState } from "react";
import { AppPageRenderer } from "@/app/AppPageRenderer";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import MaintenanceModeBanner from "@/app/MaintenanceModeBanner";
import { PageSpinner } from "@/app/PageSpinner";
import { ChangePasswordPage } from "@/app/lazy-pages";
import { useDesktopSidebarPreference } from "@/app/useDesktopSidebarPreference";
import type {
  AppRuntimeConfig,
  MonitorSection,
  MonitorSectionVisibility,
  TabVisibility,
  User,
} from "@/app/types";
import AutoLogout from "@/components/AutoLogout";
import FloatingAILauncher from "@/components/FloatingAILauncher";
import Navbar from "@/components/Navbar";
import { NavbarUserMenuDropdown } from "@/components/NavbarParts";
import { AIProvider } from "@/context/AIContext";
import "@/components/GlassWrapper.css";
import "./AuthenticatedAppShell.css";
import "./workspace-navigation.css";

type AuthenticatedAppShellProps = {
  user: User;
  currentPage: string;
  monitorSection: MonitorSection;
  selectedImportId?: string | undefined;
  runtimeConfig: AppRuntimeConfig;
  tabVisibility: TabVisibility;
  tabVisibilityLoaded: boolean;
  monitorVisibility: MonitorSectionVisibility;
  featureLockdown: boolean;
  savedCount?: number | undefined;
  systemName?: string | undefined;
  onNavigate: (page: string, importId?: string) => void;
  onMonitorSectionChange: (section: MonitorSection) => void;
  onLogout: () => void | Promise<void>;
  onClientLogout: () => void;
  onNavigateHome: () => void;
};

export default function AuthenticatedAppShell({
  user,
  currentPage,
  monitorSection,
  selectedImportId,
  runtimeConfig,
  tabVisibility,
  tabVisibilityLoaded,
  monitorVisibility,
  featureLockdown,
  savedCount,
  systemName,
  onNavigate,
  onMonitorSectionChange,
  onLogout,
  onClientLogout,
  onNavigateHome,
}: AuthenticatedAppShellProps) {
  const { sidebarCollapsed, setSidebarCollapsed } = useDesktopSidebarPreference(user);
  const [passwordProfileOpen, setPasswordProfileOpen] = useState(false);
  const passwordProfileRef = useRef<HTMLButtonElement>(null);

  if (user.mustChangePassword) {
    return (
      <div className="viewport-min-height bg-background">
        <AutoLogout
          onClientLogout={onClientLogout}
          onLogout={onLogout}
          timeoutMinutes={runtimeConfig.sessionTimeoutMinutes}
          heartbeatIntervalMinutes={runtimeConfig.heartbeatIntervalMinutes}
          username={user.username}
        />
        <div className="flex justify-end px-4 pt-4">
          <div className="w-56 max-w-full">
          <NavbarUserMenuDropdown open={passwordProfileOpen} onOpenChange={setPasswordProfileOpen}
            triggerRef={passwordProfileRef} variant="mobile" username={user.username} userRole={user.role}
            canAccessSettings={false} onAccount={() => { setPasswordProfileOpen(false); onNavigate("account"); }}
            onSecurity={() => { setPasswordProfileOpen(false); onNavigate("security"); }}
            onSettings={() => {}} onLogout={onLogout} />
          </div>
        </div>
        <AppRouteErrorBoundary
          routeKey="change-password"
          routeLabel="change-password"
          fullscreen
          onNavigateHome={onNavigateHome}
        >
          <Suspense fallback={<PageSpinner fullscreen />}>
            <ChangePasswordPage forced username={user.username} />
          </Suspense>
        </AppRouteErrorBoundary>
      </div>
    );
  }

  return (
    <AIProvider>
      <div className="sqr-workspace viewport-min-height bg-background" data-sidebar-collapsed={sidebarCollapsed}>
        <AutoLogout
          onClientLogout={onClientLogout}
          onLogout={onLogout}
          timeoutMinutes={runtimeConfig.sessionTimeoutMinutes}
          heartbeatIntervalMinutes={runtimeConfig.heartbeatIntervalMinutes}
          username={user.username}
        />
        <Navbar
          currentPage={currentPage}
          monitorSection={monitorSection}
          onNavigate={onNavigate}
          onLogout={onLogout}
          userRole={user.role}
          username={user.username}
          avatarUrl={user.avatarUrl}
          systemName={systemName}
          savedCount={savedCount}
          tabVisibility={tabVisibility}
          featureLockdown={featureLockdown}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarCollapsedChange={setSidebarCollapsed}
        />
        <MaintenanceModeBanner userRole={user.role} />
        <AppRouteErrorBoundary
          routeKey={`${currentPage}:${monitorSection}:${selectedImportId || ""}`}
          routeLabel={currentPage}
          onNavigateHome={onNavigateHome}
        >
          <Suspense fallback={<PageSpinner />}>
            <main id="main-content" tabIndex={-1} className="app-shell-min-height">
              <AppPageRenderer
                user={user}
                currentPage={currentPage}
                monitorSection={monitorSection}
                selectedImportId={selectedImportId}
                runtimeConfig={runtimeConfig}
                tabVisibility={tabVisibility}
                tabVisibilityLoaded={tabVisibilityLoaded}
                monitorVisibility={monitorVisibility}
                featureLockdown={featureLockdown}
                systemName={systemName}
                onNavigate={onNavigate}
                onMonitorSectionChange={onMonitorSectionChange}
              />
            </main>
          </Suspense>
        </AppRouteErrorBoundary>
        {runtimeConfig.aiEnabled && currentPage !== "ai" ? (
          <FloatingAILauncher
            timeoutMs={runtimeConfig.aiTimeoutMs}
            aiEnabled={runtimeConfig.aiEnabled}
            activePage={currentPage}
            systemName={systemName}
          />
        ) : null}
      </div>
    </AIProvider>
  );
}
