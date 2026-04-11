import { Suspense, lazy, useEffect, useState } from "react";
import { AppPageRenderer } from "@/app/AppPageRenderer";
import { prefetchNavigationTarget, resolvePredictivePrefetchTargets } from "@/app/navigation-prefetch";
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
import { scheduleIdlePreload } from "@/lib/lazy-with-preload";
import "./AuthenticatedAppShell.css";

const FloatingAI = lazy(() => import("@/components/FloatingAI"));
const FLOATING_AI_FALLBACK_READY_DELAY_MS = 1_200;
const FLOATING_AI_IDLE_READY_TIMEOUT_MS = 1_500;
const NAVIGATION_PREFETCH_IDLE_DELAY_MS = 900;

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

    fallbackTimeoutId = window.setTimeout(markReady, FLOATING_AI_FALLBACK_READY_DELAY_MS);

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(markReady, {
        timeout: FLOATING_AI_IDLE_READY_TIMEOUT_MS,
      });
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

  useEffect(() => {
    const targets = resolvePredictivePrefetchTargets({
      currentPage,
      featureLockdown,
      monitorSection,
      tabVisibility,
      userRole: user.role,
    });
    if (targets.length === 0) {
      return;
    }

    let cancelled = false;
    const cancelIdlePreload = scheduleIdlePreload(async () => {
      for (const target of targets) {
        if (cancelled) {
          return;
        }
        await prefetchNavigationTarget(target);
      }
    }, NAVIGATION_PREFETCH_IDLE_DELAY_MS);

    return () => {
      cancelled = true;
      cancelIdlePreload();
    };
  }, [currentPage, featureLockdown, monitorSection, tabVisibility, user.role]);

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
