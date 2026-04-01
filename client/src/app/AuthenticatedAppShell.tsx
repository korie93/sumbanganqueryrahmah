import { Suspense, lazy, useEffect, useState } from "react";
import { AppPageRenderer } from "@/app/AppPageRenderer";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { PageSpinner } from "@/app/PageSpinner";
import { ChangePasswordPage } from "@/app/lazy-pages";
import type {
  AppRuntimeConfig,
  MonitorSection,
  MonitorSectionVisibility,
  TabVisibility,
  User,
} from "@/app/types";
import AutoLogout from "@/components/AutoLogout";
import Navbar from "@/components/Navbar";
import { AIProvider } from "@/context/AIContext";
import "./AuthenticatedAppShell.css";

const FloatingAI = lazy(() => import("@/components/FloatingAI"));

type AuthenticatedAppShellProps = {
  user: User;
  currentPage: string;
  monitorSection: MonitorSection;
  selectedImportId?: string;
  runtimeConfig: AppRuntimeConfig;
  tabVisibility: TabVisibility;
  tabVisibilityLoaded: boolean;
  monitorVisibility: MonitorSectionVisibility;
  featureLockdown: boolean;
  savedCount?: number;
  systemName?: string;
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
  const [floatingAiReady, setFloatingAiReady] = useState(false);

  useEffect(() => {
    if (!runtimeConfig.aiEnabled || floatingAiReady) return;

    let cancelled = false;
    let fallbackTimeoutId: number | null = null;
    let idleCallbackId: number | null = null;

    const markReady = () => {
      if (cancelled) return;
      setFloatingAiReady(true);
    };

    fallbackTimeoutId = window.setTimeout(markReady, 1200);

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(markReady, { timeout: 1500 });
    }

    return () => {
      cancelled = true;
      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
      }
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, [floatingAiReady, runtimeConfig.aiEnabled]);

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
      <div className="viewport-min-height bg-background">
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
          systemName={systemName}
          savedCount={savedCount}
          tabVisibility={tabVisibility}
          featureLockdown={featureLockdown}
        />
        <AppRouteErrorBoundary
          routeKey={`${currentPage}:${monitorSection}:${selectedImportId || ""}`}
          routeLabel={currentPage}
          onNavigateHome={onNavigateHome}
        >
          <Suspense fallback={<PageSpinner />}>
            <main className="app-shell-min-height">
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
                onNavigate={onNavigate}
                onMonitorSectionChange={onMonitorSectionChange}
              />
            </main>
          </Suspense>
        </AppRouteErrorBoundary>
        {runtimeConfig.aiEnabled && currentPage !== "ai" && floatingAiReady ? (
          <Suspense fallback={null}>
            <FloatingAI
              timeoutMs={runtimeConfig.aiTimeoutMs}
              aiEnabled={runtimeConfig.aiEnabled}
              activePage={currentPage}
            />
          </Suspense>
        ) : null}
      </div>
    </AIProvider>
  );
}
