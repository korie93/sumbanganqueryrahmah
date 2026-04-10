import { Suspense, useEffect } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { applyDocumentMetadata, resolveDocumentMetadata } from "@/app/document-metadata";
import {
  ActivateAccountPage,
  BannedPage,
  ForgotPasswordPage,
  LandingPage,
  LoginPage,
  MaintenanceRoutePage,
  NotFoundPage,
  ResetPasswordPage,
} from "@/app/lazy-pages";
import { PageSpinner } from "@/app/PageSpinner";
import { AuthenticatedAppEntry } from "@/app/authenticated-entry-lazy";
import { isBannedSessionFlagSet } from "@/lib/auth-session";
import { scheduleIdlePreload } from "@/lib/lazy-with-preload";
import LandingRouteFallback from "@/pages/LandingRouteFallback";
import { usePublicAppState } from "@/app/usePublicAppState";

function AppContent() {
  const {
    currentPage,
    handleAuthenticatedLogout,
    handleLoginSuccess,
    isInitialized,
    monitorSection,
    systemName,
    handlePublicNavigate,
    user,
  } = usePublicAppState();

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
    if (!isInitialized || user) {
      return;
    }

    if (currentPage === "home") {
      return scheduleIdlePreload(() => {
        LoginPage.preload();
      }, 700);
    }

    if (currentPage === "login") {
      return scheduleIdlePreload(() => {
        ForgotPasswordPage.preload();
      }, 250);
    }

    if (currentPage === "forgot-password") {
      return scheduleIdlePreload(() => {
        LoginPage.preload();
      }, 250);
    }

    return;
  }, [currentPage, isInitialized, user]);

  const renderRoutePage = (
    routeKey: string,
    node: React.ReactNode,
    fullscreen = true,
    fallback: React.ReactNode = <PageSpinner fullscreen={fullscreen} />,
  ) => (
    <AppRouteErrorBoundary
      routeKey={routeKey}
      routeLabel={routeKey}
      fullscreen={fullscreen}
      onNavigateHome={() => handlePublicNavigate("home")}
    >
      <Suspense fallback={fallback}>
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
        <LandingPage onLoginClick={() => handlePublicNavigate("login")} />,
        true,
        <LandingRouteFallback onLoginClick={() => handlePublicNavigate("login")} />,
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

    if (currentPage === "not-found") {
      return renderRoutePage(
        "not-found",
        (
          <NotFoundPage
            onNavigateHome={() => handlePublicNavigate("home")}
            onLoginClick={() => handlePublicNavigate("login")}
          />
        ),
      );
    }

    return renderRoutePage("login", <LoginPage onLoginSuccess={handleLoginSuccess} />);
  }

  return (
    <Suspense fallback={<PageSpinner fullscreen />}>
      <AuthenticatedAppEntry
        initialUser={user}
        initialPage={currentPage}
        initialMonitorSection={monitorSection}
        onLoggedOut={handleAuthenticatedLogout}
      />
    </Suspense>
  );
}

function App() {
  return <AppContent />;
}

export default App;
