import { Suspense, lazy, useEffect } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { applyDocumentMetadata, resolveDocumentMetadata } from "@/app/document-metadata";
import { AppProviders } from "@/app/AppProviders";
import {
  ActivateAccountPage,
  BannedPage,
  ForgotPasswordPage,
  LandingPage,
  LoginPage,
  MaintenanceRoutePage,
  ResetPasswordPage,
  SingleTabBlockedPage,
} from "@/app/lazy-pages";
import { PageSpinner } from "@/app/PageSpinner";
import { useSingleTabSession } from "@/app/useSingleTabSession";
import { useAppShellState } from "@/app/useAppShellState";
import { isBannedSessionFlagSet } from "@/lib/auth-session";

const AuthenticatedAppShell = lazy(() => import("@/app/AuthenticatedAppShell"));

function AppContent() {
  const {
    currentPage,
    featureLockdown,
    handleClientLogout,
    handleLoginSuccess,
    handleLogout,
    handleMonitorSectionChange,
    handleNavigate,
    isInitialized,
    monitorSection,
    monitorVisibility,
    runtimeConfig,
    savedCount,
    selectedImportId,
    systemName,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  } = useAppShellState();

  const navigateHome = () => {
    if (!user) {
      handleNavigate("login");
      return;
    }

    handleNavigate(user.role === "user" ? "general-search" : "home");
  };

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

  const {
    isBlocked: isSingleTabBlocked,
    isReady: isSingleTabReady,
    retryNow: retrySingleTabLock,
  } = useSingleTabSession(user?.username);

  const renderRoutePage = (routeKey: string, node: React.ReactNode, fullscreen = true) => (
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

  if (!isInitialized) {
    return <PageSpinner fullscreen />;
  }

  if (isBannedSessionFlagSet()) {
    return renderRoutePage("banned", <BannedPage />);
  }

  if (!user) {
    if (currentPage === "home") {
      return renderRoutePage(
        "home",
        <LandingPage onLoginClick={() => handleNavigate("login")} />,
      );
    }

    if (currentPage === "maintenance") {
      return renderRoutePage("maintenance", <MaintenanceRoutePage />);
    }

    if (currentPage === "forgot-password") {
      return renderRoutePage("forgot-password", <ForgotPasswordPage />);
    }

    if (currentPage === "activate-account") {
      return renderRoutePage("activate-account", <ActivateAccountPage />);
    }

    if (currentPage === "reset-password") {
      return renderRoutePage("reset-password", <ResetPasswordPage />);
    }

    return renderRoutePage("login", <LoginPage onLoginSuccess={handleLoginSuccess} />);
  }

  if (!isSingleTabReady) {
    return <PageSpinner fullscreen />;
  }

  if (isSingleTabBlocked) {
    return renderRoutePage(
      "single-tab-blocked",
      <SingleTabBlockedPage onRetry={retrySingleTabLock} />,
    );
  }

  if (currentPage === "maintenance" && user.role === "user") {
    return renderRoutePage("maintenance", <MaintenanceRoutePage />);
  }

  return (
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
  );
}

function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

export default App;
