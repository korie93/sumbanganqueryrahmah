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
import { resolveAuthenticatedRoleHomePage } from "@/app/role-home-page";

function markAppReadyAndRemoveBootShell() {
  document.documentElement.classList.add("app-ready");
  document.body.classList.add("app-ready");
  document.getElementById("boot-shell")?.remove();
}

function focusMainContent(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const mainContent = document.getElementById("main-content");
  if (!mainContent) {
    return;
  }
  mainContent.focus({ preventScroll: true });
  mainContent.scrollIntoView({ block: "start" });
  window.history.replaceState(null, "", "#main-content");
}

function AppReadySignal() {
  useEffect(() => {
    const frameId = window.requestAnimationFrame(markAppReadyAndRemoveBootShell);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return null;
}

function AppContent() {
  const {
    currentPage,
    handleAuthenticatedLogout,
    handleBannedRetryLogin,
    handleBannedSessionDetected,
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
    let cancelIdlePreload: (() => void) | undefined;
    if (isInitialized && !user && currentPage === "forgot-password") {
      cancelIdlePreload = scheduleIdlePreload(() => {
        LoginPage.preload();
      }, 700);
    }

    return cancelIdlePreload;
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

  const handleAuthenticatedNavigateHome = () => {
    handlePublicNavigate(resolveAuthenticatedRoleHomePage(user?.role));
  };

  if (!isInitialized) {
    return <PageSpinner fullscreen />;
  }

  if (isBannedSessionFlagSet()) {
    return renderRoutePage("banned", <BannedPage onRetryLogin={handleBannedRetryLogin} />);
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
      return renderRoutePage(
        "forgot-password",
        (
          <ForgotPasswordPage
            onBackToHome={() => handlePublicNavigate("home")}
            onBackToLogin={() => handlePublicNavigate("login")}
          />
        ),
      );
    }

    if (currentPage === "activate-account") {
      return renderRoutePage(
        "activate-account",
        <ActivateAccountPage onBackToLogin={() => handlePublicNavigate("login")} />,
      );
    }

    if (currentPage === "reset-password") {
      return renderRoutePage(
        "reset-password",
        (
          <ResetPasswordPage
            onBackToHome={() => handlePublicNavigate("home")}
            onBackToLogin={() => handlePublicNavigate("login")}
          />
        ),
      );
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

    return renderRoutePage(
      "login",
      (
        <LoginPage
          onBanned={handleBannedSessionDetected}
          onForgotPasswordClick={() => handlePublicNavigate("forgot-password")}
          onLandingClick={() => handlePublicNavigate("home")}
          onLoginSuccess={handleLoginSuccess}
        />
      ),
    );
  }

  return (
    <AppRouteErrorBoundary
      routeKey={`authenticated-entry:${currentPage}:${monitorSection}`}
      routeLabel={currentPage}
      fullscreen
      onNavigateHome={handleAuthenticatedNavigateHome}
    >
      <Suspense fallback={<PageSpinner fullscreen />}>
        <AuthenticatedAppEntry
          initialUser={user}
          initialPage={currentPage}
          initialMonitorSection={monitorSection}
          onLoggedOut={handleAuthenticatedLogout}
        />
      </Suspense>
    </AppRouteErrorBoundary>
  );
}

function App() {
  return (
    <>
      <AppReadySignal />
      <a
        aria-label="Skip to main content"
        className="skip-to-main-link"
        href="#main-content"
        onClick={focusMainContent}
      >
        Langkau ke kandungan utama
      </a>
      <AppContent />
    </>
  );
}

export default App;
