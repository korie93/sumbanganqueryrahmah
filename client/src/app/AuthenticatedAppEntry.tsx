import { Suspense, useEffect, type ReactNode } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { AppProviders } from "@/app/AppProviders";
import { PageSpinner } from "@/app/PageSpinner";
import { applyDocumentMetadata, resolveDocumentMetadata } from "@/app/document-metadata";
import { MaintenanceRoutePage, SingleTabBlockedPage } from "@/app/lazy-pages";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import type { MonitorSection, PageName, User } from "@/app/types";
import { initializeTrustedTypesRuntime } from "@/lib/trusted-types-runtime";
import { useAuthenticatedAppState } from "@/app/useAuthenticatedAppState";
import { useSingleTabSession } from "@/app/useSingleTabSession";
import "../index.css";

const AuthenticatedAppShell = lazyWithPreload(() => import("@/app/AuthenticatedAppShell"));
void AuthenticatedAppShell.preload();

// Authenticated surfaces rely on Radix/React portals and injected style tags more often
// than the public shell, so keep the Trusted Types compatibility policy scoped here.
initializeTrustedTypesRuntime();

type AuthenticatedAppEntryProps = {
  initialMonitorSection: MonitorSection;
  initialPage: PageName;
  initialUser: User;
  onLoggedOut: () => void;
};

export default function AuthenticatedAppEntry({
  initialMonitorSection,
  initialPage,
  initialUser,
  onLoggedOut,
}: AuthenticatedAppEntryProps) {
  const {
    currentPage,
    featureLockdown,
    handleClientLogout,
    handleLogout,
    handleMonitorSectionChange,
    handleNavigate,
    monitorSection,
    monitorVisibility,
    runtimeConfig,
    savedCount,
    selectedImportId,
    systemName,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  } = useAuthenticatedAppState({
    initialMonitorSection,
    initialPage,
    initialUser,
  });

  useEffect(() => {
    applyDocumentMetadata(
      resolveDocumentMetadata({
        currentPage,
        monitorSection,
        systemName,
        user,
      }),
    );
  }, [currentPage, monitorSection, systemName, user]);

  useEffect(() => {
    if (!user) {
      onLoggedOut();
    }
  }, [onLoggedOut, user]);

  const navigateHome = () => {
    if (!user) {
      handleNavigate("login");
      return;
    }

    handleNavigate(user.role === "user" ? "general-search" : "home");
  };

  const {
    isBlocked: isSingleTabBlocked,
    isReady: isSingleTabReady,
    retryNow: retrySingleTabLock,
  } = useSingleTabSession(user?.username);

  const renderRoutePage = (routeKey: string, node: ReactNode, fullscreen = true) => (
    <AppRouteErrorBoundary
      routeKey={routeKey}
      routeLabel={routeKey}
      fullscreen={fullscreen}
      onNavigateHome={navigateHome}
    >
      <Suspense fallback={<PageSpinner fullscreen={fullscreen} />}>
        {node}
      </Suspense>
    </AppRouteErrorBoundary>
  );

  if (!user) {
    return null;
  }

  if (!isSingleTabReady) {
    return <PageSpinner fullscreen />;
  }

  if (isSingleTabBlocked) {
    return (
      <AppProviders>
        {renderRoutePage(
          "single-tab-blocked",
          <SingleTabBlockedPage onRetry={retrySingleTabLock} />,
        )}
      </AppProviders>
    );
  }

  if (currentPage === "maintenance" && user.role === "user") {
    return <AppProviders>{renderRoutePage("maintenance", <MaintenanceRoutePage />)}</AppProviders>;
  }

  return (
    <AppProviders>
      <Suspense fallback={<PageSpinner fullscreen />}>
        <AuthenticatedAppShell
          user={user}
          currentPage={currentPage}
          monitorSection={monitorSection}
          selectedImportId={selectedImportId}
          runtimeConfig={runtimeConfig}
          tabVisibility={tabVisibility}
          tabVisibilityLoaded={tabVisibilityLoaded}
          monitorVisibility={monitorVisibility}
          featureLockdown={featureLockdown}
          savedCount={savedCount}
          systemName={systemName}
          onNavigate={handleNavigate}
          onMonitorSectionChange={handleMonitorSectionChange}
          onLogout={handleLogout}
          onClientLogout={handleClientLogout}
          onNavigateHome={navigateHome}
        />
      </Suspense>
    </AppProviders>
  );
}
